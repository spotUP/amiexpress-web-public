# M12 report - Menu Doors admin page

Landed 7a9ff2cfd (web/config-app only).

- Page: pages/MenusPage.tsx (kind tabs from MENU_KINDS; inner tabs param=part: Entries DataTable, Sections, Levels, Wipes, Overflow; preview pane). Route `menus`, nav entry "Menu Doors".
- Pure logic: components/menus/menu-edit.ts (tested in test/menu-edit.test.ts). Hook: useMenuConfig (local copy is truth, board's answer supplies problems only, so typing is never overwritten). Wipe names live in menu-edit.ts (no catalogue of names existed; taken from screen-wipe.util.ts header), built from WIPE_CODES.
- client.ts: 7 menu methods; request() returns undefined on 204; failed() carries top-level usedBy as ApiError.data.
- Section Remove is enabled when no command (entries list = widest caller, level 255, with sysop placement applied) is in it, not by asking the preview.
- Selecting preview width 40 also selects PETSCII (mode picker still free).
- Tests: menu-edit 20, menus-page 7 (one reachability test), menus-client 2. RED first (modules missing); revert-check of the 204/usedBy and placement fixes failed 3 tests. design-system-usage, nav-routes, nav-search green; tsc 0 errors; vite build ok (not a typecheck).
- Not done / for M13: logo UI (client methods exist, untested against a page).

## Fix round 1
1. Remove on a section is disabled until the entries have loaded without error (sectionIsEmpty/removeSection take `loaded`); the tooltip says why.
2. WIPE_NAMES is Record<WipeType minus random, string>, no fallback; test that every code is named. Names documented as the sysop-facing sentence-case wording of the screen-wipe.util.ts header.
3. Hidden control is a search box over a scrollable checked list with a "Hidden (n of total)" count; filterKeys is pure and tested. No existing multi-select component in components/ui (grepped), so it is local to MenuLevelsEditor.
4. renameSection refuses an empty or blank title and trims; the input keeps a local draft, writes only non-empty titles, shows a hint, and restores the old title on blur.
RED: reverting the loaded guard, the page wiring and the title guard failed 3 tests.
