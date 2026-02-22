import Database from 'better-sqlite3';

export function openDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    create table if not exists projects (
      id text primary key,
      name text not null,
      createdAt text not null,
      updatedAt text not null
    );

    create table if not exists agents (
      id text primary key,
      name text not null,
      role text not null,
      state text not null,
      workingOnMissionId text,
      createdAt text not null,
      updatedAt text not null
    );

    create table if not exists missions (
      id text primary key,
      projectId text not null,
      title text not null,
      objective text,
      status text not null,
      risk text not null,
      costUsd real,
      createdAt text not null,
      updatedAt text not null,
      foreign key(projectId) references projects(id) on delete cascade
    );

    create table if not exists tasks (
      id text primary key,
      missionId text not null,
      title text not null,
      description text,
      status text not null,
      critical integer not null default 0,
      createdAt text not null,
      updatedAt text not null,
      foreign key(missionId) references missions(id) on delete cascade
    );

    create table if not exists artifacts (
      id text primary key,
      missionId text,
      taskId text,
      title text not null,
      kind text not null,
      ref text not null,
      createdAt text not null,
      updatedAt text not null,
      foreign key(missionId) references missions(id) on delete set null,
      foreign key(taskId) references tasks(id) on delete set null
    );

    create table if not exists approvals (
      id text primary key,
      missionId text,
      taskId text,
      title text not null,
      state text not null,
      requestedBy text not null,
      requestedAt text not null,
      approvedAt text,
      createdAt text not null,
      updatedAt text not null,
      foreign key(missionId) references missions(id) on delete set null,
      foreign key(taskId) references tasks(id) on delete set null
    );

    create table if not exists event_logs (
      id text primary key,
      at text not null,
      actor text not null,
      action text not null,
      result text not null,
      message text,
      projectId text,
      missionId text,
      taskId text
    );

    create index if not exists idx_missions_project on missions(projectId);
    create index if not exists idx_tasks_mission on tasks(missionId);
    create index if not exists idx_events_at on event_logs(at);
  `);
}
