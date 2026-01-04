# Testing Guide (Summary)
**Complete test plans and scripts live in `archive/BBS-TESTING-GUIDE.md`, `archive/BBS-TESTING-FINAL.md`, and `archive/manual-test-checklist.md`.**

## 1. Automated Suite
- Run `npm run test:unit` (if created) or targeted scripts with `npx tsx` to execute door harnesses (AquaScan, WHO, etc.).
- Use `dev/scripts/test-all-doors.sh` to exercise every door library; outputs and statuses are recorded in `dev/scripts/door-test-results.txt` for triage.
- Monitor `logs/door-68k.log` and `/tmp/*.out` after each run; missing output usually means the door did not receive the correct `JH_*` commands.

## 2. Manual Validation
- Manual steps include verifying FR paginates correctly, ASCII logos align, the prompt pauses every N lines, and commands show the exact express.e text.
- The `AQUASCAN_DEBUG.md` and `AQUASCAN_ANALYSIS_SUMMARY.md` guides show how to reproduce broken-line cases and verify fixes.
- Command coverage is double-checked against `API_REFERENCE.md` to ensure both BBS commands and door guiding match express.e’s command flow.

## 3. Regression Safeguards
- When adjusting wiring or security (Arexx access, command handler), log the change in `archive/CRITICAL_RULES.md` and rerun the door/test suite.
- Extra logging (e.g., `DEBUG_XIM_OUTPUT=1`, `DEBUG_DOOR_IO=true`, `logs/backend.log`) is the first line of defense for nondeterministic bugs.
- **XIM Critical Requirements:** Run `dev/scripts/verify-xim-critical.sh` before committing XIM-related changes to prevent regressions. See `XIM_CRITICAL_REQUIREMENTS.md` for details.

**Need instructions to add new tests?** The archived testing docs include templates for manual checklists, CLI scaffolding, and candidate PR descriptions (`PR_DESCRIPTION.md`). Refer there once the summary is solid.
