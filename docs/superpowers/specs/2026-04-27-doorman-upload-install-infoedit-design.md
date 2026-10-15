---
date: 2026-04-27
topic: doorman-upload-install-infoedit
tags: [doorman, door-manager, lzx, wasm, door-install, info-editor]
status: final
---

# Doorman: Archive Upload/Install + .info Editor

## Overview

Two new sysop features for the doorman (door-manager) TypeScript door:

1. **Upload & Install** — sysop uploads a door archive (ZIP/LHA/LZH/LZX); doorman extracts it, auto-detects type, places files in `Doors/`, creates the `Commands/BBSCmd/` registration `.info`, and hot-reloads the door list.
2. **.info Editor** — sysop selects an installed door and edits its `Commands/BBSCmd/<CMD>.info` tooltypes in-place.

Both features are self-contained. No frontend (BBSTerminal/React) changes are required.

---

## Subsystem 1: LZX WASM Module

### Location
`web/backend/wasm/lzx/` — a Rust crate that depends on `bitplane/amiga-lzx` (WTFPL).

### Build
```
wasm-pack build --target nodejs
```
Output: `web/backend/wasm/lzx/pkg/` (committed to repo so Docker build does not require Rust toolchain).

### TypeScript wrapper
`web/backend/src/utils/extractors/lzx-wasm-extractor.ts`

- Implements `IArchiveExtractor` (same interface as all existing extractors: `listFiles`, `extractFile`, `getEntries`)
- Adds `packFiles(entries: {name: string; data: Buffer}[], outputPath: string): Promise<void>` for creating `.lzx` archives
- Lazy-loaded singleton — WASM module initialised once on first call, cached

### Integration
`web/backend/src/utils/archive-extractor.ts` `getExtractorForFile()`: replace the current `lzx` case (which uses the decompression-only stub) with the new WASM extractor. The stub `lzx-extractor.ts` is deleted.

### Verification
Unit test: round-trip a small file — pack with `packFiles`, extract with `getEntries`, compare bytes.

---

## Subsystem 2: Door Installer

### Location
`web/backend/src/doors/door-installer.ts` — new `DoorInstaller` class.

### Method: `install(archivePath: string): Promise<InstallResult>`

```typescript
interface InstallResult {
  success: boolean;
  message: string;
  doorName?: string;   // directory name under Doors/
  command?: string;    // BBSCmd command string
  type?: string;       // 'typescript' | 'XIM' | etc.
}
```

**Flow:**

1. Detect archive format from extension; get extractor via `getExtractorForFile()`.
2. Extract all entries to `Doors/archives/.tmp-<uuid>/`.
3. **Type detection:**
   - Presence of `package.json` containing `doorMetadata.command`, `bbsCommand`, `amiexpress.command`, or `name` → TypeScript door.
   - Presence of an Amiga `.info` binary + a non-JS executable → 68K door.
   - Neither → return `{ success: false, message: 'Cannot detect door type. Contents: <listing>' }`.
4. **Directory name:**
   - TypeScript: `package.json` `name` field, lowercased, spaces→hyphens.
   - 68K: archive filename stem (strip extension), lowercased.
   - If `Doors/<name>/` already exists → return error (do not overwrite).
5. Move temp dir to `Doors/<name>/`.
6. **TypeScript registration:**
   - Command name priority: `amiexpress.command` → `doorMetadata.command` → `bbsCommand` → `name.toUpperCase()`.
   - Create `Commands/BBSCmd/<CMD>.info` with: `BBSCMD=<CMD>`, `TYPE=TS`, `LOCATION=Doors/<name>`, `DESCRIPTION=<description from package.json>`, `ACCESS=0`, `MULTINODE=YES`, `PRIORITY=SAME`.
   - If no `dist/` directory present in the extracted files: run `npm install && npm run build` inside `Doors/<name>/`. Log output. If build fails, clean up the directory and return error.
7. **68K registration:**
   - Parse the embedded `.info` file using `parseInfoFile()` to read existing tooltypes.
   - Determine the executable path (LOCATION= tooltype in the embedded .info, or first non-.info binary found).
   - Normalise path to `Doors/<name>/<executable>` (Amiga `DOORS:` prefix → `Doors/`).
   - Create `Commands/BBSCmd/<CMD>.info` mirroring embedded tooltypes, overriding LOCATION with the normalised path.
8. Call `refreshDoorCache()` then `initializeDoors()`.
9. Clean up temp dir if still present. Return `InstallResult`.

### Security
Path traversal guard: every extracted entry path is checked to be inside the target directory before writing. Entries with `../` components are rejected and the whole install is aborted.

---

## Subsystem 3: BBSApi Methods

### `requestArchiveUpload(): Promise<{ path: string; filename: string }>`

```
session.pendingDoorUpload = true
socket.emit('show-file-upload', { accept: '.zip,.lha,.lzh,.lzx', maxSize: 100MB, multiple: false })
return new Promise(resolve => {
  session.pendingDoorUploadCallback = resolve;
})
```

Resolved by the socket handler (see below). Times out after 5 minutes (rejects, clears flag).

### `installDoor(archivePath: string): Promise<InstallResult>`

Instantiates `DoorInstaller`, calls `install(archivePath)`, returns result.

---

## Subsystem 4: file-socket-handlers.ts Change

`processFileUpload()` already receives `data.path` — by the time it is called, the uploaded file has been written to disk (in `Node0/Playpen/` for the socket path, or the HTTP upload temp location). Both the `file-upload` and `file-uploaded` handlers funnel into `processFileUpload()` with a `path`.

