export function nowIso() {
  return new Date().toISOString();
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export const MISSION_STATUSES = ['Backlog','Doing','Review','Done','Blocked','Needs Approval','Needs Info','Archived'];
export const TASK_STATUSES = ['Backlog','Doing','Review','Done','Blocked','Needs Approval','Needs Info','Archived'];
export const RISK = ['low','medium','high'];

export function assertAllowed(arr, value, label) {
  if (!arr.includes(value)) {
    const err = new Error(`${label} inválido: ${value}`);
    err.statusCode = 400;
    throw err;
  }
}
