# Doorman Upload/Install + .info Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add archive upload/install and .info editing to the doorman (door-manager) BBS door, backed by a full LZX WASM module.

**Architecture:** A Rust crate wraps `bitplane/amiga-lzx` and is compiled to WASM with wasm-pack; a TypeScript wrapper replaces the stub LZX extractor. A new `DoorInstaller` class extracts uploaded archives, auto-detects door type, places files, and calls the existing `registerDoor()` service. Two new BBSApi methods (`requestArchiveUpload`, `installDoor`) and a one-function change to `file-socket-handlers.ts` wire the upload through the existing BBS socket upload path. The doorman door gains two keybindings: `U` (upload+install) and `I` (edit registration .info).

**Tech Stack:** Rust + wasm-bindgen 0.2, wasm-pack, `amiga-lzx` 0.1.3, serde/serde_json; TypeScript, adm-zip (already installed), Node.js `child_process`; neo-blessed for the .info editor overlay.

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `web/backend/wasm/lzx/Cargo.toml` | Rust crate metadata and dependencies |
| `web/backend/wasm/lzx/src/lib.rs` | WASM bindings: `lzx_extract_all`, `lzx_list_files`, `lzx_pack` |
| `web/backend/wasm/lzx/pkg/` | wasm-pack output — committed to repo |
| `web/backend/src/utils/extractors/lzx-wasm-extractor.ts` | `LzxWasmExtractor` implementing `IArchiveExtractor` + `packFiles()` |
| `web/backend/src/doors/door-installer.ts` | `DoorInstaller.install(archivePath)` |
| `web/backend/tests/doors/lzx-wasm-extractor.test.ts` | LZX round-trip test |
| `web/backend/tests/doors/door-installer.test.ts` | Installer tests |
| `Doors/door-manager/InfoEditorOverlay.ts` | Full-screen .info editor overlay |

### Modified files
| File | Change |
|------|--------|
| `web/backend/src/utils/archive-extractor.ts` | `lzx` case → `LzxWasmExtractor` |
| `web/backend/src/utils/extractors/lzx-extractor.ts` | Deleted |
| `web/backend/src/doors/BBSApi.ts` | Add `requestArchiveUpload()`, `installDoor()` |
| `web/backend/src/server/file-socket-handlers.ts` | Handle `pendingDoorUpload` in `processFileUpload()` |
| `web/backend/src/index.ts` | Add `pendingDoorUpload`, `pendingDoorUploadCallback` to `BBSSession` |
| `Doors/door-manager/app.ts` | Add `U`/`I` keybindings, upload flow, `InfoEditorOverlay` integration; update footer |

---

## Task 1: LZX WASM — Rust crate

**Files:**
- Create: `web/backend/wasm/lzx/Cargo.toml`
- Create: `web/backend/wasm/lzx/src/lib.rs`

The `amiga-lzx` 0.1.3 API (confirmed from crate source):
- `ArchiveWriter::new(writer) -> Result<ArchiveWriter>` — streaming writer
- `ArchiveWriter::add_entry(EntryBuilder) -> Result<EntryWriter>` — returns `impl Write`
- `EntryWriter::finish() -> Result<()>` — finalise entry
- `ArchiveWriter::finish() -> Result<W>` — finalise archive, returns inner writer
- `EntryBuilder::new(name: &str)` — filenames must be Latin-1
- `ArchiveReader::new(reader) -> Result<ArchiveReader>`
- `ArchiveReader::next_entry() -> Result<Option<Entry>>`
- `Entry` fields: `filename: String`, `data: Vec<u8>`

- [ ] **Step 1: Create directory and Cargo.toml**

```bash
mkdir -p web/backend/wasm/lzx/src
```

`web/backend/wasm/lzx/Cargo.toml`:
```toml
[package]
name = "lzx-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen = "0.2"
amiga-lzx = "0.1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[profile.release]
opt-level = "z"
lto = true
```

- [ ] **Step 2: Write lib.rs**

`web/backend/wasm/lzx/src/lib.rs`:
```rust
use std::io::{Cursor, Write};
use wasm_bindgen::prelude::*;
use amiga_lzx::{ArchiveReader, ArchiveWriter, EntryBuilder};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct ExtractedEntry {
    name: String,
    data: Vec<u8>,
}

#[derive(Deserialize)]
struct PackEntry {
    name: String,
    data: Vec<u8>,
}

/// Extract all entries from an LZX archive.
/// Returns a JSON string: [{name: string, data: number[]}]
#[wasm_bindgen]
pub fn lzx_extract_all(archive_bytes: &[u8]) -> Result<String, JsValue> {
    let mut reader = ArchiveReader::new(Cursor::new(archive_bytes))
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let mut entries: Vec<ExtractedEntry> = Vec::new();
    while let Some(entry) = reader.next_entry()
        .map_err(|e| JsValue::from_str(&e.to_string()))?
    {
        entries.push(ExtractedEntry { name: entry.filename, data: entry.data });
    }
    serde_json::to_string(&entries).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// List filenames in an LZX archive.
/// Returns a JSON string: string[]
#[wasm_bindgen]
pub fn lzx_list_files(archive_bytes: &[u8]) -> Result<String, JsValue> {
    let mut reader = ArchiveReader::new(Cursor::new(archive_bytes))
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let mut names: Vec<String> = Vec::new();
    while let Some(entry) = reader.next_entry()
        .map_err(|e| JsValue::from_str(&e.to_string()))?
    {
        names.push(entry.filename);
    }
    serde_json::to_string(&names).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Create an LZX archive from entries.
/// entries_json: JSON string [{name: string, data: number[]}]
/// Returns the raw archive bytes.
#[wasm_bindgen]
pub fn lzx_pack(entries_json: &str) -> Result<Vec<u8>, JsValue> {
    let pack_entries: Vec<PackEntry> = serde_json::from_str(entries_json)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let buf: Vec<u8> = Vec::new();
    let mut writer = ArchiveWriter::new(Cursor::new(buf))
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    for e in &pack_entries {
        let mut entry = writer.add_entry(EntryBuilder::new(&e.name))
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        entry.write_all(&e.data)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        entry.finish().map_err(|e| JsValue::from_str(&e.to_string()))?;
    }
    let cursor = writer.finish().map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(cursor.into_inner())
}
```

