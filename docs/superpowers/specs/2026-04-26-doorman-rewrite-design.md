# DOORMAN v2 — Design Spec
**Date:** 2026-04-26  
**Author:** Spot / Up Rough

---

## Context

DOORMAN is the SysOp door management tool. The current version (1,275 lines, `Doors/door-manager/app.ts`) has two known bugs and is missing the file browser and guide reader features. This spec covers a full rewrite to fix both bugs and deliver the new functionality cleanly.

---

## Bugs Being Fixed

### 1. Silent delete failure
`deleteTypeScriptDoor()` in `amigaDoorManager.ts` builds its path using `config.get('dataDir') + '/Doors/'`, but TypeScript doors live in the **project root's** `Doors/` directory. The `amigafs.existsSync()` check fails → returns `{ success: false, message: "not found" }`. The result message is displayed via `Message.display(text, callback)` racing with a 2-second `setTimeout(() => resultMsg.hide())`, so the error disappears before the user notices.

**Fix:** Pass `door.location` (e.g. `Doors/arkanoid`) as the identifier to `bbs.deleteDoor()`. The manager resolves it relative to the project root, not `dataDir`. Also replace the flaky `Message.display()` pattern with an in-place status panel.

### 2. `deleteTypeScriptDoor` path resolution
`amigaDoorManager.deleteTypeScriptDoor()` must accept both bare names (`arkanoid`) and path-prefixed names (`Doors/arkanoid`). Strip any leading `Doors/` prefix before joining with `bbsRoot`.

---

## Architecture

### Files

| File | Role |
|------|------|
| `Doors/door-manager/app.ts` | Full rewrite. `DoorManager` class. Door list UI + state machine. |
| `Doors/door-manager/FileExplorerOverlay.ts` | **New.** Self-contained full-screen overlay. Directory navigation + file viewer. |
| `Doors/door-manager/index.ts` | Unchanged (34-line entry point). |

### State machine

```
DOOR_LIST  ←──────────────────┐
    │ F (on selected door)     │ ESC
    ▼                          │
FILE_BROWSER ──── select file ──→ FILE_VIEWER
```

- `DoorManager` owns `DOOR_LIST` state and instantiates `FileExplorerOverlay` on demand.
- `FileExplorerOverlay` owns both `FILE_BROWSER` and `FILE_VIEWER` states internally.
- When ESC is pressed from either overlay state, the overlay destroys itself and returns control to `DoorManager`.

---

## Door List UI (`app.ts`)

### Layout

```
┌──────────────────────────────────────────────────┐
│  DOORMAN v2  Spot/Up Rough  ■ 12 doors ■ Node 1 │  ← header (3 rows)
├─────────────────────────┬────────────────────────┤
│  INSTALLED DOORS        │  DOOR INFO             │
│                         │                        │
│  [TS] arkanoid       ●  │  Name:    ArKanoid     │
│  [TS] bug-tracker    ●  │  Type:    TypeScript   │
│  [68] GlobalCallers  ○  │  Cmd:     arkanoid     │
│  [TS] livechat       ●  │  Size:    234 KB       │
│  [TS] pengo          ●  │  Access:  0 (all)      │
│                         │  Status:  ● ENABLED    │
│                         │  Path:    Doors/arkan… │
├─────────────────────────┴────────────────────────┤
│  [F]iles  [D]elete  [E]nable  [T]est  [Q]uit    │  ← footer (3 rows)
└──────────────────────────────────────────────────┘
```

- `●` = enabled, `○` = disabled
- Type badges: `[TS]` TypeScript/SDK, `[68]` Amiga 68K, `[SI]` SIM/XIM
- Left panel: `Panel` with embedded `List` widget. Arrow keys + `j`/`k` to navigate.
- Right panel: `Panel` with `ScrollableBox` for door details. Hidden below 100 cols.
- No `DockablePanel` — non-resizable, fixed layout is appropriate here.
- Header shows door count + enabled count + node number.

### Key bindings

| Key | Action |
|-----|--------|
| `↑` / `↓` / `j` / `k` | Navigate door list |
| `F` | Open file browser overlay for selected door |
| `D` | Delete selected door (ConfirmModal → in-place status) |
| `E` | Toggle enable/disable selected door |
| `T` | Test door (run it) |
| `Q` / `ESC` | Quit DOORMAN |

### Delete flow (fixed)
1. `ConfirmModal` with red border.
2. On confirm: set header status text to `Deleting…` (no separate message widget).
3. Call `bbs.deleteDoor(door.location || door.command, isTS)`.
4. On result: update header status with success/error for 3 seconds, then clear.
5. On success: refresh door list.

---

## File Explorer Overlay (`FileExplorerOverlay.ts`)

### Constructor
```typescript
new FileExplorerOverlay({
  screen,
  doorPath: string,       // e.g. "Doors/arkanoid"
  bbs,
  session,
  onClose: () => void,
})
```

Mounts a full-screen `Box` over everything (`z-index` top). Destroys itself and calls `onClose()` on ESC.

