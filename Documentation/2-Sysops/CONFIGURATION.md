# System Configuration Guide (Summary)
**Legacy docs containing deep dives now live in `archive/CONFIG_APP_PLAN.md`, `archive/CONFIG_APP_ANALYSIS.md`, and `archive/PRODUCTION_READINESS.md`.**

## 1. Core Configuration Files
- **`.env`**: Set `PORT`, `SOCKET_PORT`, `DATABASE_URL`, `SESSION_SECRET`, `API_KEY`, and door-specific toggles (e.g., `AQUASCAN_CONF`).
- **`storage/conf/` and `Doors/`**: Mirror the Amiga directory layout (Conf1..ConfN, Dir1..DirN) to keep ECS (external command sequences) data consistent with express.e.
- **Command definitions** now live in `web/backend/src/bbs-data/commands`; customizations reflect `Commands/` screens using the original 1:1 format remembered in `archive/COMMAND_HANDLER_MODULARIZATION.md`.

## 2. Access Levels & Security
- Security levels (0–255) match express.e semantics. Adjust them through the UI or by editing the `securityLevels` table in the database.
- Command and door access checks use the original ACS bits; review `archive/SECURITY_FIXES.md` for how we preserved `PRV_COMMAND`, `PRV_GROUP`, and flag queries.
- `AO_FLAGS`, `ACS` files, and ACS bits are automatically generated from `Commands`/`Access` definitions when the importer runs.

## 3. Runtime Settings
- Terminal size and pause behavior are read from each user’s profile (height/width) to pause FR/FS exactly where express.e would.
- Logging level (`LOG_LEVEL`) and door debugging toggles (e.g., `DEBUG_XIM_OUTPUT`) are toggled via `.env`.
- `AUTO_RESTART` watchers restarts the backend using `dev/scripts/start-servers.sh` when a crash is detected (see `archive/DEPLOYMENT_SCRIPTS.md`).

## 4. File and Door Data
- Ensure `Screens` files (ANSI/petscii) and door configs match express.e names and folder structure; corrupted or misaligned ASCII art gets split into continuation blocks within FR parsing.
- `Dir1`/`DirX` files are auto-created if missing during uploads to keep door file lookups valid (AmiExpress always expects file area definitions).
- Use `archive/CONFIG_APP_PLAN.md` for multi-stage deployment config layering, and `archive/CONFIG_APP_ANALYSIS.md` for field mappings between express.e screens and modern React components.

**Need more detail?** See the archived files for CLI-based configuration (Webhooks, Deployment). Today's documentation keeps settings explicit while deferring granular automation flows to the archives.