- [ ] **Step 3: Build with wasm-pack**

```bash
cd web/backend/wasm/lzx
wasm-pack build --target nodejs
```

Expected: `pkg/` directory created containing `lzx_wasm.js`, `lzx_wasm_bg.wasm`, `lzx_wasm.d.ts`.

- [ ] **Step 4: Verify the pkg exports match**

```bash
node -e "const w = require('./pkg/lzx_wasm'); console.log(Object.keys(w));"
```

Expected output includes: `lzx_extract_all`, `lzx_list_files`, `lzx_pack`

- [ ] **Step 5: Add pkg/ to .gitignore exclusion (track it)**

The pkg/ must be committed so Docker builds don't need Rust. Add to project `.gitignore` if `wasm/` is currently ignored:

```bash
grep -n "wasm" .gitignore 2>/dev/null || echo "not ignored"
# If wasm is ignored, add an exception:
# !web/backend/wasm/lzx/pkg/
```

- [ ] **Step 6: Commit**

```bash
git add web/backend/wasm/lzx/
git commit -m "feat(lzx): add amiga-lzx WASM crate (pack + extract)"
```

---

## Task 2: LZX WASM — TypeScript wrapper + archive-extractor integration

**Files:**
- Create: `web/backend/src/utils/extractors/lzx-wasm-extractor.ts`
- Create: `web/backend/tests/doors/lzx-wasm-extractor.test.ts`
- Modify: `web/backend/src/utils/archive-extractor.ts`
- Delete: `web/backend/src/utils/extractors/lzx-extractor.ts`

- [ ] **Step 1: Write the failing test**

`web/backend/tests/doors/lzx-wasm-extractor.test.ts`:
```typescript
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { LzxWasmExtractor } from '../../src/utils/extractors/lzx-wasm-extractor';

const extractor = new LzxWasmExtractor();

describe('LzxWasmExtractor', () => {
  let tmpDir: string;
  let archivePath: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lzx-test-'));
    archivePath = path.join(tmpDir, 'test.lzx');

    // Pack a test archive
    await extractor.packFiles(
      [
        { name: 'hello.txt', data: Buffer.from('hello world') },
        { name: 'sub/dir/data.bin', data: Buffer.from([1, 2, 3, 4, 5]) },
      ],
      archivePath,
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('packFiles creates a readable archive', () => {
    expect(fs.existsSync(archivePath)).toBe(true);
    expect(fs.statSync(archivePath).size).toBeGreaterThan(0);
  });

  test('listFiles returns entry names', async () => {
    const names = await extractor.listFiles(archivePath);
    expect(names).toContain('hello.txt');
    expect(names).toContain('sub/dir/data.bin');
  });

  test('getEntries returns entries with correct sizes', async () => {
    const entries = await extractor.getEntries(archivePath);
    const hello = entries.find(e => e.name === 'hello.txt')!;
    expect(hello).toBeDefined();
    expect(hello.size).toBe(11);
  });

  test('extractFile returns correct content', async () => {
    const buf = await extractor.extractFile(archivePath, 'hello.txt');
    expect(buf).not.toBeNull();
    expect(buf!.toString()).toBe('hello world');
  });

  test('extractFile is case-insensitive', async () => {
    const buf = await extractor.extractFile(archivePath, 'HELLO.TXT');
    expect(buf).not.toBeNull();
  });

  test('round-trip preserves binary data', async () => {
    const original = Buffer.from([0, 1, 127, 128, 255]);
    const rtPath = path.join(tmpDir, 'rt.lzx');
    await extractor.packFiles([{ name: 'binary.bin', data: original }], rtPath);
    const extracted = await extractor.extractFile(rtPath, 'binary.bin');
    expect(extracted).toEqual(original);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web/backend && npx jest tests/doors/lzx-wasm-extractor.test.ts --no-coverage
```

Expected: FAIL — `LzxWasmExtractor` not found

- [ ] **Step 3: Write the implementation**

`web/backend/src/utils/extractors/lzx-wasm-extractor.ts`:
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseArchiveExtractor, ArchiveEntry } from '../archive-extractor';

let wasmModule: any = null;

function getWasm(): any {
  if (!wasmModule) {
    const pkgPath = path.join(__dirname, '..', '..', '..', 'wasm', 'lzx', 'pkg', 'lzx_wasm');
    wasmModule = require(pkgPath);
  }
  return wasmModule;
}

export class LzxWasmExtractor extends BaseArchiveExtractor {
  constructor() {
    super('LZX');
  }

  async listFiles(filepath: string): Promise<string[]> {
    const wasm = getWasm();
    const bytes = await fs.readFile(filepath);
    const json = wasm.lzx_list_files(new Uint8Array(bytes)) as string;
    return JSON.parse(json) as string[];
  }

  async getEntries(filepath: string): Promise<ArchiveEntry[]> {
    const wasm = getWasm();
    const bytes = await fs.readFile(filepath);
    const json = wasm.lzx_extract_all(new Uint8Array(bytes)) as string;
    const entries = JSON.parse(json) as Array<{ name: string; data: number[] }>;
    return entries.map(e => ({
      name: e.name,
      size: e.data.length,
      data: Buffer.from(e.data),
    }));
  }

