# Contributing Guide (Summary)
**Guides for PR templates, security rules, and modularization now live under `archive/PR_DESCRIPTION.md`, `archive/CRITICAL_RULES.md`, and `archive/COMMAND_HANDLER_MODULARIZATION.md`.**

## 1. Contribution Philosophy
- Align every change with express.e behavior; reference the MCP `express.e` lines (use the provided MCP search tools) before touching a handler.
- Follow the 1:1 parity goal—no feature is admitted unless it matches the original BBS state machine, prompts, and data files.
- Document new flows in markdown and log them in `Documentation/6-Progress/` before merging.

## 2. Workflow
1. Fork repo, create a branch naming the feature plus ticket (e.g., `doc/aquascan-summary`).
2. Run `npm run lint` and `npm run test`. For door work, use `npx tsx web/backend/src/scripts/run-amiga-door.ts Doors/<Door>/...` to prove the run.
3. Draft a PR referencing `PR_DESCRIPTION.md` for required sections (Summary, Testing, Next steps) and cite relevant docs.

## 3. Review & Stories
- Report critical blockers in `Documentation/6-Progress/Known_Issues.md` and tie them back to the `MASTERPLAN` so progress is visible.
- Security, BBS command integrity, and multi-node stability are priorities—see `archive/SECURITY_FIXES.md` and `archive/MULTINODE_CHAT_IMPLEMENTATION.md` for past implementations.
- Merge only after at least one reviewer confirms the change respects express.e prompts and door logging.

**Need templates?** The archived docs include PR and release checklists, plus references to Arexx-specific contributions (Arexx phases, etc.). Use them to keep new contributions consistent.
