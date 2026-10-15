# Backend API Reference (Summary)
**In-depth API audits (e.g., `IMPORT_API_REFERENCE.md`, `AMIEXPRESS_DATA_STRUCTURE.md`) now live in `archive/`.**

## 1. Key Endpoints
- **Auth**: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register` mirror express.e login prompts; responses include the correct `LOGON` text and `BULL` output.
- **Commands**: `/api/command` accepts Express-style commands and uses the same parser as `command.handler.ts`, which routes requests through the state machine.
- **Door Control**: `/api/doors/run`, `/api/doors/status`, and `/api/doors/logs` wrap the `AmigaDoorSession` logic, logging everything that `node web/backend/dist/scripts/run-amiga-door.js` would display.

## 2. Data & Utilities
- The REST API exposes user profiles, conferences, messages, uploads, and door statuses to match express.e ACLs; schema details are recorded in `archive/AMIEXPRESS_DATA_STRUCTURE.md`.
- Upload sessions handshake via `POST /api/upload/session` (the route ensures DIR1 exists and replicates express.e upload validations and error codes).
- The importer/exporter endpoints rehydrate `User.data`, `Dir1`, and `ACS` files—they appear in the `archive/IMPORT_API_REFERENCE.md` docs for reference.

## 3. Extensibility
- Additional microservices (MCI codes, Arexx triggers, door-specific hooks) plug into this API and re-use the `XIMProtocol` command set.
- When adding new endpoints, keep in mind the `web/backend/src/amiga-emulation/api` modules emulate the original libraries (`ExecLibrary.ts`, `DosLibrary.ts`).

**Need more?** The archived files include full endpoint tables, sample requests, and the express.e LVO mappings; use them for implementation while this summary keeps the reference lightweight.
