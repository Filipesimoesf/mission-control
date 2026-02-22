/* Mission Control MVP
   - purely static + LocalStorage persistence
   - no backend yet
*/

const STORAGE_KEY = 'mission-control.mvp.v1';

const STATUS_COLUMNS = [
  { key: 'Backlog', label: 'Backlog' },
  { key: 'Doing', label: 'Doing' },
  { key: 'Review', label: 'Review' },
  { key: 'Done', label: 'Done' },
  { key: 'Blocked', label: 'Blocked' },
  { key: 'Needs Approval', label: 'Needs Approval' },
  { key: 'Needs Info', label: 'Needs Info' },
];

const TASK_STATUSES = ['Backlog','Doing','Review','Done','Blocked','Needs Approval','Needs Info'];

function nowIso(){ return new Date().toISOString(); }
function shortTs(iso){
  const d = new Date(iso);
  return d.toLocaleString(undefined, { hour12:false });
}
function uid(prefix='id'){
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function seed(){
  const projectId = uid('proj');
  const missions = [
    {
      id: uid('msn'), projectId,
      title: 'Definir MVP do Mission Control',
      objective: 'Desenhar o MVP (UI + entidades + estados) e validar com o Filipe.',
      status: 'Doing',
      risk: 'low',
      costUsd: 0.30,
      checklist: [
        { id: uid('chk'), text: 'Extrair essentials dos exemplos', done: true },
        { id: uid('chk'), text: 'Esboçar UI Kanban + Feed + Agentes', done: true },
        { id: uid('chk'), text: 'Separar Mission vs Task + estados completos', done: false },
      ],
      tasks: [
        { id: uid('tsk'), title: 'Definir estados (incl. control states)', description: 'Backlog/Doing/Review/Done + Blocked/Needs Approval/Needs Info', status: 'Doing', critical: false },
        { id: uid('tsk'), title: 'Desenhar fluxo de approvals (OK EXECUTAR)', description: 'Gates para passos críticos (deploy, pagamentos, etc.)', status: 'Needs Approval', critical: true },
      ],
      links: [
        { id: uid('lnk'), title: 'Referência (artigo)', url: 'https://x.com/pbteja1998/article/2017662163540971756' },
      ],
      artifacts: [
        { id: uid('art'), title: 'Extraction essentials', kind: 'file', ref: './artifacts/extraction-essentials.md' },
      ],
      approvals: [
        { id: uid('apv'), title: 'Aprovar arquitetura do MVP', state: 'requested', requestedBy: 'ALFRED', requestedAt: nowIso(), approvedAt: null },
      ],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: uid('msn'), projectId,
      title: 'Implementar backend (v1)',
      objective: 'Persistência real + multi-usuário + EventLog imutável + approvals persistentes.',
      status: 'Backlog',
      risk: 'medium',
      costUsd: 1.50,
      checklist: [
        { id: uid('chk'), text: 'Escolher stack (SQLite + API)', done: false },
        { id: uid('chk'), text: 'Modelo de dados (Project/Mission/Task/Run/...)', done: false },
        { id: uid('chk'), text: 'Event stream (SSE/WebSocket)', done: false },
      ],
      tasks: [
        { id: uid('tsk'), title: 'Escolher stack do backend', description: 'Node/Express/Fastify + SQLite (ou alternativa)', status: 'Backlog', critical: false },
      ],
      links: [],
      artifacts: [],
      approvals: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
  ];

  const agents = [
    { id: uid('agt'), name: 'ALFRED', role: 'Coordinator / Validator', state: 'active', workingOn: missions[0].id },
    { id: uid('agt'), name: 'ARCHITECT', role: 'System design', state: 'idle', workingOn: null },
    { id: uid('agt'), name: 'DEV', role: 'Implementation', state: 'idle', workingOn: null },
    { id: uid('agt'), name: 'SECURITY', role: 'Threat modeling', state: 'idle', workingOn: null },
    { id: uid('agt'), name: 'QA', role: 'Test scenarios', state: 'idle', workingOn: null },
    { id: uid('agt'), name: 'INFRA', role: 'Deploy/hosting', state: 'idle', workingOn: null },
    { id: uid('agt'), name: 'DOCS', role: 'Documentation', state: 'idle', workingOn: null },
  ];

  const eventLog = [
    { id: uid('evt'), at: nowIso(), actor: 'SYSTEM', action: 'seed', result: 'ok', message: 'Workspace inicial carregado (MVP local).' },
  ];

  return {
    projects: [ { id: projectId, name: 'Projeto X (demo)' } ],
    agents,
    missions,
    eventLog,
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return seed();
    return JSON.parse(raw);
  }catch(e){
    console.warn('State load failed, reseeding', e);
    return seed();
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function pushEvent({actor='SYSTEM', action='event', result='ok', message=''}){
  state.eventLog.unshift({ id: uid('evt'), at: nowIso(), actor, action, result, message });
  saveState();
  renderFeed();
}

let state = loadState();
let selectedMissionId = null;

// DOM refs
const kanbanEl = document.getElementById('kanban');
const agentsEl = document.getElementById('agents');
const feedEl = document.getElementById('feed');
const globalSearchEl = document.getElementById('globalSearch');
const projectFilterEl = document.getElementById('projectFilter');
const statusFilterEl = document.getElementById('statusFilter');
const newMissionBtn = document.getElementById('newMissionBtn');
const missionDialog = document.getElementById('missionDialog');
const newMissionDialog = document.getElementById('newMissionDialog');

// New mission form
const nmForm = document.getElementById('newMissionForm');
const nmProject = document.getElementById('nmProject');
const nmTitle = document.getElementById('nmTitle');
const nmObjective = document.getElementById('nmObjective');
const nmStatus = document.getElementById('nmStatus');
const nmRisk = document.getElementById('nmRisk');
const nmCost = document.getElementById('nmCost');
const nmCancel = document.getElementById('nmCancel');

// Dialog elements
const dlgProject = document.getElementById('dlgProject');
const dlgTitle = document.getElementById('dlgTitle');
const dlgMeta = document.getElementById('dlgMeta');
const dlgObjective = document.getElementById('dlgObjective');
const dlgChecklist = document.getElementById('dlgChecklist');
const dlgTasks = document.getElementById('dlgTasks');
const addTaskBtn = document.getElementById('addTaskBtn');
const dlgArtifacts = document.getElementById('dlgArtifacts');
const dlgLinks = document.getElementById('dlgLinks');
const dlgStatus = document.getElementById('dlgStatus');
const dlgRisk = document.getElementById('dlgRisk');
const dlgCost = document.getElementById('dlgCost');
const dlgApprovals = document.getElementById('dlgApprovals');
const dlgLogs = document.getElementById('dlgLogs');
const okExecutarBtn = document.getElementById('okExecutarBtn');
const addApprovalBtn = document.getElementById('addApprovalBtn');

function getProjectName(projectId){
  return state.projects.find(p => p.id === projectId)?.name || '—';
}

function riskLabel(r){
  if(r === 'high') return 'Alto';
  if(r === 'medium') return 'Médio';
  return 'Baixo';
}

function riskPillClass(r){
  if(r === 'high') return 'risk-high';
  if(r === 'medium') return 'risk-med';
  return 'risk-low';
}

function agentBadgeClass(state){
  if(state === 'active') return 'ok';
  if(state === 'blocked') return 'bad';
  return 'warn';
}

function filteredMissions(){
  const q = (globalSearchEl.value || '').trim().toLowerCase();
  const proj = projectFilterEl.value || '';
  const status = statusFilterEl.value || '';

  return state.missions.filter(m => {
    if(proj && m.projectId !== proj) return false;
    if(status && m.status !== status) return false;
    if(!q) return true;

    const blob = [
      m.title, m.objective, m.status, m.risk,
      getProjectName(m.projectId),
      (m.checklist||[]).map(c => c.text).join(' '),
      (m.tasks||[]).map(t => `${t.title} ${t.description||''} ${t.status}`).join(' '),
      (m.links||[]).map(l => l.title + ' ' + l.url).join(' '),
      (m.artifacts||[]).map(a => a.title + ' ' + (a.ref||'')).join(' '),
    ].join(' ').toLowerCase();

    return blob.includes(q);
  });
}

function renderProjectFilters(){
  const opts = ['<option value="">Todos projetos</option>'];
  for(const p of state.projects){
    opts.push(`<option value="${p.id}">${escapeHtml(p.name)}</option>`);
  }
  projectFilterEl.innerHTML = opts.join('');
  nmProject.innerHTML = state.projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

function renderKanban(){
  const missions = filteredMissions();

  kanbanEl.innerHTML = STATUS_COLUMNS.map(col => {
    const count = missions.filter(m => m.status === col.key).length;
    return `
      <div class="column" data-col="${col.key}">
        <div class="column-h">
          <div class="col-title">${col.label}</div>
          <div class="col-count">${count}</div>
        </div>
        <div class="cards" data-drop="${col.key}"></div>
      </div>
    `;
  }).join('');

  // fill cards
  for(const col of STATUS_COLUMNS){
    const cardsWrap = kanbanEl.querySelector(`[data-drop="${CSS.escape(col.key)}"]`);
    const items = missions.filter(m => m.status === col.key);

    for(const m of items){
      const hasApprovalRequested = (m.approvals||[]).some(a => a.state === 'requested');
      const pills = [
        `<span class="pill ${riskPillClass(m.risk)}">Risco: ${riskLabel(m.risk)}</span>`,
        m.costUsd != null ? `<span class="pill">$${Number(m.costUsd).toFixed(2)}</span>` : '',
        hasApprovalRequested ? `<span class="pill">Approval</span>` : '',
      ].filter(Boolean).join('');

      const el = document.createElement('div');
      el.className = 'card';
      el.draggable = true;
      el.dataset.id = m.id;
      el.innerHTML = `
        <div class="t">${escapeHtml(m.title)}</div>
        <div class="d">${escapeHtml(truncate(m.objective||'', 110))}</div>
        <div class="pills">${pills}</div>
      `;

      el.addEventListener('click', () => openMission(m.id));
      el.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', m.id);
        ev.dataTransfer.effectAllowed = 'move';
      });

      cardsWrap.appendChild(el);
    }
  }

  // DnD handlers
  for(const drop of kanbanEl.querySelectorAll('[data-drop]')){
    drop.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
    });
    drop.addEventListener('drop', (ev) => {
      ev.preventDefault();
      const id = ev.dataTransfer.getData('text/plain');
      const newStatus = drop.dataset.drop;
      moveMission(id, newStatus);
    });
  }
}

function renderAgents(){
  const summary = document.getElementById('agentSummary');
  const active = state.agents.filter(a => a.state === 'active').length;
  const blocked = state.agents.filter(a => a.state === 'blocked').length;
  summary.textContent = `${active} active • ${blocked} blocked • ${state.agents.length} total`;

  agentsEl.innerHTML = state.agents.map(a => {
    const badge = a.state === 'active' ? 'active' : (a.state === 'blocked' ? 'blocked' : 'idle');
    const working = a.workingOn ? (state.missions.find(m => m.id === a.workingOn)?.title || a.workingOn) : '—';
    return `
      <div class="agent">
        <div>
          <div class="name">${escapeHtml(a.name)}</div>
          <div class="role">${escapeHtml(a.role)}</div>
        </div>
        <div class="state">
          <span class="badge ${agentBadgeClass(a.state)}">${escapeHtml(badge)}</span>
          <span class="muted" title="Working on">${escapeHtml(truncate(working, 28))}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderFeed(){
  const items = state.eventLog.slice(0, 60);
  feedEl.innerHTML = items.map(e => {
    return `
      <div class="feed-item">
        <div class="h">
          <div class="who">${escapeHtml(e.actor)} • ${escapeHtml(e.action)}</div>
          <div class="ts">${escapeHtml(shortTs(e.at))}</div>
        </div>
        <div class="msg">${escapeHtml(e.message || '')}</div>
      </div>
    `;
  }).join('');
}

function moveMission(id, newStatus){
  const m = state.missions.find(x => x.id === id);
  if(!m) return;
  const old = m.status;
  m.status = newStatus;
  m.updatedAt = nowIso();
  saveState();
  pushEvent({ actor: 'ALFRED', action: 'mission.move', result: 'ok', message: `"${m.title}" ${old} → ${newStatus}`});
  renderKanban();
  if(selectedMissionId === id) refreshDialog();
}

function openMission(id){
  selectedMissionId = id;
  refreshDialog();
  missionDialog.showModal();
}

function refreshDialog(){
  const m = state.missions.find(x => x.id === selectedMissionId);
  if(!m) return;

  dlgProject.textContent = getProjectName(m.projectId);
  dlgTitle.textContent = m.title;
  dlgMeta.textContent = `Status: ${m.status} • Atualizado: ${shortTs(m.updatedAt)} • Criado: ${shortTs(m.createdAt)}`;
  dlgObjective.textContent = m.objective || '—';

  dlgStatus.textContent = m.status;
  dlgStatus.className = 'v badge';
  dlgRisk.textContent = riskLabel(m.risk);
  dlgCost.textContent = (m.costUsd != null && m.costUsd !== '') ? `$${Number(m.costUsd).toFixed(2)}` : '—';

  dlgChecklist.innerHTML = (m.checklist||[]).map(c => {
    const checked = c.done ? 'checked' : '';
    return `
      <label class="chk">
        <input type="checkbox" data-chk="${c.id}" ${checked} />
        <span>${escapeHtml(c.text)}</span>
      </label>
    `;
  }).join('') || `<div class="muted">Sem checklist</div>`;

  dlgArtifacts.innerHTML = (m.artifacts||[]).map(a => {
    const right = a.kind === 'url'
      ? `<a href="${escapeAttr(a.ref)}" target="_blank" rel="noreferrer">abrir</a>`
      : `<span class="muted">${escapeHtml(a.ref||'')}</span>`;
    return `<div class="a-item"><div>${escapeHtml(a.title)}</div><div>${right}</div></div>`;
  }).join('') || `<div class="muted">Sem artefatos</div>`;

  dlgLinks.innerHTML = (m.links||[]).map(l => {
    return `<div class="a-item"><div>${escapeHtml(l.title||l.url)}</div><div><a href="${escapeAttr(l.url)}" target="_blank" rel="noreferrer">abrir</a></div></div>`;
  }).join('') || `<div class="muted">Sem links</div>`;

  dlgApprovals.innerHTML = (m.approvals||[]).map(a => {
    const stateLabel = a.state === 'approved' ? 'approved' : (a.state === 'requested' ? 'requested' : 'rejected');
    const badgeClass = a.state === 'approved' ? 'ok' : (a.state === 'requested' ? 'warn' : 'bad');
    return `
      <div class="a-item">
        <div>
          <div style="font-weight:650">${escapeHtml(a.title)}</div>
          <div class="muted">${escapeHtml(stateLabel)} • by ${escapeHtml(a.requestedBy||'—')} • ${escapeHtml(shortTs(a.requestedAt))}</div>
        </div>
        <div><span class="badge ${badgeClass}">${escapeHtml(stateLabel)}</span></div>
      </div>
    `;
  }).join('') || `<div class="muted">Sem aprovações pendentes</div>`;

  // per-mission mini logs: filter global feed for mission title mention (MVP heuristic)
  const logs = state.eventLog.filter(e => (e.message||'').includes(`"${m.title}"`)).slice(0, 25);
  dlgLogs.innerHTML = logs.map(e => `
    <div class="feed-item">
      <div class="h">
        <div class="who">${escapeHtml(e.actor)} • ${escapeHtml(e.action)}</div>
        <div class="ts">${escapeHtml(shortTs(e.at))}</div>
      </div>
      <div class="msg">${escapeHtml(e.message||'')}</div>
    </div>
  `).join('') || `<div class="muted">Sem eventos específicos desta missão ainda.</div>`;

  // render tasks
  m.tasks = m.tasks || [];
  dlgTasks.innerHTML = m.tasks.map(t => {
    const crit = t.critical ? `<span class="pill">CRITICAL</span>` : '';
    const opts = TASK_STATUSES.map(s => `<option ${s===t.status?'selected':''}>${s}</option>`).join('');
    return `
      <div class="task-row" data-task="${t.id}">
        <div class="left">
          <div class="tt">${escapeHtml(t.title)} ${crit}</div>
          <div class="td">${escapeHtml(t.description||'')}</div>
        </div>
        <div class="right">
          <select data-task-status="${t.id}" aria-label="Status da task">
            ${opts}
          </select>
        </div>
      </div>
    `;
  }).join('') || `<div class="muted">Sem tasks ainda.</div>`;

  // bind checklist toggles
  for(const cb of dlgChecklist.querySelectorAll('input[type="checkbox"][data-chk]')){
    cb.addEventListener('change', () => {
      const chkId = cb.dataset.chk;
      const item = (m.checklist||[]).find(x => x.id === chkId);
      if(!item) return;
      item.done = cb.checked;
      m.updatedAt = nowIso();
      saveState();
      pushEvent({ actor: 'ALFRED', action: 'mission.check', result: 'ok', message: `"${m.title}": checklist → ${item.done ? 'done' : 'todo'} (${item.text})`});
      renderKanban();
    });
  }

  // bind task status changes
  for(const sel of dlgTasks.querySelectorAll('select[data-task-status]')){
    sel.addEventListener('change', () => {
      const taskId = sel.dataset.taskStatus;
      const t = m.tasks.find(x => x.id === taskId);
      if(!t) return;
      const old = t.status;
      t.status = sel.value;
      m.updatedAt = nowIso();
      saveState();
      pushEvent({ actor:'ALFRED', action:'task.move', result:'ok', message:`"${m.title}": task "${t.title}" ${old} → ${t.status}`});
      renderKanban();
      refreshDialog();
    });
  }
}

okExecutarBtn.addEventListener('click', () => {
  const m = state.missions.find(x => x.id === selectedMissionId);
  if(!m) return;
  // Approve first requested approval (MVP behavior)
  const pending = (m.approvals||[]).find(a => a.state === 'requested');
  if(!pending){
    pushEvent({ actor:'ALFRED', action:'approval.ok_executar', result:'noop', message:`"${m.title}": nenhum approval pendente.`});
    return;
  }
  pending.state = 'approved';
  pending.approvedAt = nowIso();
  m.updatedAt = nowIso();
  saveState();
  pushEvent({ actor:'FILIPE', action:'approval.approve', result:'ok', message:`"${m.title}": aprovado → ${pending.title}`});
  refreshDialog();
  renderKanban();
});

addApprovalBtn.addEventListener('click', () => {
  const m = state.missions.find(x => x.id === selectedMissionId);
  if(!m) return;
  const title = prompt('Título do approval (ex.: “Executar deploy em produção”)');
  if(!title) return;
  m.approvals = m.approvals || [];
  m.approvals.unshift({ id: uid('apv'), title, state:'requested', requestedBy:'ALFRED', requestedAt: nowIso(), approvedAt:null });
  m.updatedAt = nowIso();
  saveState();
  pushEvent({ actor:'ALFRED', action:'approval.request', result:'ok', message:`"${m.title}": pediu aprovação → ${title}`});
  refreshDialog();
  renderKanban();
});

addTaskBtn.addEventListener('click', () => {
  const m = state.missions.find(x => x.id === selectedMissionId);
  if(!m) return;
  const title = prompt('Título da task');
  if(!title) return;
  const description = prompt('Descrição (opcional)') || '';
  const critical = confirm('Essa task é CRÍTICA e deve passar por approval antes de executar?');

  m.tasks = m.tasks || [];
  m.tasks.unshift({ id: uid('tsk'), title: title.trim(), description: description.trim(), status: 'Backlog', critical });
  m.updatedAt = nowIso();
  saveState();
  pushEvent({ actor:'FILIPE', action:'task.create', result:'ok', message:`"${m.title}": nova task → ${title.trim()}`});
  refreshDialog();
});

newMissionBtn.addEventListener('click', () => {
  nmTitle.value = '';
  nmObjective.value = '';
  nmStatus.value = 'Backlog';
  nmRisk.value = 'low';
  nmCost.value = '';
  newMissionDialog.showModal();
});

nmCancel.addEventListener('click', () => newMissionDialog.close());

nmForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const m = {
    id: uid('msn'),
    projectId: nmProject.value,
    title: nmTitle.value.trim(),
    objective: nmObjective.value.trim(),
    status: nmStatus.value,
    risk: nmRisk.value,
    costUsd: nmCost.value ? Number(nmCost.value) : null,
    checklist: [],
    links: [],
    artifacts: [],
    approvals: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.missions.unshift(m);
  saveState();
  pushEvent({ actor:'FILIPE', action:'mission.create', result:'ok', message:`Criou missão: "${m.title}" (${m.status})`});
  newMissionDialog.close();
  renderKanban();
});

// search/filter
for(const el of [globalSearchEl, projectFilterEl, statusFilterEl]){
  el.addEventListener('input', () => renderKanban());
  el.addEventListener('change', () => renderKanban());
}

function truncate(s, n){
  s = s || '';
  if(s.length <= n) return s;
  return s.slice(0, n-1) + '…';
}

function escapeHtml(str){
  return (str||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function escapeAttr(str){
  return escapeHtml(str).replaceAll('`','&#096;');
}

// init
renderProjectFilters();
renderKanban();
renderAgents();
renderFeed();

// light “real-time” feel
setInterval(() => {
  // update just the timestamps view in feed (cheap)
  renderFeed();
}, 15000);
