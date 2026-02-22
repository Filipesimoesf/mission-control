import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { z } from 'zod';

import { openDb } from './db.js';
import { nowIso, uid, assertAllowed, MISSION_STATUSES, TASK_STATUSES, RISK } from './util.js';

const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.MC_DB_PATH || '/var/data/mission-control.sqlite';
const AUTH_TOKEN = process.env.MC_AUTH_TOKEN || '';
const ALLOWED_ORIGIN = process.env.MC_ALLOWED_ORIGIN || '*';

if (!AUTH_TOKEN) {
  // safer default: refuse to start without auth token
  console.error('Missing MC_AUTH_TOKEN. Refusing to start.');
  process.exit(1);
}

const db = openDb(DB_PATH);

const app = Fastify({ logger: true });
await app.register(helmet, { global: true });
await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl/server-to-server
    if (ALLOWED_ORIGIN === '*') return cb(null, true);
    const ok = origin === ALLOWED_ORIGIN;
    cb(ok ? null : new Error('Not allowed by CORS'), ok);
  },
  credentials: false,
});

// --- Auth hook
app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health') return;
  const h = req.headers['authorization'] || '';
  const ok = h === `Bearer ${AUTH_TOKEN}`;
  if (!ok) {
    reply.code(401).send({ error: 'unauthorized' });
  }
});

// --- SSE event subscribers
const sseClients = new Set();
function publishEvent(evt) {
  const line = `data: ${JSON.stringify(evt)}\n\n`;
  for (const res of sseClients) {
    try { res.write(line); } catch { /* ignore */ }
  }
}

function logEvent({ actor='SYSTEM', action='event', result='ok', message='', projectId=null, missionId=null, taskId=null }) {
  const evt = {
    id: uid('evt'),
    at: nowIso(),
    actor,
    action,
    result,
    message,
    projectId,
    missionId,
    taskId,
  };
  const stmt = db.prepare(`insert into event_logs (id, at, actor, action, result, message, projectId, missionId, taskId)
    values (@id,@at,@actor,@action,@result,@message,@projectId,@missionId,@taskId)`);
  stmt.run(evt);
  publishEvent(evt);
  return evt;
}

// --- Routes
app.get('/health', async () => ({ ok: true }));

app.get('/api/events/stream', async (req, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  });
  reply.raw.write('\n');
  sseClients.add(reply.raw);
  req.raw.on('close', () => sseClients.delete(reply.raw));
  return reply;
});

app.get('/api/events', async (req, reply) => {
  const limit = Math.min(Number(req.query.limit || 200), 500);
  const rows = db.prepare('select * from event_logs order by at desc limit ?').all(limit);
  return rows;
});

// Projects
app.get('/api/projects', async () => {
  return db.prepare('select * from projects order by updatedAt desc').all();
});

app.post('/api/projects', async (req, reply) => {
  const schema = z.object({ name: z.string().min(1).max(120), actor: z.string().optional() });
  const body = schema.parse(req.body);
  const t = nowIso();
  const row = { id: uid('proj'), name: body.name, createdAt: t, updatedAt: t };
  db.prepare('insert into projects (id,name,createdAt,updatedAt) values (@id,@name,@createdAt,@updatedAt)').run(row);
  logEvent({ actor: body.actor || 'FILIPE', action:'project.create', message:`Criou projeto: ${row.name}`, projectId: row.id });
  reply.code(201);
  return row;
});

// Missions (+ tasks inline via separate endpoint)
app.get('/api/missions', async (req) => {
  const projectId = req.query.projectId;
  if (projectId) {
    return db.prepare('select * from missions where projectId=? order by updatedAt desc').all(projectId);
  }
  return db.prepare('select * from missions order by updatedAt desc').all();
});

app.post('/api/missions', async (req, reply) => {
  const schema = z.object({
    projectId: z.string().min(1),
    title: z.string().min(1).max(200),
    objective: z.string().optional().default(''),
    status: z.string().default('Backlog'),
    risk: z.enum(['low','medium','high']).default('low'),
    costUsd: z.number().nullable().optional(),
    actor: z.string().optional(),
  });
  const body = schema.parse(req.body);
  assertAllowed(MISSION_STATUSES, body.status, 'status');

  const t = nowIso();
  const row = {
    id: uid('msn'),
    projectId: body.projectId,
    title: body.title,
    objective: body.objective || '',
    status: body.status,
    risk: body.risk,
    costUsd: body.costUsd ?? null,
    createdAt: t,
    updatedAt: t,
  };
  db.prepare(`insert into missions (id,projectId,title,objective,status,risk,costUsd,createdAt,updatedAt)
    values (@id,@projectId,@title,@objective,@status,@risk,@costUsd,@createdAt,@updatedAt)`).run(row);
  logEvent({ actor: body.actor || 'FILIPE', action:'mission.create', message:`Criou missão: "${row.title}" (${row.status})`, projectId: row.projectId, missionId: row.id });
  reply.code(201);
  return row;
});

