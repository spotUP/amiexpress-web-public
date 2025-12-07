# Deployment Guide (Summary)
**Detailed platform plays (Railway, unified deployment, webhook flows) are archived (`archive/RAILWAY_DEPLOYMENT.md`, `archive/UNIFIED_DEPLOYMENT.md`, `archive/DEPLOYMENT_SUMMARY.md`).**

## 1. Deployment Model
- AmiExpress-Web runs split: frontend (React) served statically, backend (Node/Express + WebSocket) exposes the classic BBS terminal via `xterm.js`.
- Deploy with a process manager (PM2, systemd) or platform (Railway, Render). Use `dev/scripts/start-servers.sh` to launch nodes sequentially and `kill-servers.sh` to stop them cleanly before a restart.
- Environment variables (`PORT`, `SOCKET_PORT`, `DATABASE_URL`, `SESSION_SECRET`, `BACKEND_HOST`) configure node counts, door ports, and node IDs.

## 2. Preparation & Validation
- Run `npm run build` in both frontend and backend before shipping. The backend output lives under `web/backend/dist`, and `node dist/src/index.js` should start clean without missing `SCREEN_FILES` or `DirX` errors.
- Post-deploy, examine `logs/backend.log`, `logs/door-68k.log`, and `/tmp/bulls.out` to confirm doors, FR parsing, and footers work exactly like express.e (per `Documentation/4-Door-Developers/AQUASCAN_ANALYSIS_SUMMARY.md`).

## 3. Automation Hooks
- Webhooks (see archives) trigger builds, door tests, or notifications. Integrate them with `WEBHOOKS_README` and `SYSOP_WEBHOOK_GUIDE` to know which commands they run.
- The `PRODUCTION_READINESS` checklist ensures TLS, backups, and monitoring are in place before handing the BBS to end users.

**More context on deployment loops, success criteria, and fallback plans is available in the archive; this summary captures the high-level playbook.**