### FILE_BROWSER state

```
┌──────────────────────────────────────────────────┐
│  FILES: Doors/arkanoid/                 ESC=close │  ← header
├──────────────────────────────────────────────────┤
│  .. (parent)                                      │
│  [dist/]                               dir        │
│  [node_modules/]                       dir        │
│  README.txt                           4.2 KB      │
│  arkanoid.nfo                         1.1 KB      │
│  arkanoid.guide                       8.4 KB      │
│  package.json                         0.8 KB  dim │
│  app.ts                              12.3 KB  dim │
├──────────────────────────────────────────────────┤
│  Enter=Open  Bksp=Up  ESC=Close                  │  ← footer
└──────────────────────────────────────────────────┘
```

- Uses SDK `FileManager` widget (`sdk/engines/ui/blessed/widgets/filemanager.ts`) for navigation.
- Readable file types: `.txt`, `.nfo`, `.guide`, `.readme`, `.doc` — shown normally.
- Other files (`.ts`, `.js`, `.json`, binaries) — listed but dimmed, Enter does nothing.
- Directories always navigable. `..` at top goes to parent (capped at door root — cannot navigate above it).
- Path shown in header updates as user navigates.

### FILE_VIEWER state

Triggered by selecting a readable file. Replaces file list content in-place (same overlay box).

```
┌──────────────────────────────────────────────────┐
│  arkanoid.guide » Main                    B=back │  ← header
├──────────────────────────────────────────────────┤
│                                                  │
│  ARKANOID DOOR v2.1 by Spot/Up Rough             │
│                                                  │
│  Classic Arkanoid breakout game for              │
│  AmiExpress BBS.                                 │
│                                                  │
│  [1] Installation                                │
│  [2] Configuration                               │
│  [3] Scoring & High Scores                       │
│                                                  │
├──────────────────────────────────────────────────┤
│  Lines 1-20/45  ↑↓ scroll  1-9 follow link  B back│
└──────────────────────────────────────────────────┘
```

**Plain text / NFO (`.txt`, `.nfo`):**
- Read with `amigafs.readFileSync`.
- Render in `ScrollableBox`. `↑`/`↓` scroll, `B` goes back to file browser.

**AmigaGuide (`.guide`):**
- Import `AmigaGuideParser` from `../../web/backend/src/amigaguide/AmigaGuideParser` (same Node.js process).
- Render with `parser.renderNode(nodeName, width, maxLines, scrollOffset)`.
- Links shown as `[1]`, `[2]` etc. Number keys `1`–`9` follow links.
- Breadcrumb trail in header: `filename.guide » NodeName`.
- `B` goes back one node (history stack), or back to file browser if at root node.
- `P`/`N` for prev/next nodes if defined in guide.

---

## Path Resolution Fix (backend)

**`amigaDoorManager.ts` — `deleteTypeScriptDoor()`:**

Strip `Doors/` prefix from identifier if present, so both `arkanoid` and `Doors/arkanoid` work:

```typescript
const name = identifier.replace(/^Doors\//i, '');
const doorPath = path.join(this.bbsRoot, 'Doors', name);
```

Also verify `this.bbsRoot` is the **project root**, not `dataDir`, for TypeScript doors. If `config.get('dataDir') !== projectRoot`, use a separate `projectRoot` config value or derive it from `__dirname`.

---

## SDK Components Used

| Component | Usage |
|-----------|-------|
| `Panel` | Door list panel, info panel |
| `List` | Door list items |
| `ScrollableBox` | Door info pane, file viewer content |
| `ConfirmModal` | Delete confirmation |
| `FileManager` | Directory navigation in overlay |
| `DoorInputManager` | Input lifecycle management |
| `AmigaGuideParser` | Guide file rendering (imported from backend) |
| `amigafs` | Case-insensitive file path resolution |

---

## Build & Registration

- `cd Doors/door-manager && npm run build` before testing.
- Door registered via `Doors/door-manager/door-manager.info`.
- `start-servers.sh --bbs-only` auto-builds on source change.

---

## Verification

**Automated:** `npx tsc --noEmit` in `Doors/door-manager/` after each file.

**Manual checklist:**
- [ ] Door list loads and scrolls correctly
- [ ] Info pane shows correct details for selected door
- [ ] Enable/disable toggles and refreshes list
- [ ] Delete: ConfirmModal opens, confirm deletes door, list refreshes, door is gone from filesystem
- [ ] Delete: cancel does nothing
- [ ] `F` opens file browser overlay for selected door
- [ ] Directory navigation works (enter subdir, backspace goes up, cannot go above door root)
- [ ] Readable files open in viewer, dimmed files do not
- [ ] Plain text/NFO scrolls correctly
- [ ] Guide renders with links, number keys follow links, B goes back through history
- [ ] ESC from file browser closes overlay, returns to door list
- [ ] ESC from file viewer goes back to browser (not closes overlay)
- [ ] Responsive: info pane hides below 100 cols