app.patch('/api/missions/:id', async (req) => {
  const id = req.params.id;
  const schema = z.object({
    title: z.string().min(1).max(200).optional(),
    objective: z.string().optional(),
    status: z.string().optional(),
    risk: z.enum(['low','medium','high']).optional(),
    costUsd: z.number().nullable().optional(),
    actor: z.string().optional(),
  });
  const body = schema.parse(req.body);
  const cur = db.prepare('select * from missions where id=?').get(id);
  if (!cur) return { error: 'not_found' };
  if (body.status) assertAllowed(MISSION_STATUSES, body.status, 'status');

  const next = {
    ...cur,
    ...('title' in body ? { title: body.title } : {}),
    ...('objective' in body ? { objective: body.objective ?? '' } : {}),
    ...('status' in body ? { status: body.status } : {}),
    ...('risk' in body ? { risk: body.risk } : {}),
    ...('costUsd' in body ? { costUsd: body.costUsd } : {}),
    updatedAt: nowIso(),
  };
  db.prepare(`update missions set title=@title, objective=@objective, status=@status, risk=@risk, costUsd=@costUsd, updatedAt=@updatedAt where id=@id`).run(next);
  logEvent({ actor: body.actor || 'ALFRED', action:'mission.update', message:`"${cur.title}": atualizado`, projectId: cur.projectId, missionId: id });
  return next;
});

// Tasks
app.get('/api/missions/:id/tasks', async (req) => {
  const missionId = req.params.id;
  return db.prepare('select * from tasks where missionId=? order by updatedAt desc').all(missionId);
});

app.post('/api/missions/:id/tasks', async (req, reply) => {
  const missionId = req.params.id;
  const schema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().optional().default(''),
    status: z.string().default('Backlog'),
    critical: z.boolean().default(false),
    actor: z.string().optional(),
  });
  const body = schema.parse(req.body);
  assertAllowed(TASK_STATUSES, body.status, 'status');

  const mission = db.prepare('select * from missions where id=?').get(missionId);
  if (!mission) {
    reply.code(404);
    return { error: 'mission_not_found' };
  }

  const t = nowIso();
  const row = {
    id: uid('tsk'),
    missionId,
    title: body.title,
    description: body.description || '',
    status: body.status,
    critical: body.critical ? 1 : 0,
    createdAt: t,
    updatedAt: t,
  };
  db.prepare(`insert into tasks (id,missionId,title,description,status,critical,createdAt,updatedAt)
    values (@id,@missionId,@title,@description,@status,@critical,@createdAt,@updatedAt)`).run(row);

  // bump mission updatedAt
  db.prepare('update missions set updatedAt=? where id=?').run(t, missionId);

  logEvent({ actor: body.actor || 'FILIPE', action:'task.create', message:`"${mission.title}": nova task → ${row.title}`, projectId: mission.projectId, missionId, taskId: row.id });
  reply.code(201);
  return { ...row, critical: !!body.critical };
});

app.patch('/api/tasks/:id', async (req, reply) => {
  const id = req.params.id;
  const schema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    critical: z.boolean().optional(),
    actor: z.string().optional(),
  });
  const body = schema.parse(req.body);
  const cur = db.prepare('select * from tasks where id=?').get(id);
  if (!cur) {
    reply.code(404);
    return { error: 'not_found' };
  }
  if (body.status) assertAllowed(TASK_STATUSES, body.status, 'status');

  const next = {
    ...cur,
    ...('title' in body ? { title: body.title } : {}),
    ...('description' in body ? { description: body.description ?? '' } : {}),
    ...('status' in body ? { status: body.status } : {}),
    ...('critical' in body ? { critical: body.critical ? 1 : 0 } : {}),
    updatedAt: nowIso(),
  };
  db.prepare(`update tasks set title=@title, description=@description, status=@status, critical=@critical, updatedAt=@updatedAt where id=@id`).run(next);

  const mission = db.prepare('select * from missions where id=?').get(cur.missionId);
  if (mission) {
    db.prepare('update missions set updatedAt=? where id=?').run(next.updatedAt, mission.id);
    logEvent({ actor: body.actor || 'ALFRED', action:'task.update', message:`"${mission.title}": task "${cur.title}" → atualizado`, projectId: mission.projectId, missionId: mission.id, taskId: id });
  }

  return { ...next, critical: !!next.critical };
});

// Approvals
app.get('/api/missions/:id/approvals', async (req) => {
  const missionId = req.params.id;
  return db.prepare('select * from approvals where missionId=? order by updatedAt desc').all(missionId);
});