  async extractFile(filepath: string, filename: string): Promise<Buffer | null> {
    const entries = await this.getEntries(filepath);
    const lower = filename.toLowerCase();
    const match = entries.find(e => e.name.toLowerCase() === lower);
    if (!match || !match.data) return null;
    return match.data as Buffer;
  }

  async packFiles(
    entries: Array<{ name: string; data: Buffer }>,
    outputPath: string,
  ): Promise<void> {
    const wasm = getWasm();
    const json = JSON.stringify(
      entries.map(e => ({ name: e.name, data: Array.from(e.data) })),
    );
    const result = wasm.lzx_pack(json) as Uint8Array;
    await fs.writeFile(outputPath, Buffer.from(result));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web/backend && npx jest tests/doors/lzx-wasm-extractor.test.ts --no-coverage
```

Expected: PASS (all 6 tests green)

- [ ] **Step 5: Integrate into archive-extractor.ts**

In `web/backend/src/utils/archive-extractor.ts`, find the `lzx` case in `getExtractorForFile()`:

```typescript
// BEFORE (around line 219):
    case 'lzx':
      const { LzxExtractor } = await import('./extractors/lzx-extractor');
      return new LzxExtractor();

// AFTER:
    case 'lzx':
      const { LzxWasmExtractor } = await import('./extractors/lzx-wasm-extractor');
      return new LzxWasmExtractor();
```

- [ ] **Step 6: Delete the old stub**

```bash
rm web/backend/src/utils/extractors/lzx-extractor.ts
```

Check nothing imports it:
```bash
grep -r "lzx-extractor" web/backend/src/ --include="*.ts"
```

Expected: no output

- [ ] **Step 7: Typecheck**

```bash
cd web/backend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add web/backend/src/utils/extractors/lzx-wasm-extractor.ts \
        web/backend/src/utils/archive-extractor.ts \
        web/backend/tests/doors/lzx-wasm-extractor.test.ts
git rm web/backend/src/utils/extractors/lzx-extractor.ts
git commit -m "feat(lzx): replace stub extractor with WASM pack+extract implementation"
```

---

## Task 3: DoorInstaller — TypeScript door path

**Files:**
- Create: `web/backend/src/doors/door-installer.ts`
- Create: `web/backend/tests/doors/door-installer.test.ts`

Key dependency: existing `registerDoor()` in `web/backend/src/services/door-install.service.ts` creates `Commands/BBSCmd/<CMD>.info` from a `package.json`. `DoorInstaller` calls it after extracting and placing the archive.

Note: `registerDoor()` checks `pkg.bbsCommand || name.toUpperCase().replace(/-/g, '')`. We pre-normalise to also check `pkg.amiexpress?.command` and `pkg.doorMetadata?.command`.

- [ ] **Step 1: Write the failing tests**

`web/backend/tests/doors/door-installer.test.ts`:
```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
const AdmZip = require('adm-zip');

// We test DoorInstaller without the real archive-extractor chain.
// Stub getExtractorForFile so the test doesn't need WASM loaded.

jest.mock('../../src/utils/archive-extractor', () => ({
  getExtractorForFile: jest.fn(),
}));
jest.mock('../../src/handlers/door.handler', () => ({
  initializeDoors: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/doors/amigaDoorManager', () => ({
  refreshDoorCache: jest.fn().mockResolvedValue(undefined),
  getAmigaDoorManager: jest.fn(),
}));

import { DoorInstaller } from '../../src/doors/door-installer';
import { getExtractorForFile } from '../../src/utils/archive-extractor';

function makeZipWithPackage(pkg: object, extraFiles: Record<string, string> = {}): Buffer {
  const zip = new AdmZip();
  zip.addFile('package.json', Buffer.from(JSON.stringify(pkg)));
  zip.addFile('dist/index.js', Buffer.from('module.exports = {};'));
  for (const [name, content] of Object.entries(extraFiles)) {
    zip.addFile(name, Buffer.from(content));
  }
  return zip.toBuffer();
}

function stubExtractor(zipBuf: Buffer) {
  const zip = new AdmZip(zipBuf);
  (getExtractorForFile as jest.Mock).mockResolvedValue({
    getEntries: async () =>
      zip.getEntries().map((e: any) => ({
        name: e.entryName,
        size: e.header.size,
        data: e.getData(),
      })),
  });
}

describe('DoorInstaller — TypeScript door', () => {
  let tmpRoot: string;
  let installer: DoorInstaller;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'door-install-'));
    installer = new DoorInstaller(tmpRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('installs a zip with bbsCommand in package.json', async () => {
    const pkg = { name: 'mygame', bbsCommand: 'MYGAME', description: 'A game', main: 'dist/index.js' };
    stubExtractor(makeZipWithPackage(pkg));

    const result = await installer.install('/fake/mygame.zip');

    expect(result.success).toBe(true);
    expect(result.doorName).toBe('mygame');
    expect(result.command).toBe('MYGAME');
    expect(result.type).toBe('typescript');
    expect(fs.existsSync(path.join(tmpRoot, 'Doors', 'mygame', 'dist', 'index.js'))).toBe(true);
    const infoContent = fs.readFileSync(
      path.join(tmpRoot, 'Commands', 'BBSCmd', 'MYGAME.info'),
      'utf8',
    );
    expect(infoContent).toContain('BBSCMD=MYGAME');
    expect(infoContent).toContain('LOCATION=Doors/mygame');
    expect(infoContent).toContain('TYPE=TS');
  });

  test('installs a zip with amiexpress.command in package.json', async () => {
    const pkg = {
      name: 'coolapp',
      amiexpress: { command: 'COOLAPP' },
      description: 'Cool app',
      main: 'dist/index.js',
    };
    stubExtractor(makeZipWithPackage(pkg));

    const result = await installer.install('/fake/coolapp.zip');

    expect(result.success).toBe(true);
    expect(result.command).toBe('COOLAPP');
  });

  test('strips top-level directory from archive', async () => {
    const zip = new AdmZip();
    zip.addFile('mygame/', Buffer.alloc(0));
    zip.addFile('mygame/package.json', Buffer.from(JSON.stringify({
      name: 'mygame', bbsCommand: 'MYGAME', main: 'dist/index.js',
    })));
    zip.addFile('mygame/dist/index.js', Buffer.from('module.exports = {};'));
    stubExtractor(zip.toBuffer());

    const result = await installer.install('/fake/mygame.zip');

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'Doors', 'mygame', 'package.json'))).toBe(true);
  });

  test('returns error if Doors/<name> already exists', async () => {
    const pkg = { name: 'existing', bbsCommand: 'EXISTING', main: 'dist/index.js' };
    fs.mkdirSync(path.join(tmpRoot, 'Doors', 'existing'), { recursive: true });
    stubExtractor(makeZipWithPackage(pkg));

    const result = await installer.install('/fake/existing.zip');

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/already exists/i);
  });

  test('returns error with listing if archive type is undetectable', async () => {
    (getExtractorForFile as jest.Mock).mockResolvedValue({
      getEntries: async () => [
        { name: 'readme.txt', size: 10, data: Buffer.from('hello') },
        { name: 'somefile.bin', size: 5, data: Buffer.from([1, 2, 3]) },
      ],
    });

    const result = await installer.install('/fake/unknown.zip');

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/cannot detect/i);
    expect(result.message).toContain('readme.txt');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd web/backend && npx jest tests/doors/door-installer.test.ts --no-coverage 2>&1 | head -20
```

Expected: FAIL — `DoorInstaller` not found

- [ ] **Step 3: Write DoorInstaller (TypeScript door path)**

`web/backend/src/doors/door-installer.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { getExtractorForFile } from '../utils/archive-extractor';
import { registerDoor } from '../services/door-install.service';
import { refreshDoorCache } from './amigaDoorManager';
import { parseInfoFile } from '../utils/info-file.util';
import * as amigafs from '../utils/amigafs';

const execAsync = promisify(exec);

export interface InstallResult {
  success: boolean;
  message: string;
  doorName?: string;
  command?: string;
  type?: string;
}

export class DoorInstaller {
  constructor(private readonly bbsRoot: string) {}

  async install(archivePath: string): Promise<InstallResult> {
    const extractor = await getExtractorForFile(archivePath);
    if (!extractor) {
      return { success: false, message: `Unsupported archive format: ${path.basename(archivePath)}` };
    }

    // 1. Extract all entries
    let entries: Array<{ name: string; size: number; data?: Buffer }>;
    try {
      entries = await extractor.getEntries(archivePath);
    } catch (err) {
      return { success: false, message: `Extraction failed: ${(err as Error).message}` };
    }

    // 2. Path traversal guard — reject any entry that escapes the target dir
    for (const entry of entries) {
      if (entry.name.includes('..') || path.isAbsolute(entry.name)) {
        return { success: false, message: `Unsafe path in archive: ${entry.name}` };
      }
    }

    // 3. Strip single top-level directory if all entries share one
    const strippedEntries = stripTopLevelDir(entries);

    // 4. Detect door type
    const detection = detectDoorType(strippedEntries);
    if (!detection) {
      const listing = strippedEntries.map(e => e.name).slice(0, 20).join(', ');
      return {
        success: false,
        message: `Cannot detect door type. Contents: ${listing}`,
      };
    }

    // 5. Determine directory name
    const doorName = detection.type === 'typescript'
      ? detection.pkgName!
      : path.basename(archivePath, path.extname(archivePath)).toLowerCase().replace(/\s+/g, '-');

    const doorDir = path.join(this.bbsRoot, 'Doors', doorName);
    if (amigafs.existsSync(doorDir)) {
      return { success: false, message: `Door directory already exists: Doors/${doorName}` };
    }

    // 6. Write files to Doors/<name>/
    try {
      fs.mkdirSync(doorDir, { recursive: true });
      for (const entry of strippedEntries) {
        if (!entry.data) continue;
        const dest = path.join(doorDir, entry.name);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, entry.data);
      }
    } catch (err) {
      fs.rmSync(doorDir, { recursive: true, force: true });
      return { success: false, message: `Failed to write files: ${(err as Error).message}` };
    }

    // 7. Register
    if (detection.type === 'typescript') {
      return this.registerTypeScriptDoor(doorDir, doorName);
    } else {
      return this.register68KDoor(doorDir, doorName, detection.infoEntryName!);
    }
  }

  private async registerTypeScriptDoor(doorDir: string, doorName: string): Promise<InstallResult> {
    const bbsCommandsDir = path.join(this.bbsRoot, 'Commands', 'BBSCmd');

    // Normalise package.json: promote amiexpress.command / doorMetadata.command to bbsCommand
    const pkgPath = path.join(doorDir, 'package.json');
    let pkg: any = {};
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { /* ignore */ }

    if (!pkg.bbsCommand && (pkg.amiexpress?.command || pkg.doorMetadata?.command)) {
      pkg.bbsCommand = (pkg.amiexpress?.command || pkg.doorMetadata?.command).toUpperCase();
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    }

    // Build if needed
    const entryPoint = pkg.main || 'dist/index.js';
    if (!fs.existsSync(path.join(doorDir, entryPoint))) {
      try {
        await execAsync('npm install && npm run build', { cwd: doorDir, timeout: 120_000 });
      } catch (err) {
        fs.rmSync(doorDir, { recursive: true, force: true });
        return {
          success: false,
          message: `Build failed: ${(err as any).stderr || (err as Error).message}`,
        };
      }
    }

    const result = registerDoor({ doorPath: doorDir, bbsCommandsDir, force: false });
    if (result.status === 'created' || result.status === 'overwritten') {
      await this.reload();
      return {
        success: true,
        message: `Installed TypeScript door: ${result.bbsCommand}`,
        doorName,
        command: result.bbsCommand,
        type: 'typescript',
      };
    }
    return {
      success: false,
      message: `Registration failed: ${result.message ?? result.status}`,
    };
  }

  private async register68KDoor(
    doorDir: string,
    doorName: string,
    infoEntryName: string,
  ): Promise<InstallResult> {
    const bbsCommandsDir = path.join(this.bbsRoot, 'Commands', 'BBSCmd');
    const infoPath = path.join(doorDir, infoEntryName);

    let tooltypes: Array<{ key: string; value: string; commented: boolean }> = [];
    try {
      const parsed = parseInfoFile(infoPath);
      tooltypes = parsed.tooltypes;
    } catch {
      // If binary parse fails try text parse
      const text = fs.readFileSync(infoPath, 'utf8');
      tooltypes = text.split('\n')
        .filter(l => l.includes('='))
        .map(l => {
          const [key, ...rest] = l.split('=');
          return { key: key.trim(), value: rest.join('=').trim(), commented: false };
        });
    }

    const get = (key: string) =>
      tooltypes.find(t => t.key.toUpperCase() === key)?.value ?? '';

    // Determine command name and executable path
    const cmdName = (get('BBSCMD') || get('CMDNAME') || path.basename(infoEntryName, '.info')).toUpperCase();
    const rawLocation = get('LOCATION') || get('LOCATION=') || '';
    const execName = rawLocation
      ? rawLocation.replace(/^DOORS:/i, '').replace(/:/g, '/').split('/').pop() || doorName
      : doorName;
    const location = `Doors/${doorName}/${execName}`;

    if (!fs.existsSync(bbsCommandsDir)) {
      fs.mkdirSync(bbsCommandsDir, { recursive: true });
    }

    const outInfoPath = path.join(bbsCommandsDir, `${cmdName}.info`);
    const description = get('DESCRIPTION') || get('TOOLTIP') || '';
    const access = get('ACCESS') || '0';
    const lines = [
      `BBSCMD=${cmdName}`,
      `TYPE=XIM`,
      `LOCATION=${location}`,
      description ? `DESCRIPTION=${description}` : null,
      `ACCESS=${access}`,
    ].filter(Boolean).join('\n');

    fs.writeFileSync(outInfoPath, lines);
    await this.reload();

    return {
      success: true,
      message: `Installed 68K door: ${cmdName}`,
      doorName,
      command: cmdName,
      type: 'XIM',
    };
  }

  private async reload(): Promise<void> {
    await refreshDoorCache();
    const { initializeDoors } = require('../handlers/door.handler');
    await initializeDoors();
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripTopLevelDir(
  entries: Array<{ name: string; size: number; data?: Buffer }>,
): Array<{ name: string; size: number; data?: Buffer }> {
  const nonEmpty = entries.filter(e => e.name && e.name !== '/');
  if (nonEmpty.length === 0) return entries;
  const parts = nonEmpty[0].name.split('/');
  if (parts.length < 2) return entries;
  const prefix = parts[0] + '/';
  const allShare = nonEmpty.every(e => e.name.startsWith(prefix) || e.name === prefix.slice(0, -1));
  if (!allShare) return entries;
  return nonEmpty
    .filter(e => e.name !== prefix.slice(0, -1))
    .map(e => ({ ...e, name: e.name.slice(prefix.length) }))
    .filter(e => e.name.length > 0);
}

interface Detection {
  type: 'typescript' | '68k';
  pkgName?: string;
  infoEntryName?: string;
}

function detectDoorType(
  entries: Array<{ name: string; data?: Buffer }>,
): Detection | null {
  // TypeScript: has package.json
  const pkgEntry = entries.find(e => e.name === 'package.json');
  if (pkgEntry?.data) {
    try {
      const pkg = JSON.parse(pkgEntry.data.toString('utf8'));
      const name: string = (pkg.name || 'door').toLowerCase().replace(/\s+/g, '-');
      return { type: 'typescript', pkgName: name };
    } catch { /* fall through */ }
  }

  // 68K: has a .info file (likely Amiga binary) + a binary executable
  const infoEntry = entries.find(e => e.name.toLowerCase().endsWith('.info') && !e.name.includes('/'));
  const hasExecutable = entries.some(
    e => !e.name.includes('.') || /\.(exe|xim|aim|sim|tim)$/i.test(e.name),
  );
  if (infoEntry && hasExecutable) {
    return { type: '68k', infoEntryName: infoEntry.name };
  }

  return null;
}
```

- [ ] **Step 4: Run tests**

```bash
cd web/backend && npx jest tests/doors/door-installer.test.ts --no-coverage
```

Expected: all TypeScript door tests pass; the 68K test doesn't exist yet (Task 4 adds it)

- [ ] **Step 5: Typecheck**

```bash
cd web/backend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add web/backend/src/doors/door-installer.ts web/backend/tests/doors/door-installer.test.ts
git commit -m "feat(installer): DoorInstaller with TS door detection and registration"
```

---

## Task 4: DoorInstaller — 68K door tests

**Files:**
- Modify: `web/backend/tests/doors/door-installer.test.ts`

- [ ] **Step 1: Add 68K door tests to the existing test file**

Append to `web/backend/tests/doors/door-installer.test.ts`:
```typescript
describe('DoorInstaller — 68K door', () => {
  let tmpRoot: string;
  let installer: DoorInstaller;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'door-install-68k-'));
    installer = new DoorInstaller(tmpRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('installs a 68K door from LHA entries', async () => {
    // Simulate what an LHA extractor returns for a 68K door archive
    (getExtractorForFile as jest.Mock).mockResolvedValue({
      getEntries: async () => [
        { name: 'WHO', size: 5000, data: Buffer.alloc(5000, 0x4e) },  // fake executable
        {
          name: 'WHO.info',
          size: 200,
          data: Buffer.from(
            'BBSCMD=WHO\nTYPE=XIM\nLOCATION=DOORS:WHO/WHO\nDESCRIPTION=Who is online\nACCESS=0',
          ),
        },
      ],
    });

    const result = await installer.install('/fake/who.lha');

    expect(result.success).toBe(true);
    expect(result.command).toBe('WHO');
    expect(result.type).toBe('XIM');
    expect(fs.existsSync(path.join(tmpRoot, 'Doors', 'who', 'WHO'))).toBe(true);

    const infoContent = fs.readFileSync(
      path.join(tmpRoot, 'Commands', 'BBSCmd', 'WHO.info'),
      'utf8',
    );
    expect(infoContent).toContain('BBSCMD=WHO');
    expect(infoContent).toContain('LOCATION=Doors/who/WHO');
  });

  test('rejects archive with path traversal', async () => {
    (getExtractorForFile as jest.Mock).mockResolvedValue({
      getEntries: async () => [
        { name: '../escape/evil.sh', size: 10, data: Buffer.from('rm -rf /') },
      ],
    });

    const result = await installer.install('/fake/evil.zip');

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/unsafe path/i);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd web/backend && npx jest tests/doors/door-installer.test.ts --no-coverage
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add web/backend/tests/doors/door-installer.test.ts
git commit -m "test(installer): add 68K door and path-traversal tests"
```

---

## Task 5: BBSApi methods + session type

**Files:**
- Modify: `web/backend/src/index.ts` (lines around 335–350 — BBSSession interface)
- Modify: `web/backend/src/doors/BBSApi.ts` (append two methods before closing brace)

- [ ] **Step 1: Add fields to BBSSession**

In `web/backend/src/index.ts`, find the `inDoorManager` line (currently ~335) and add after it:

```typescript
  inDoorManager?: boolean; // Whether user is currently in door manager
  pendingDoorUpload?: boolean;  // requestArchiveUpload() waiting for file-upload event
  pendingDoorUploadCallback?: ((result: { path: string; filename: string }) => void) | null;
  pendingDoorUploadReject?: ((reason: Error) => void) | null;
```

- [ ] **Step 2: Add BBSApi methods**

In `web/backend/src/doors/BBSApi.ts`, add before the final closing `}` of the `BBSApi` class:

```typescript
  /**
   * Request the user to upload a door archive via the browser file picker.
   * Resolves with the local path the archive was saved to once the upload
   * completes. Rejects after 5 minutes or if the user cancels.
   */
  requestArchiveUpload(): Promise<{ path: string; filename: string }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.session.pendingDoorUpload = false;
        this.session.pendingDoorUploadCallback = null;
        this.session.pendingDoorUploadReject = null;
        reject(new Error('Upload timed out after 5 minutes'));
      }, 5 * 60 * 1000);

      this.session.pendingDoorUpload = true;
      this.session.pendingDoorUploadCallback = (result) => {
        clearTimeout(timeout);
        this.session.pendingDoorUpload = false;
        this.session.pendingDoorUploadCallback = null;
        this.session.pendingDoorUploadReject = null;
        resolve(result);
      };
      this.session.pendingDoorUploadReject = (err) => {
        clearTimeout(timeout);
        this.session.pendingDoorUpload = false;
        this.session.pendingDoorUploadCallback = null;
        this.session.pendingDoorUploadReject = null;
        reject(err);
      };

      this.socket.emit('show-file-upload', {
        accept: '.zip,.lha,.lzh,.lzx',
        maxSize: 100 * 1024 * 1024,
        multiple: false,
      });
    });
  }

  /**
   * Install a door archive that was previously uploaded to the given path.
   * Extracts the archive, auto-detects door type, places files in Doors/,
   * creates Commands/BBSCmd/ registration, and reloads the door list.
   */
  async installDoor(archivePath: string): Promise<{
    success: boolean;
    message: string;
    doorName?: string;
    command?: string;
    type?: string;
  }> {
    const { config } = require('../config');
    const { DoorInstaller } = require('./door-installer');
    const installer = new DoorInstaller(config.get('dataDir'));
    return installer.install(archivePath);
  }
