# Dev Scripts Documentation
Detailed notes for the dev scripts live in `Documentation/3-Developers/archive/dev-scripts/`. Refer there for plans, indexes, and reference material before modifying these scripts.

## restore-npm-access.sh

Utility wrapper that runs `npm install --prefix web/backend` from the repository root.

- **Purpose**: Refresh backend dependencies when the sandboxed environment loses access to `registry.npmjs.org`.
- **Usage**: Run it with escalated permissions (request `with_escalated_permissions=true`) so the command can reach the public npm registry.
- **Location**: `dev/scripts/restore-npm-access.sh`