Add this check **at the top of `processFileUpload()`**, before the existing `inDoorManager` guard:

```typescript
if (session.pendingDoorUpload && data.path) {
  const archivesDir = path.join(config.get('dataDir'), 'Doors', 'archives');
  fs.mkdirSync(archivesDir, { recursive: true });
  const destPath = path.join(archivesDir, path.basename(data.filename));
  fs.copyFileSync(data.path, destPath);
  session.pendingDoorUpload = false;
  session.pendingDoorUploadCallback?.({ path: destPath, filename: data.filename });
  session.pendingDoorUploadCallback = undefined;
  return;
}
```

Also register an `upload-cancelled` socket handler in `BBSApi.requestArchiveUpload()` to reject the Promise and clear `session.pendingDoorUpload` when the user dismisses the file picker.

---

## Subsystem 5: Doorman UI

### New keybindings (added to existing `screen.key()` blocks)

| Key | Action |
|-----|--------|
| `U` | Upload and install a door archive |
| `I` | Edit .info for the selected door |

Footer bar content updated to include `{yellow-fg}[U]{/yellow-fg}pload  {yellow-fg}[I]{/yellow-fg}nfo`.

### Upload flow (inline in `app.ts`, no separate file)

```
U pressed
  → setStatus('Waiting for file selection...')
  → bbs.requestArchiveUpload()        [shows browser file picker]
    → user selects file
  → setStatus('Installing <filename>...')
  → bbs.installDoor(path)
    → success: setStatus('Installed: <CMD> (<type>)', 'green')
               doors = await fetchDoors(bbs)
               populateList()
    → failure: setStatus('Install failed: <message>', 'red')
  ESC before file selected: bbs cancels pending upload, setStatus('Upload cancelled')
```

### InfoEditorOverlay (`Doors/door-manager/InfoEditorOverlay.ts`, new file)

**Data source:** `Commands/BBSCmd/<CMD>.info` — the registration file. Read via `bbs.readInfoFile('Commands/BBSCmd/<CMD>.info')`.

**Layout:**
- Full-screen neo-blessed overlay (same approach as `FileExplorerOverlay`)
- Header: `{cyan-fg}EDIT: <CMD>.info{/cyan-fg}`
- Body: two-column `List` — key (fixed width, non-editable) | value (editable)
- Footer: `{yellow-fg}Enter{/yellow-fg}=Edit  {yellow-fg}Ctrl+S{/yellow-fg}=Save  {yellow-fg}ESC{/yellow-fg}=Cancel`

**Interaction:**
- Arrow keys navigate rows
- `Enter` on a row opens a single-line text input (`blessed.textbox`) pre-filled with current value
- `Enter` in textbox confirms; `ESC` in textbox cancels edit
- `Ctrl+S` calls `bbs.writeInfoFile('Commands/BBSCmd/<CMD>.info', updatedTooltypes)`, shows "Saved" status, closes overlay
- `ESC` at list level closes overlay without saving (confirm modal if there are unsaved changes)

**Tooltypes shown:** all tooltypes from the .info file. Common fields: `BBSCMD`, `TYPE`, `LOCATION`, `DESCRIPTION`, `ACCESS`, `MULTINODE`, `CATEGORY`, `PRIORITY`, `PRELOADER`.

---

## File Inventory

### New files
| File | Purpose |
|------|---------|
| `web/backend/wasm/lzx/Cargo.toml` | Rust crate definition |
| `web/backend/wasm/lzx/src/lib.rs` | WASM bindings wrapping `amiga-lzx` |
| `web/backend/wasm/lzx/pkg/` | wasm-pack output (committed) |
| `web/backend/src/utils/extractors/lzx-wasm-extractor.ts` | TS wrapper implementing `IArchiveExtractor` + `packFiles` |
| `web/backend/src/doors/door-installer.ts` | `DoorInstaller` class |
| `Doors/door-manager/InfoEditorOverlay.ts` | .info editor overlay |

### Modified files
| File | Change |
|------|--------|
| `web/backend/src/utils/archive-extractor.ts` | `lzx` case → `LzxWasmExtractor`; remove old stub import |
| `web/backend/src/utils/extractors/lzx-extractor.ts` | Deleted |
| `web/backend/src/doors/BBSApi.ts` | Add `requestArchiveUpload()`, `installDoor()` |
| `web/backend/src/server/file-socket-handlers.ts` | Handle `pendingDoorUpload` in `processFileUpload()` |
| `web/backend/src/index.ts` | Add `pendingDoorUpload`, `pendingDoorUploadCallback` to session type |
| `Doors/door-manager/app.ts` | Add `U`/`I` keybindings, upload flow, `InfoEditorOverlay` integration |

---

## Automated Verification

- `npx tsc --noEmit` (backend) — zero errors
- `npm run build` (door-manager) — zero errors
- Unit test: LZX round-trip (pack → extract → compare)
- Unit test: `DoorInstaller.install()` with a minimal ZIP containing a fake TypeScript door
- Unit test: `DoorInstaller.install()` with a minimal LHA containing a fake 68K door structure

## Manual Verification

- Upload a real `.zip` TypeScript door archive → door appears in doorman list → can run it
- Upload a `.lha` 68K door archive → door appears in list
- Upload an unsupported/corrupt archive → clear error message, no partial state left on disk
- Press `I` on installed door → .info editor opens with correct tooltypes → edit a field → save → re-open confirms change
- Press `I` on a 68K door → same workflow