```

- [ ] **Step 3: Typecheck**

```bash
cd web/backend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add web/backend/src/index.ts web/backend/src/doors/BBSApi.ts
git commit -m "feat(bbsapi): add requestArchiveUpload() and installDoor() methods"
```

---

## Task 6: file-socket-handlers.ts — pendingDoorUpload branch

**Files:**
- Modify: `web/backend/src/server/file-socket-handlers.ts`

- [ ] **Step 1: Add pendingDoorUpload handling**

In `processFileUpload()` (around line 854 in the current file), add a new branch **before** the existing `session.inDoorManager` check:

```typescript
async function processFileUpload(
  socket: Socket,
  session: BBSSession,
  config: any,
  data: { filename: string; originalname: string; size: number; path?: string }
) {
  // NEW: Door archive upload — triggered by BBSApi.requestArchiveUpload()
  if (session.pendingDoorUpload && data.path) {
    const fs = require('fs');
    const path = require('path');
    const archivesDir = path.join(config.get('dataDir'), 'Doors', 'archives');
    fs.mkdirSync(archivesDir, { recursive: true });
    const destPath = path.join(archivesDir, path.basename(data.filename));
    fs.copyFileSync(data.path, destPath);
    session.pendingDoorUploadCallback?.({ path: destPath, filename: data.filename });
    return;
  }

  // existing code continues unchanged below...
```

- [ ] **Step 2: Handle upload-cancelled to reject the pending Promise**

Inside `registerFileHandlers(socket)`, add after the existing `file-uploaded` handler registration:

```typescript
  socket.on('upload-cancelled', () => {
    if (session.pendingDoorUpload) {
      session.pendingDoorUploadReject?.(new Error('Upload cancelled by user'));
    }
  });
```

- [ ] **Step 3: Typecheck**

```bash
cd web/backend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add web/backend/src/server/file-socket-handlers.ts
git commit -m "feat(upload): route pendingDoorUpload to archive path in processFileUpload"
```

---

## Task 7: InfoEditorOverlay

**Files:**
- Create: `Doors/door-manager/InfoEditorOverlay.ts`

The Commands/BBSCmd/ .info files used for door registration are **plain text** files (written by `registerDoor()`) in `KEY=VALUE\n` format. `bbs.readFile()` returns the raw text; `bbs.writeFile()` writes it back. No binary parser needed.

- [ ] **Step 1: Create InfoEditorOverlay.ts**

`Doors/door-manager/InfoEditorOverlay.ts`:
```typescript
import {
  Box,
  Panel,
  List,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import * as path from 'path';

interface InfoEditorOptions {
  screen: any;
  command: string;         // e.g. "ARKANOID"
  bbs: any;
  onClose: () => void;
}

interface Tooltype {
  key: string;
  value: string;
}

export class InfoEditorOverlay {
  private screen: any;
  private command: string;
  private bbs: any;
  private onClose: () => void;
  private overlay: any;
  private header: any;
  private footer: any;
  private listWidget: any;
  private tooltypes: Tooltype[] = [];
  private dirty = false;
  private infoPath: string;

  constructor(opts: InfoEditorOptions) {
    this.screen = opts.screen;
    this.command = opts.command.toUpperCase();
    this.bbs = opts.bbs;
    this.onClose = opts.onClose;
    this.infoPath = `Commands/BBSCmd/${this.command}.info`;
    this.buildUI();
    this.loadInfo().then(() => this.screen.render());
  }

  private buildUI(): void {
    this.overlay = new Box({
      parent: this.screen,
      top: 0, left: 0, width: '100%', height: '100%',
      style: { bg: 'black' },
      tags: true, keys: true, focusable: true,
    } as any);

    this.header = new Panel({
      parent: this.overlay,
      top: 0, left: 0, width: '100%', height: 3,
      tags: true,
      content: `  {cyan-fg}EDIT: ${this.command}.info{/cyan-fg}  `,
      style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
      focusable: false,
    } as any);

    this.footer = new Panel({
      parent: this.overlay,
      bottom: 0, left: 0, width: '100%', height: 3,
      tags: true,
      content: `{center}{yellow-fg}Enter{/yellow-fg}=Edit  {yellow-fg}Ctrl+S{/yellow-fg}=Save  {yellow-fg}ESC{/yellow-fg}=Cancel{/center}`,
      style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
      focusable: false,
    } as any);

    this.listWidget = new List({
      parent: this.overlay,
      top: 3, left: 0, width: '100%', height: '100%-6',
      keys: true, vi: true, mouse: true,
      tags: true,
      style: {
        selected: { bg: 'blue', fg: 'white' },
        item: { fg: 'white' },
      },
    } as any);

    this.listWidget.key(['enter'], () => { this.editSelected(); });

    this.overlay.key(['C-s'], async () => { await this.save(); });

    this.overlay.key(['escape'], async () => {
      if (this.dirty) {
        // simple confirm: just save before close
        await this.save();
      } else {
        this.close();
      }
    });

    this.listWidget.focus();
  }

  private async loadInfo(): Promise<void> {
    const content = await this.bbs.readFile(this.infoPath);
    if (!content) {
      this.tooltypes = [];
      (this.listWidget as any).setItems(['{red-fg}Cannot read .info file{/red-fg}']);
      return;
    }
    this.tooltypes = parseTooltypes(content as string);
    this.renderList();
  }

  private renderList(): void {
    const items = this.tooltypes.map(tt =>
      `{yellow-fg}${tt.key.padEnd(16)}{/yellow-fg} ${tt.value}`,
    );
    if (items.length === 0) items.push('{#555555-fg}(empty){/#555555-fg}');
    (this.listWidget as any).setItems(items);
  }

  private editSelected(): void {
    const idx: number = (this.listWidget as any).selected ?? 0;
    const tt = this.tooltypes[idx];
    if (!tt) return;

    // Use a simple blessed textbox for inline editing
    const blessed = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
    const input = blessed.textbox({
      parent: this.overlay,
      top: 3 + idx,
      left: 17,
      width: '100%-17',
      height: 1,
      value: tt.value,
      keys: true,
      mouse: true,
      inputOnFocus: true,
      style: { fg: 'white', bg: 'black', focus: { bg: 'blue' } },
    });

    input.focus();
    input.readInput(() => {
      const newValue = (input.value as string).trim();
      input.destroy();
      this.listWidget.focus();
      if (newValue !== tt.value) {
        this.tooltypes[idx] = { key: tt.key, value: newValue };
        this.dirty = true;
        this.renderList();
        (this.listWidget as any).select(idx);
        this.updateFooter('Unsaved changes — Ctrl+S to save');
      }
      this.screen.render();
    });

    this.screen.render();
  }

  private async save(): Promise<void> {
    const content = this.tooltypes.map(tt => `${tt.key}=${tt.value}`).join('\n') + '\n';
    const ok = await this.bbs.writeFile(this.infoPath, content);
    if (ok) {
      this.dirty = false;
      this.updateFooter('Saved', 'green');
      setTimeout(() => { this.close(); }, 800);
    } else {
      this.updateFooter('Save failed', 'red');
    }
    this.screen.render();
  }

  private updateFooter(msg: string, color: 'yellow' | 'green' | 'red' = 'yellow'): void {
    (this.footer as any).setContent(
      `{center}{${color}-fg}${msg}{/${color}-fg}{/center}`,
    );
  }

  private close(): void {
    this.overlay.destroy();
    this.onClose();
  }
}

function parseTooltypes(text: string): Tooltype[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => {
      const eq = l.indexOf('=');
      if (eq === -1) return { key: l, value: '' };
      return { key: l.slice(0, eq).trim(), value: l.slice(eq + 1).trim() };
    });
}
```

- [ ] **Step 2: Build door-manager**

```bash
cd Doors/door-manager && npm run build
```

Expected: 0 TypeScript errors, `dist/InfoEditorOverlay.js` created

- [ ] **Step 3: Commit**

```bash
git add Doors/door-manager/InfoEditorOverlay.ts Doors/door-manager/dist/
git commit -m "feat(doorman): add InfoEditorOverlay for editing door registration .info"
```

---

## Task 8: Doorman UI — U/I keybindings + upload flow

**Files:**
- Modify: `Doors/door-manager/app.ts`

- [ ] **Step 1: Add InfoEditorOverlay import**

At the top of `Doors/door-manager/app.ts`, after the existing `FileExplorerOverlay` import:

```typescript
import { InfoEditorOverlay } from './InfoEditorOverlay';
```

- [ ] **Step 2: Update footer content**

Find the footer Panel content string (currently contains `[F]iles  [D]elete  [E]nable  [T]est  [Q]uit`) and update it:

```typescript
// BEFORE:
content: `{center}{yellow-fg}[F]{/yellow-fg}iles  {yellow-fg}[D]{/yellow-fg}elete  {yellow-fg}[E]{/yellow-fg}nable  {yellow-fg}[T]{/yellow-fg}est  {yellow-fg}[Q]{/yellow-fg}uit{/center}`,

// AFTER:
content: `{center}{yellow-fg}[U]{/yellow-fg}pload  {yellow-fg}[I]{/yellow-fg}nfo  {yellow-fg}[F]{/yellow-fg}iles  {yellow-fg}[D]{/yellow-fg}elete  {yellow-fg}[E]{/yellow-fg}nable  {yellow-fg}[Q]{/yellow-fg}uit{/center}`,
```

- [ ] **Step 3: Add I keybinding (info editor)**

After the existing `(screen as any).key(['f', 'F'], ...)` block:

```typescript
  (screen as any).key(['i', 'I'], () => {
    const door = selectedDoor();
    if (!door) return;
    new InfoEditorOverlay({
      screen,
      command: door.command,
      bbs,
      onClose: () => { (doorList as any).focus(); screen.render(); },
    });
    screen.render();
  });
```

- [ ] **Step 4: Add U keybinding (upload + install)**

After the `I` keybinding block:

```typescript
  (screen as any).key(['u', 'U'], async () => {
    setStatus('Waiting for file selection...');
    let uploadResult: { path: string; filename: string };
    try {
      uploadResult = await (bbs as any).requestArchiveUpload();
    } catch (err) {
      setStatus(`Upload cancelled: ${(err as Error).message}`, 'yellow');
      return;
    }
    setStatus(`Installing ${uploadResult.filename}...`);
    try {
      const result = await (bbs as any).installDoor(uploadResult.path);
      if (result.success) {
        setStatus(`Installed: ${result.command} (${result.type})`, 'green');
        doors = await fetchDoors(bbs);
        populateList(0);
        updateInfoPane();
      } else {
        setStatus(`Install failed: ${result.message}`, 'red');
      }
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`, 'red');
    }
  });
```

- [ ] **Step 5: Build door-manager**

```bash
cd Doors/door-manager && npm run build
```

Expected: 0 TypeScript errors

- [ ] **Step 6: Typecheck backend**

```bash
cd web/backend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 7: Run all affected tests**

```bash
cd web/backend && npx jest tests/doors/ --no-coverage
```

Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add Doors/door-manager/app.ts Doors/door-manager/dist/
git commit -m "feat(doorman): add U upload/install and I info-editor keybindings"
```

---

## Self-Review Notes

**Spec coverage check:**
- [x] LZX WASM with pack + extract → Tasks 1–2
- [x] Door installer with TS and 68K detection → Tasks 3–4
- [x] Path traversal guard → Task 4 test + Task 3 code
- [x] BBSApi.requestArchiveUpload() + installDoor() → Task 5
- [x] file-socket-handlers pendingDoorUpload branch → Task 6
- [x] upload-cancelled rejection → Task 6
- [x] InfoEditorOverlay → Task 7
- [x] U and I keybindings → Task 8
- [x] Footer bar updated → Task 8
- [x] Build step if no dist/ → Task 3 registerTypeScriptDoor
- [x] amiexpress.command / doorMetadata.command normalisation → Task 3

**Key implementation notes:**
- `Commands/BBSCmd/*.info` files are plain text `KEY=VALUE` — `bbs.readFile`/`bbs.writeFile` is correct; do NOT use `bbs.readInfoFile`/`bbs.writeInfoFile` (those use the binary Amiga .info parser).
- The `file-upload` socket handler writes bytes to `Node0/Playpen/` before calling `processFileUpload`. By the time `processFileUpload` runs, `data.path` is the on-disk path — no raw byte handling needed.
- `wasm-pack --target nodejs` generates synchronous CJS require — no async init needed.
- `registerDoor()` checks `bbsCommand` field; the `DoorInstaller.registerTypeScriptDoor()` pre-normalises `amiexpress.command` / `doorMetadata.command` → `bbsCommand` before calling it.