app.post('/api/approvals', async (req, reply) => {
  const schema = z.object({
    missionId: z.string().optional(),
    taskId: z.string().optional(),
    title: z.string().min(1).max(200),
    requestedBy: z.string().default('ALFRED'),
    actor: z.string().optional(),
  }).refine(x => x.missionId || x.taskId, { message: 'missionId ou taskId é obrigatório' });
  const body = schema.parse(req.body);
  const t = nowIso();
  const row = {
    id: uid('apv'),
    missionId: body.missionId ?? null,
    taskId: body.taskId ?? null,
    title: body.title,
    state: 'requested',
    requestedBy: body.requestedBy,
    requestedAt: t,
    approvedAt: null,
    createdAt: t,
    updatedAt: t,
  };
  db.prepare(`insert into approvals (id,missionId,taskId,title,state,requestedBy,requestedAt,approvedAt,createdAt,updatedAt)
    values (@id,@missionId,@taskId,@title,@state,@requestedBy,@requestedAt,@approvedAt,@createdAt,@updatedAt)`).run(row);

  // for logging, find project linkage
  let projectId = null, missionId = body.missionId ?? null, taskId = body.taskId ?? null;
  if (taskId && !missionId) {
    const tsk = db.prepare('select * from tasks where id=?').get(taskId);
    missionId = tsk?.missionId ?? null;
  }
  if (missionId) {
    const m = db.prepare('select * from missions where id=?').get(missionId);
    projectId = m?.projectId ?? null;
  }
  logEvent({ actor: body.actor || 'ALFRED', action:'approval.request', message:`Approval solicitado → ${row.title}`, projectId, missionId, taskId });

  reply.code(201);
  return row;
});

app.post('/api/approvals/:id/approve', async (req) => {
  const id = req.params.id;
  const schema = z.object({ actor: z.string().default('FILIPE') });
  const body = schema.parse(req.body || {});
  const cur = db.prepare('select * from approvals where id=?').get(id);
  if (!cur) return { error: 'not_found' };
  const t = nowIso();
  const next = { ...cur, state:'approved', approvedAt: t, updatedAt: t };
  db.prepare('update approvals set state=@state, approvedAt=@approvedAt, updatedAt=@updatedAt where id=@id').run(next);

  // log
  let projectId = null;
  if (cur.missionId) projectId = db.prepare('select projectId from missions where id=?').get(cur.missionId)?.projectId ?? null;
  logEvent({ actor: body.actor, action:'approval.approve', message:`Aprovado → ${cur.title}`, projectId, missionId: cur.missionId ?? null, taskId: cur.taskId ?? null });
  return next;
});

// Seed helper (optional)
app.post('/api/seed/vivaplus', async (req, reply) => {
  const schema = z.object({ actor: z.string().optional() });
  const body = schema.parse(req.body || {});
  const actor = body.actor || 'ALFRED';

  const t = nowIso();
  const projectId = uid('proj');
  db.prepare('insert into projects (id,name,createdAt,updatedAt) values (?,?,?,?)').run(projectId, 'Viva+ (Organiza Saúde)', t, t);

  const m1 = uid('msn');
  db.prepare(`insert into missions (id,projectId,title,objective,status,risk,costUsd,createdAt,updatedAt)
    values (?,?,?,?,?,?,?,?,?)`).run(m1, projectId, 'Viva+ — Kickoff / Definição do MVP',
      'Definir público-alvo, proposta de valor, MVP e backlog priorizado.',
      'Doing', 'medium', 0.5, t, t);

  const tasks = [
    { title:'Definir persona + dor primária', description:'Quem é o usuário 1? qual dor? qual ganho? ', status:'Doing', critical:0 },
    { title:'Definir proposta de valor (1 frase)', description:'Promessa + mecanismo + evidência', status:'Backlog', critical:0 },
    { title:'Decidir escopo do MVP (fora do escopo incluso)', description:'O que NÃO vai ter', status:'Backlog', critical:0 },
    { title:'Checklist LGPD/saúde (dados sensíveis)', description:'Definir o que não coletar no MVP', status:'Needs Info', critical:1 },
  ];
  const insTask = db.prepare(`insert into tasks (id,missionId,title,description,status,critical,createdAt,updatedAt)
    values (?,?,?,?,?,?,?,?)`);
  for (const x of tasks) {
    insTask.run(uid('tsk'), m1, x.title, x.description, x.status, x.critical, t, t);
  }

  logEvent({ actor, action:'seed.vivaplus', message:'Seed Viva+ criado', projectId, missionId: m1 });
  reply.code(201);
  return { projectId, missionId: m1 };
});

app.setErrorHandler((err, req, reply) => {
  req.log.error(err);
  reply.code(err.statusCode || 500).send({ error: err.message || 'internal_error' });
});

app.listen({ port: PORT, host: '0.0.0.0' });
