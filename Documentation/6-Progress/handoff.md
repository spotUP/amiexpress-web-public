# Handoff

## Current State (2025-12-07)
- The security-screen lookup now tries `.TXT.GR` before plain `.TXT`, so high-security menus such as `menu250.txt.GR` resolve cleanly when `displayScreen(SCREEN_MENU)` runs.
- The command pipeline no longer has a dedicated SYSOP menu; inputs flow through the standard Sys/BBS/Internal priority logic and only `inDoorManager` prevents the routine exit back to the menu.
- Each `Conf*/menu250.txt.GR` file is now the normalized graphically styled menu (renamed from the `.GR.ans` sources and purged of stray copies).

## Recent Work (Session 10)
- Added the `.TXT.GR` extension list in `web/backend/src/utils/screen-security.util.ts` and updated the command handler layers to drop the old `SYSOP` menu wiring (`command.handler.ts`, `command-handler/core.ts`, `command-handler/command-execution.ts`, `command-handler/input-handlers.ts`, `command-handler/types.ts`, `web/backend/src/index.ts`).
- Deleted the unused `web/backend/src/handlers/sysop-menu.handler.ts`, leaving the existing `sysop-commands.handler.ts` flows untouched.
- Renamed/cleaned the Conf directories so they now expose the canonical `menu250.txt.GR` assets (e.g., `Conf10/menu250.txt.GR`).

## Next Steps
1. When npm access is restored, rerun `npx tsx web/backend/src/scripts/run-amiga-door.ts Doors/AquaScan/AquaScan.000 1 1 REVSCAN` to verify the door now lands on the security-specific menu and respects pagination.
2. Inspect `logs/backend.log` (and any new `door-68k` captures) after that run to ensure no missing-screen errors or wrap/pause regressions appear now that security-level menu selection is active.
