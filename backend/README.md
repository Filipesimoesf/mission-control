# Mission Control Backend (v1)

Node/Fastify + SQLite.

## Env vars
- `MC_AUTH_TOKEN` (required): clients must send `Authorization: Bearer <token>`
- `MC_DB_PATH` (optional): default `/var/data/mission-control.sqlite`
- `MC_ALLOWED_ORIGIN` (optional): default `*` (set to `https://filipesimoesf.github.io`)
- `PORT` (Render sets this)

## Render setup (paid, with disk)
- Root Directory: `backend`
- Build command: `npm ci`
- Start command: `npm start`
- Persistent Disk: mount `/var/data`

## Quick test
```bash
curl -s http://localhost:3000/health
curl -s -H "Authorization: Bearer $MC_AUTH_TOKEN" http://localhost:3000/api/projects
```
