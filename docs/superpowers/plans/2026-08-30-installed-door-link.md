# Installed-Door Link (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every door installed from now on records what it is (its catalog archive) and what it wrote (its files), and neither door lets a sysop invent a command name.

**Architecture:** One server-side recorder writes both `door_installs` (the link) and `door_installed_files` (the files) in a single transaction, from what is actually on disk after extraction. Every install path calls it — DOORMAN owner mode, DOORMAN consumer mode, `amigaDoorManager`'s archive installer, and the DoorRepo C door through a new authenticated endpoint. The display rule (repo name wins over an implausible `.info` NAME) lives once, in `getDoorList`, so both doors inherit it.

**Tech Stack:** TypeScript (backend, `@swc/jest`), better-sqlite3, C89 (DoorRepo door, `make test-*`), blessed (DOORMAN UI).

**Spec:** `docs/superpowers/specs/2026-08-30-doorrepo-parity-design.md`

## Global Constraints

- **Phase A only.** Phases B–E of the spec (read APIs, write APIs, DOORREPO screens, DOORMAN retirement) get their own plans. Do not build them here.
- **The 370 already-installed doors are out of scope.** No backfill, no matcher, no migration. They must behave exactly as they do today.
- **Every fix ships a regression test that fails before it.** Temporarily revert the fix and confirm the test fails before committing.
- **Never mock the filesystem** in these tests. Both failures this work exists to fix were "the disk disagreed with the record". Use a temp BBS root with real files.
- **Type-check before every commit:** `cd web/backend && npx tsc --noEmit`.
- **A TypeScript door's `dist/` is what runs.** After editing `Doors/door-manager/*.ts`, run `cd Doors/door-manager && npm run build` and commit `dist/`.
- **Amiga text files are Latin-1 and often CRLF.** Never edit `.info`, `.cfg` or door text files with tools that re-encode; use `python3` with `newline=''` on both ends, or `sed`.
- **No emojis anywhere.** BBS/door/log output uses ASCII tokens: `[OK]`, `[SKIP]`, `[FAIL]`.
- **Hold pushes.** Commit locally; the sysop says when to deploy.

---

## File Structure

| File | Responsibility |
|---|---|
| `web/backend/src/doors/door-name-plausibility.ts` (create) | One pure predicate: does this `.info` NAME read like a name, or is it art/junk/an echo? |
| `web/backend/src/doors/door-install-record.ts` (create) | The recorder: writes `door_installs` + `door_installed_files` in one transaction, walking the install directory. |
| `web/backend/src/server/door-admin.routes.ts` (create) | `POST /api/doors/installed` plus the per-launch token check. Phase A adds only this route. |
| `web/backend/src/doors/door-launch-token.ts` (create) | Mint/verify the per-launch token the C door reads from `DoorRepo.token`. |
| `web/backend/src/doors/door-repo-metadata.ts` (modify) | Exact `archive_name` matching, and the precedence rule via the new predicate. |
| `web/backend/src/doors/amigaDoorManager.ts` (modify) | Its archive installer calls the recorder instead of `trackDoorFiles` alone. |
| `Doors/door-manager/install-core.ts` (modify) | `extractAndRegisterDoor` reports the command the archive named; no free-text name reaches it. |
| `Doors/door-manager/app.ts` (modify) | Both install paths drop the text prompt and confirm the archive's command instead. |
| `examples/doorrepo-c/flow.c` (modify) | `flow_command_from_listing()` — derive the command from the repo's `/files` listing. |
| `examples/doorrepo-c/doorrepo.c` (modify) | Install flow uses that instead of `ui_text_prompt`, and posts the install record. |

---

### Task 1: The name plausibility predicate

**Files:**
- Create: `web/backend/src/doors/door-name-plausibility.ts`
- Test: `web/backend/tests/doors/door-name-plausibility.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `isPlausibleDoorName(value: string | null | undefined, context?: { command?: string | null; archiveName?: string | null }): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { isPlausibleDoorName } from '../../src/doors/door-name-plausibility';

describe('isPlausibleDoorName', () => {
  it('rejects the ASCII art the live board actually carries', () => {
    // Straight off DOORMAN's panel, 2026-08-30.
    expect(isPlausibleDoorName('.______.')).toBe(false);
    expect(isPlausibleDoorName('|::  |____ \\:__:_')).toBe(false);
    expect(isPlausibleDoorName('-----------')).toBe(false);
  });

  it('rejects nothing at all', () => {
    expect(isPlausibleDoorName(null)).toBe(false);
    expect(isPlausibleDoorName('')).toBe(false);
    expect(isPlausibleDoorName('   ')).toBe(false);
  });

  it('rejects mojibake and high-bit runs', () => {
    expect(isPlausibleDoorName('���')).toBe(false);
    expect(isPlausibleDoorName('±±±±±')).toBe(false);
  });

  it('rejects an echo of the command or the archive', () => {
    expect(isPlausibleDoorName('AEHELP', { command: 'AEHELP' })).toBe(false);
    expect(isPlausibleDoorName('-D-CALC', { archiveName: '-D-CALC.LHA' })).toBe(false);
  });

  it('keeps a name a sysop plainly meant', () => {
    expect(isPlausibleDoorName('Hack Check')).toBe(true);
    expect(isPlausibleDoorName('AmiExpress Help System', { command: 'AEHELP' })).toBe(true);
    expect(isPlausibleDoorName('BaudCheck v0.1')).toBe(true);
    expect(isPlausibleDoorName('Trivia!')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- web/backend/tests/doors/door-name-plausibility.test.ts`
Expected: FAIL — `Cannot find module '../../src/doors/door-name-plausibility'`

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Does this .info NAME read like a name?
 *
 * Several doors on the live board carry ASCII art in their NAME tooltype, so
 * DOORMAN's panel showed `[??] .______.` where a title belongs. The catalog
 * knows the real title, but a sysop who typed a name meant it - so the
 * question is not "is there a value" but "is this value a name at all".
 *
 * Deliberately conservative: anything that could be a name is kept. A wrong
 * override is worse than a missed one.
 */

/** `Some Door v2!` -> `somedoorv2`, for comparing a name against a command. */
function compareKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isPlausibleDoorName(
  value: string | null | undefined,
  context: { command?: string | null; archiveName?: string | null } = {}
): boolean {
  const name = (value ?? '').trim();
  if (name.length === 0) return false;

  // Mojibake: a decode already went wrong, so the bytes are unrecoverable here.
  if (name.includes('�')) return false;

  const letters = (name.match(/[a-z]/gi) ?? []).length;
  // A name needs letters. Box-drawing runs, rules and high-bit art have none
  // worth speaking of.
  if (letters < 2) return false;

  // Art is mostly not letters and digits. Two thirds is generous: "AVH-BaudCheck
  // v0.1" is 74% alphanumeric, "|::  |____ \:__:_" is 6%.
  const alphanumeric = (name.match(/[a-z0-9]/gi) ?? []).length;
  if (alphanumeric / name.length < 0.5) return false;

  // A run of high-bit characters is Amiga art, not a title.
  if (/[-ÿ]{3,}/.test(name)) return false;

  // An echo of what we already show beside it tells the sysop nothing, and
  // the catalog has a real title.
  const key = compareKey(name);
  if (context.command && key === compareKey(context.command)) return false;
  if (context.archiveName) {
    const archiveBase = context.archiveName.replace(/\.(lha|lzx|zip|lzh)$/i, '');
    if (key === compareKey(archiveBase)) return false;
  }

  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- web/backend/tests/doors/door-name-plausibility.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Type-check and commit**

```bash
cd web/backend && npx tsc --noEmit && cd ../..
git add web/backend/src/doors/door-name-plausibility.ts web/backend/tests/doors/door-name-plausibility.test.ts
git commit -m "feat(doors): a predicate for whether a .info NAME is a name"
```

---

### Task 2: Precedence and exact matching in the overlay

**Files:**
- Modify: `web/backend/src/doors/door-repo-metadata.ts:130-147` (`applyRepoMetadata`)
- Test: `web/backend/tests/doors/door-repo-metadata.test.ts` (extend)

**Interfaces:**
- Consumes: `isPlausibleDoorName` (Task 1); `buildMetadataIndex`, `metadataKey`, `archiveKey`, `RepoDoorMetadata` (existing).
- Produces: `applyRepoMetadata<T>(door: T, index: Map<string, RepoDoorMetadata>, link?: { archiveName: string | null }): T` — the third parameter is new and optional; existing callers keep working.

- [ ] **Step 1: Write the failing test**

```ts
import { applyRepoMetadata, buildMetadataIndex } from '../../src/doors/door-repo-metadata';

const index = buildMetadataIndex([
  {
    archiveName: 'HACKCHK.LHA',
    name: 'Hack Check',
    description: 'Checks for known hacks',
    category: 'Security',
    author: null,
    releaseGroup: null,
    doorType: 'XIM',
  },
]);

describe('applyRepoMetadata precedence', () => {
  it('replaces a NAME that is ASCII art with the catalog name', () => {
    const door = { command: 'HACKCHECK', name: '.______.', description: '' };

    expect(applyRepoMetadata(door, index, { archiveName: 'HACKCHK.LHA' })).toMatchObject({
      name: 'Hack Check',
      description: 'Checks for known hacks',
    });
  });

  it('keeps a NAME the sysop plainly meant', () => {
    const door = { command: 'HACKCHECK', name: 'My Hack Checker', description: '' };

    expect(applyRepoMetadata(door, index, { archiveName: 'HACKCHK.LHA' }).name)
      .toBe('My Hack Checker');
  });

  it('matches on the linked archive exactly, not on a name that happens to look alike', () => {
    // No name/command match exists here: the link is the only way in.
    const door = { command: 'ZZ9', name: '.______.', description: '' };

    expect(applyRepoMetadata(door, index, { archiveName: 'HACKCHK.LHA' }).name)
      .toBe('Hack Check');
  });

  it('leaves an unlinked door to the old heuristic', () => {
    const door = { command: 'ZZ9', name: '.______.', description: '' };

    expect(applyRepoMetadata(door, index).name).toBe('.______.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- web/backend/tests/doors/door-repo-metadata.test.ts`
Expected: FAIL — the art name survives; `applyRepoMetadata` takes two arguments.

- [ ] **Step 3: Write the implementation**

Replace `applyRepoMetadata` with:

```ts
export function applyRepoMetadata<T extends EnrichableDoor>(
  door: T,
  index: Map<string, RepoDoorMetadata>,
  link?: { archiveName: string | null }
): T {
  if (index.size === 0) return door;

  // A door installed through DOORMAN or DOORREPO records the archive it came
  // from, so it is looked up by that and nothing else. The name/command
  // heuristics below exist only for the doors that predate the recorder.
  const match = link?.archiveName
    ? index.get(archiveKey(link.archiveName)) ?? null
    : index.get(metadataKey(door.name)) ?? index.get(metadataKey(door.command)) ?? null;
  if (!match) return door;

  // The repo's name wins when the door's own is not a name at all - art,
  // mojibake, or an echo of the command. Anything a sysop plainly wrote is
  // kept, which is why this asks a predicate rather than testing for empty.
  const keepOwnName = isPlausibleDoorName(door.name, {
    command: door.command,
    archiveName: link?.archiveName ?? null,
  });

  return {
    ...door,
    name: keepOwnName ? door.name : (match.name || door.name),
    description: door.description || match.description || '',
    category: door.category || match.category || undefined,
  };
}
```

Add the import at the top of the file:

```ts
import { isPlausibleDoorName } from './door-name-plausibility';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- web/backend/tests/doors/door-repo-metadata.test.ts`
Expected: PASS, including the file's existing tests.

- [ ] **Step 5: Pass the link at the call site**

In `web/backend/src/doors/BBSApi.ts:1396-1399`, replace the overlay call so the install record's archive reaches it:

```ts
    try {
      const repoIndex = await getRepoMetadataIndex();
      return withMetadata.map((door: any) => {
        let archiveName: string | null = null;
        try {
          archiveName = getInstallByCommand(door.command)?.archive_name ?? null;
        } catch { /* the installs table may not exist yet */ }
        return applyRepoMetadata(door, repoIndex, { archiveName });
      });
    } catch {
      return withMetadata;
```

- [ ] **Step 6: Verify the fix would fail without itself, then commit**

Temporarily revert `keepOwnName` to `Boolean(door.name)`, run the test file, confirm two tests fail, restore.

```bash
cd web/backend && npx tsc --noEmit && cd ../..
git add web/backend/src/doors/door-repo-metadata.ts web/backend/src/doors/BBSApi.ts web/backend/tests/doors/door-repo-metadata.test.ts
git commit -m "feat(doors): the catalog name wins over a NAME that is not a name"
```

---

### Task 3: The recorder

**Files:**
- Create: `web/backend/src/doors/door-install-record.ts`
- Test: `web/backend/tests/doors/door-install-record.test.ts`

**Interfaces:**
- Consumes: `recordInstall`, `DoorInstall` (`./door-installs.repository`); `db.trackDoorFiles` (`../database`).
- Produces:
  - `walkInstalledFiles(bbsRoot: string, installDir: string, infoPath: string, extras?: string[]): Array<{ filePath: string; fileType: 'dir' | 'info' | 'library' | 'file' }>`
  - `recordDoorInstall(input: DoorInstallInput): void` where
    ```ts
    interface DoorInstallInput {
      bbsRoot: string;
      command: string;
      archiveName: string;
      installDir: string;   // absolute
      infoPath: string;     // absolute
      extraFiles?: string[];// absolute, e.g. Libs/*.library
      metadata?: {
        catalogId?: string | null; name?: string | null; description?: string | null;
        category?: string | null; version?: string | null; releaseGroup?: string | null;
        md5?: string | null; doorType?: string | null; sourceUrl?: string | null;
        sourceRevision?: string | null;
      };
    }
    ```

- [ ] **Step 1: Write the failing test**

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const tracked: Array<{ command: string; entries: any[] }> = [];
const installs: any[] = [];

jest.mock('../../src/database', () => ({
  db: { trackDoorFiles: jest.fn((command: string, entries: any[]) => { tracked.push({ command, entries }); }) },
}));
jest.mock('../../src/doors/door-installs.repository', () => ({
  recordInstall: jest.fn((entry: any) => { installs.push(entry); }),
}));

import { recordDoorInstall, walkInstalledFiles } from '../../src/doors/door-install-record';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-record-'));
  tracked.length = 0;
  installs.length = 0;
  fs.mkdirSync(path.join(root, 'Doors', 'AEHELP', 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Doors', 'AEHELP', 'AEHelp'), 'binary');
  fs.writeFileSync(path.join(root, 'Doors', 'AEHELP', 'data', 'help.txt'), 'text');
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info'), 'TYPE=XIM\n');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('walkInstalledFiles', () => {
  it('lists what is on disk, relative to the BBS root', () => {
    const entries = walkInstalledFiles(
      root,
      path.join(root, 'Doors', 'AEHELP'),
      path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info')
    );

    const paths = entries.map(e => e.filePath);
    expect(paths).toContain(path.join('Commands', 'BBSCmd', 'AEHELP.info'));
    expect(paths).toContain(path.join('Doors', 'AEHELP'));
    expect(paths).toContain(path.join('Doors', 'AEHELP', 'AEHelp'));
    expect(paths).toContain(path.join('Doors', 'AEHELP', 'data', 'help.txt'));
    expect(entries.find(e => e.filePath === path.join('Doors', 'AEHELP'))!.fileType).toBe('dir');
    expect(entries.find(e => e.filePath.endsWith('AEHELP.info'))!.fileType).toBe('info');
  });

  it('marks a library as one, wherever it sits', () => {
    fs.mkdirSync(path.join(root, 'Libs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Libs', 'aehelp.library'), 'lib');

    const entries = walkInstalledFiles(
      root,
      path.join(root, 'Doors', 'AEHELP'),
      path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info'),
      [path.join(root, 'Libs', 'aehelp.library')]
    );

    expect(entries.find(e => e.filePath === path.join('Libs', 'aehelp.library'))!.fileType)
      .toBe('library');
  });
});

describe('recordDoorInstall', () => {
  it('writes the link and the file list together', () => {
    recordDoorInstall({
      bbsRoot: root,
      command: 'AEHELP',
      archiveName: 'AEHELP.LHA',
      installDir: path.join(root, 'Doors', 'AEHELP'),
      infoPath: path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info'),
      metadata: { name: 'AmiExpress Help', version: 'v1.2', sourceRevision: 'rev9' },
    });

    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      command: 'AEHELP',
      archive_name: 'AEHELP.LHA',
      install_dir: path.join('Doors', 'AEHELP'),
      name: 'AmiExpress Help',
      version: 'v1.2',
      source_revision: 'rev9',
    });

    expect(tracked).toHaveLength(1);
    expect(tracked[0].command).toBe('AEHELP');
    expect(tracked[0].entries.map((e: any) => e.filePath))
      .toContain(path.join('Doors', 'AEHELP', 'AEHelp'));
  });

  it('records the files even when the install row cannot be written', () => {
    // A bookkeeping failure must not lose the file list: the delete needs it
    // more than the menu needs the metadata.
    const { recordInstall } = require('../../src/doors/door-installs.repository');
    (recordInstall as jest.Mock).mockImplementationOnce(() => { throw new Error('db locked'); });

    recordDoorInstall({
      bbsRoot: root,
      command: 'AEHELP',
      archiveName: 'AEHELP.LHA',
      installDir: path.join(root, 'Doors', 'AEHELP'),
      infoPath: path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info'),
    });

    expect(tracked).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- web/backend/tests/doors/door-install-record.test.ts`
Expected: FAIL — `Cannot find module '../../src/doors/door-install-record'`

- [ ] **Step 3: Write the implementation**

```ts
/**
 * What an install did, recorded in both halves.
 *
 * Two failures on the live board came from the board not knowing what it had
 * installed: DD kept its registration after its files were deleted, and
 * BROADCAST kept a registration pointing at files that were never there. The
 * board had 370 registered commands and zero rows in `door_installed_files`,
 * because only one of three install paths ever wrote it.
 *
 * This is the one place an install is recorded, and it writes both:
 *
 *   door_installs        the LINK - which catalog archive this command is
 *   door_installed_files the FILES - what landed on disk, so a delete can
 *                        remove exactly that and no more
 *
 * The file list is walked from the disk after extraction rather than taken
 * from the extractor's own report: what matters at delete time is what is
 * actually there.
 */
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../database';
import { recordInstall } from './door-installs.repository';

export type InstalledFileType = 'dir' | 'info' | 'library' | 'file';

export interface InstalledFileEntry {
  filePath: string;
  fileType: InstalledFileType;
}

export interface DoorInstallInput {
  bbsRoot: string;
  command: string;
  archiveName: string;
  installDir: string;
  infoPath: string;
  extraFiles?: string[];
  metadata?: {
    catalogId?: string | null;
    name?: string | null;
    description?: string | null;
    category?: string | null;
    version?: string | null;
    releaseGroup?: string | null;
    md5?: string | null;
    doorType?: string | null;
    sourceUrl?: string | null;
    sourceRevision?: string | null;
  };
}

function classify(absPath: string): InstalledFileType {
  if (absPath.toLowerCase().endsWith('.library')) return 'library';
  if (absPath.toLowerCase().endsWith('.info')) return 'info';
  return 'file';
}

export function walkInstalledFiles(
  bbsRoot: string,
  installDir: string,
  infoPath: string,
  extras: string[] = []
): InstalledFileEntry[] {
  const entries: InstalledFileEntry[] = [];
  const add = (absPath: string, fileType: InstalledFileType): void => {
    entries.push({ filePath: path.relative(bbsRoot, absPath), fileType });
  };

  if (fs.existsSync(infoPath)) add(infoPath, 'info');

  if (fs.existsSync(installDir)) {
    add(installDir, 'dir');
    const walk = (dir: string): void => {
      for (const name of fs.readdirSync(dir)) {
        const child = path.join(dir, name);
        let stats: fs.Stats;
        try { stats = fs.statSync(child); } catch { continue; }
        if (stats.isDirectory()) {
          add(child, 'dir');
          walk(child);
        } else {
          add(child, classify(child));
        }
      }
    };
    walk(installDir);
  }

  for (const extra of extras) {
    if (fs.existsSync(extra)) add(extra, classify(extra));
  }

  return entries;
}

export function recordDoorInstall(input: DoorInstallInput): void {
  const files = walkInstalledFiles(input.bbsRoot, input.installDir, input.infoPath, input.extraFiles);

  // Files first, deliberately. A delete needs the file list more than the
  // menu needs a description, so a failure writing the metadata row must not
  // take the file list with it.
  try {
    db.trackDoorFiles(input.command, files);
  } catch (err) {
    console.log(`[door-install] file list not recorded for ${input.command}: ${(err as Error).message}`);
  }

  const meta = input.metadata ?? {};
  try {
    recordInstall({
      id: `install-${input.command}`,
      catalog_id: meta.catalogId ?? null,
      archive_name: input.archiveName,
      command: input.command,
      install_dir: path.relative(input.bbsRoot, input.installDir),
      door_type: meta.doorType ?? null,
      name: meta.name ?? null,
      md5: meta.md5 ?? null,
      description: meta.description ?? null,
      category: meta.category ?? null,
      version: meta.version ?? null,
      release_group: meta.releaseGroup ?? null,
      source_url: meta.sourceUrl ?? null,
      source_revision: meta.sourceRevision ?? null,
    });
  } catch (err) {
    console.log(`[door-install] install row not recorded for ${input.command}: ${(err as Error).message}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- web/backend/tests/doors/door-install-record.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Type-check and commit**

```bash
cd web/backend && npx tsc --noEmit && cd ../..
git add web/backend/src/doors/door-install-record.ts web/backend/tests/doors/door-install-record.test.ts
git commit -m "feat(doors): one recorder writes both halves of an install"
```

---

### Task 4: DOORMAN's installs go through the recorder

**Files:**
- Modify: `Doors/door-manager/install-core.ts` (the `recordInstall` dep's shape)
- Modify: `Doors/door-manager/app.ts` (both install call sites — owner mode and `installConsumerDoor`'s deps)
- Test: `web/backend/tests/doors/doorman-records-install.test.ts` (extend)

**Interfaces:**
- Consumes: `recordDoorInstall` (Task 3), reached the way DOORMAN already reaches backend modules — `getInstallsRepo()`-style `require.cache` lookup in `ViewManager.ts`.
- Produces: `InstallDeps.recordInstall` gains a third argument: `(command: string, installDirRelative: string, archiveName: string) => void`.

- [ ] **Step 1: Write the failing test**

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { extractAndRegisterDoor } from '../../../../Doors/door-manager/install-core';

it('hands the recorder the archive the door came from', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-record-'));
  const installDir = path.join(root, 'Doors', 'AEHELP');
  const infoPath = path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info');
  fs.mkdirSync(path.dirname(infoPath), { recursive: true });
  const recorded: Array<[string, string, string]> = [];

  await extractAndRegisterDoor(
    path.join(root, 'AEHELP.LHA'), installDir, infoPath, 'XIM', 'AEHelp', 'AEHELP',
    {
      extractArchiveTo: async () => { fs.mkdirSync(installDir, { recursive: true }); return { ok: true, fileCount: 1 }; },
      findExtractedBinary: () => 'AEHelp',
      writeInfoFile: (p: string, c: string) => fs.writeFileSync(p, c),
      recordInstall: (cmd: string, dir: string, archive: string) => { recorded.push([cmd, dir, archive]); },
      refreshDoorRegistry: async () => true,
    } as any,
    'AEHELP.LHA'
  );

  expect(recorded).toEqual([['AEHELP', 'Doors/AEHELP', 'AEHELP.LHA']]);
  fs.rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- web/backend/tests/doors/doorman-records-install.test.ts`
Expected: FAIL — `recordInstall` is called with two arguments, and `extractAndRegisterDoor` takes no archive name.

- [ ] **Step 3: Thread the archive name through**

In `Doors/door-manager/install-core.ts`, change the dep's type and the call:

```ts
  /** Called once the door is on disk under the command the ARCHIVE named.
   *  `archiveName` is the catalog key, so the install can be recorded as a
   *  link rather than a guess. */
  recordInstall: (command: string, installDirRelative: string, archiveName: string) => void;
```

Add a trailing parameter to `extractAndRegisterDoor(..., deps: InstallDeps, archiveName: string)` and change its call:

```ts
    deps.recordInstall(command, `Doors/${command}`, archiveName);
```

In `Doors/door-manager/app.ts`, both install sites pass `e.archive_name` as the new argument and record through the recorder rather than `recordInstallSafe` alone:

```ts
                  recordInstall: (installedCmd, installedDir, archive) => {
                    const chk = (cmd: string) => getInstallsRepo()?.getInstallByCommand(cmd) ?? null;
                    if (commandClaimedByOtherArchive(chk, installedCmd, archive)) return;
                    getInstallRecorder()?.recordDoorInstall({
                      bbsRoot: PROJECT_ROOT,
                      command: installedCmd,
                      archiveName: archive,
                      installDir: path.join(PROJECT_ROOT, installedDir),
                      infoPath: path.join(PROJECT_ROOT, 'Commands', 'BBSCmd', `${installedCmd}.info`),
                      metadata: {
                        catalogId: e.id ?? null,
                        name: e.name ?? null,
                        description: e.description ?? null,
                        category: e.category ?? null,
                        version: e.version ?? null,
                        releaseGroup: e.release_group ?? null,
                        doorType: e.door_type ?? null,
                      },
                    });
                  },
```

Add `getInstallRecorder()` beside `getInstallsRepo()` in `Doors/door-manager/ViewManager.ts`, following that function exactly:

```ts
/** The backend's install recorder, if this process has it loaded. Same
 *  require.cache discovery as getInstallsRepo(): DOORMAN cannot import
 *  web/backend source paths. */
export function getInstallRecorder(): any {
  for (const k of Object.keys(require.cache))
    if (k.includes('door-install-record')) return require.cache[k]?.exports ?? null;
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- web/backend/tests/doors/doorman-records-install.test.ts web/backend/tests/doors/doorman-consumer-install.test.ts`
Expected: PASS. `doorman-consumer-install.test.ts` needs its `recordInstall` stubs widened to three arguments.

- [ ] **Step 5: Rebuild dist, type-check, commit**

```bash
cd Doors/door-manager && npm run build && cd ../..
cd web/backend && npx tsc --noEmit && cd ../..
git add Doors/door-manager/install-core.ts Doors/door-manager/app.ts Doors/door-manager/ViewManager.ts Doors/door-manager/dist web/backend/tests/doors/doorman-records-install.test.ts web/backend/tests/doors/doorman-consumer-install.test.ts
git commit -m "feat(doorman): an install records the archive it came from"
```

---

### Task 5: The archive installer records too

**Files:**
- Modify: `web/backend/src/doors/amigaDoorManager.ts:1169-1181` (the `trackDoorFiles` block)
- Test: `web/backend/tests/doors/delete-door-registration.test.ts` (extend)

**Interfaces:**
- Consumes: `recordDoorInstall` (Task 3).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
it('an install through the archive installer is linked to its archive', async () => {
  // Not the DOORMAN path: the installer the admin upload uses.
  const manager = new AmigaDoorManager(root);
  const { doorDir, infoPath } = makeDoor('AEHELP');

  (manager as any).recordInstalled('AEHELP', 'AEHELP.LHA', doorDir, infoPath);

  expect(recordedInstalls[0]).toMatchObject({
    command: 'AEHELP',
    archiveName: 'AEHELP.LHA',
  });
});
```

Add to that file's mocks:

```ts
const recordedInstalls: any[] = [];
jest.mock('../../src/doors/door-install-record', () => ({
  recordDoorInstall: jest.fn((input: any) => { recordedInstalls.push(input); }),
  walkInstalledFiles: jest.fn(() => []),
}));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- web/backend/tests/doors/delete-door-registration.test.ts`
Expected: FAIL — `recordInstalled` is not a function.

- [ ] **Step 3: Replace the tracking block with the recorder**

In `amigaDoorManager.ts`, replace the `trackedEntries` block (lines 1169-1181) with a call to a new private method, and add that method:

```ts
        this.recordInstalled(commandName, archiveName, doorDestDir, infoDestPath);
```

```ts
  /** One install, recorded in both halves. The archive name is the catalog
   *  key: without it the board has files it cannot explain, which is how 370
   *  commands ended up with zero tracked files between them. */
  private recordInstalled(
    command: string,
    archiveName: string,
    installDir: string,
    infoPath: string
  ): void {
    const { recordDoorInstall } = require('./door-install-record');
    recordDoorInstall({
      bbsRoot: this.bbsRoot,
      command,
      archiveName,
      installDir,
      infoPath,
    });
  }
```

`archiveName` is already in scope at the call site as the uploaded archive's basename; if it is not, pass `path.basename(archivePath)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- web/backend/tests/doors/delete-door-registration.test.ts`
Expected: PASS, 14 tests

- [ ] **Step 5: Type-check and commit**

```bash
cd web/backend && npx tsc --noEmit && cd ../..
git add web/backend/src/doors/amigaDoorManager.ts web/backend/tests/doors/delete-door-registration.test.ts
git commit -m "feat(doors): the archive installer records the link too"
```

---

### Task 6: The per-launch token

**Files:**
- Create: `web/backend/src/doors/door-launch-token.ts`
- Test: `web/backend/tests/doors/door-launch-token.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `mintLaunchToken(bbsRoot: string, session: { nodeId: number | string; userId: number; secLevel: number }): string`
  - `verifyLaunchToken(token: string | undefined): { nodeId: string; userId: number; secLevel: number } | null`
  - `revokeLaunchToken(token: string): void`

- [ ] **Step 1: Write the failing test**

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mintLaunchToken, verifyLaunchToken, revokeLaunchToken } from '../../src/doors/door-launch-token';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-token-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('writes a token the C door can read, and verifies it back', () => {
  const token = mintLaunchToken(root, { nodeId: 2, userId: 7, secLevel: 255 });

  const onDisk = fs.readFileSync(path.join(root, 'Doors', 'DoorRepo', 'DoorRepo.token'), 'latin1').trim();
  expect(onDisk).toBe(token);
  expect(verifyLaunchToken(token)).toMatchObject({ userId: 7, secLevel: 255 });
});

it('refuses a token that was never minted, or was revoked', () => {
  expect(verifyLaunchToken('nope')).toBeNull();
  expect(verifyLaunchToken(undefined)).toBeNull();

  const token = mintLaunchToken(root, { nodeId: 1, userId: 7, secLevel: 255 });
  revokeLaunchToken(token);
  expect(verifyLaunchToken(token)).toBeNull();
});

it('replaces the previous token for the same node', () => {
  const first = mintLaunchToken(root, { nodeId: 1, userId: 7, secLevel: 255 });
  const second = mintLaunchToken(root, { nodeId: 1, userId: 7, secLevel: 255 });

  expect(verifyLaunchToken(first)).toBeNull();
  expect(verifyLaunchToken(second)).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- web/backend/tests/doors/door-launch-token.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * A token the DoorRepo door presents when it asks this BBS to do something.
 *
 * The door is 68K code running under the emulator: it never sees the
 * backend's environment, so the token is written where it already reads its
 * configuration - `Doors/DoorRepo/DoorRepo.token`, Latin-1, one line.
 *
 * Minted per launch and held in memory only. A door management API reachable
 * at bbs.uprough.net without one would be a remote door-wipe button, and this
 * board has already lost its whole Doors/ tree once.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface LaunchTokenClaims {
  nodeId: string;
  userId: number;
  secLevel: number;
}

const live = new Map<string, LaunchTokenClaims>();

export function mintLaunchToken(
  bbsRoot: string,
  session: { nodeId: number | string; userId: number; secLevel: number }
): string {
  const nodeId = String(session.nodeId);

  // One token per node: a new launch invalidates the previous one, so a
  // token left in a stale file cannot be replayed.
  for (const [existing, claims] of live) {
    if (claims.nodeId === nodeId) live.delete(existing);
  }

  const token = crypto.randomBytes(24).toString('hex');
  live.set(token, { nodeId, userId: session.userId, secLevel: session.secLevel });

  const tokenPath = path.join(bbsRoot, 'Doors', 'DoorRepo', 'DoorRepo.token');
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, `${token}\n`, 'latin1');

  return token;
}

export function verifyLaunchToken(token: string | undefined): LaunchTokenClaims | null {
  if (!token) return null;
  return live.get(token) ?? null;
}

export function revokeLaunchToken(token: string): void {
  live.delete(token);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- web/backend/tests/doors/door-launch-token.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Type-check and commit**

```bash
cd web/backend && npx tsc --noEmit && cd ../..
git add web/backend/src/doors/door-launch-token.ts web/backend/tests/doors/door-launch-token.test.ts
git commit -m "feat(doors): a per-launch token for the DoorRepo door"
```

---

### Task 7: POST /api/doors/installed

**Files:**
- Create: `web/backend/src/server/door-admin.routes.ts`
- Modify: `web/backend/src/server/app.ts` (mount it beside the other routers)
- Test: `web/backend/tests/server/door-admin-routes.test.ts`

**Interfaces:**
- Consumes: `recordDoorInstall` (Task 3), `verifyLaunchToken` (Task 6).
- Produces: `doorAdminRouter` (Express Router).

- [ ] **Step 1: Write the failing test**

```ts
import express from 'express';
import request from 'supertest';

const recorded: any[] = [];
jest.mock('../../src/doors/door-install-record', () => ({
  recordDoorInstall: jest.fn((input: any) => { recorded.push(input); }),
}));

let claims: any = { nodeId: '1', userId: 7, secLevel: 255 };
jest.mock('../../src/doors/door-launch-token', () => ({
  verifyLaunchToken: jest.fn(() => claims),
}));

import { doorAdminRouter } from '../../src/server/door-admin.routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/doors', doorAdminRouter);
  return a;
}

beforeEach(() => { recorded.length = 0; claims = { nodeId: '1', userId: 7, secLevel: 255 }; });

it('records an install the door reports', async () => {
  const res = await request(app())
    .post('/api/doors/installed')
    .set('X-Door-Token', 'valid')
    .send({ command: 'AEHELP', archiveName: 'AEHELP.LHA' });

  expect(res.status).toBe(200);
  expect(res.text).toContain('OK');
  expect(recorded[0]).toMatchObject({ command: 'AEHELP', archiveName: 'AEHELP.LHA' });
});

it('refuses without a token', async () => {
  claims = null;
  const res = await request(app())
    .post('/api/doors/installed')
    .send({ command: 'AEHELP', archiveName: 'AEHELP.LHA' });

  expect(res.status).toBe(401);
  expect(recorded).toHaveLength(0);
});

it('refuses a user who is not a sysop, token or no token', async () => {
  claims = { nodeId: '1', userId: 9, secLevel: 100 };
  const res = await request(app())
    .post('/api/doors/installed')
    .set('X-Door-Token', 'valid')
    .send({ command: 'AEHELP', archiveName: 'AEHELP.LHA' });

  expect(res.status).toBe(403);
  expect(recorded).toHaveLength(0);
});

it('refuses a command that is not a command', async () => {
  const res = await request(app())
    .post('/api/doors/installed')
    .set('X-Door-Token', 'valid')
    .send({ command: '../../etc', archiveName: 'AEHELP.LHA' });

  expect(res.status).toBe(400);
  expect(recorded).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- web/backend/tests/server/door-admin-routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * This board's own door management API.
 *
 * Deliberately NOT under /api/door-repo/*, which proxies out to the door
 * server: these routes act on THIS board's installed doors. Phase A adds one
 * route - the install record the DoorRepo C door reports after it installs
 * something. Reads and the remaining writes arrive in phases B and C.
 *
 * Text responses, not JSON: the client is a C89 door.
 */
import express, { NextFunction, Request, Response } from 'express';
import * as path from 'path';
import { recordDoorInstall } from '../doors/door-install-record';
import { verifyLaunchToken } from '../doors/door-launch-token';

export const doorAdminRouter = express.Router();

/** A BBS command: A-Z, 0-9, up to 12 - the same shape the C door validates
 *  and the only shape that can name a Commands/BBSCmd/<CMD>.info. */
function isCommandName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{1,12}$/.test(value);
}

doorAdminRouter.use((req: Request, res: Response, next: NextFunction) => {
  const claims = verifyLaunchToken(req.header('X-Door-Token') ?? undefined);
  if (!claims) {
    res.status(401).type('text/plain').send('UNAUTHORIZED\r\n');
    return;
  }
  // The token says which session this is; it does not say what that session
  // may do. Checked server-side on every request, never inferred.
  if (claims.secLevel < 250) {
    res.status(403).type('text/plain').send('FORBIDDEN\r\n');
    return;
  }
  (req as any).doorClaims = claims;
  next();
});

doorAdminRouter.post('/installed', (req: Request, res: Response) => {
  const { command, archiveName, metadata } = req.body ?? {};
  if (!isCommandName(command) || typeof archiveName !== 'string' || archiveName.length === 0) {
    res.status(400).type('text/plain').send('BAD REQUEST\r\n');
    return;
  }

  const bbsRoot = process.env.BBS_DATA_DIR || process.cwd();
  recordDoorInstall({
    bbsRoot,
    command: command.toUpperCase(),
    archiveName,
    installDir: path.join(bbsRoot, 'Doors', command.toUpperCase()),
    infoPath: path.join(bbsRoot, 'Commands', 'BBSCmd', `${command.toUpperCase()}.info`),
    metadata: metadata ?? {},
  });

  res.status(200).type('text/plain').send('OK\r\n');
});
```

Mount it in `web/backend/src/server/app.ts`, beside the door-repo proxy:

```ts
import { doorAdminRouter } from './door-admin.routes';
...
app.use('/api/doors', express.json({ limit: '16kb' }), doorAdminRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- web/backend/tests/server/door-admin-routes.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Type-check and commit**

```bash
cd web/backend && npx tsc --noEmit && cd ../..
git add web/backend/src/server/door-admin.routes.ts web/backend/src/server/app.ts web/backend/tests/server/door-admin-routes.test.ts
git commit -m "feat(api): the DoorRepo door can report what it installed"
```

---

### Task 8: DOORMAN stops asking for a command name

**Files:**
- Modify: `Doors/door-manager/app.ts` (both `InputView` install prompts)
- Test: `web/backend/tests/doors/doorman-install-naming.test.ts` (create)

**Interfaces:**
- Consumes: `findArchiveCommand` (`Doors/door-manager/archive-command.ts`, existing).
- Produces: `commandForArchive(archiveName: string, archiveCommand: string | null): { command: string; source: 'archive' | 'archive-name' }`, exported from `Doors/door-manager/archive-command.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { commandForArchive } from '../../../../Doors/door-manager/archive-command';

describe('commandForArchive', () => {
  it('uses the command the archive names', () => {
    expect(commandForArchive('HACKCHK.LHA', 'HACKCHECK'))
      .toEqual({ command: 'HACKCHECK', source: 'archive' });
  });

  it('falls back to the archive base name, and says so', () => {
    expect(commandForArchive('OZONE.LHA', null))
      .toEqual({ command: 'OZONE', source: 'archive-name' });
  });

  it('makes the fallback a usable BBS command', () => {
    expect(commandForArchive('-D-CALC v2!.LZX', null))
      .toEqual({ command: 'DCALCV2', source: 'archive-name' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- web/backend/tests/doors/doorman-install-naming.test.ts`
Expected: FAIL — `commandForArchive` is not exported.

- [ ] **Step 3: Write the helper and use it**

Add to `Doors/door-manager/archive-command.ts`:

```ts
/**
 * The command a door will be installed as.
 *
 * Always the archive's own - a door installed under an invented name is a
 * door that does not answer to it, and writing a fresh .info loses the STACK
 * and PRIORITY the author set. When the archive names none, the archive's
 * file name stands in, and the caller says so on screen rather than
 * pretending it was chosen.
 */
export function commandForArchive(
  archiveName: string,
  archiveCommand: string | null
): { command: string; source: 'archive' | 'archive-name' } {
  if (archiveCommand && archiveCommand.trim().length > 0) {
    return { command: archiveCommand.trim().toUpperCase(), source: 'archive' };
  }
  const base = archiveName.replace(/\.(lha|lzx|zip|lzh)$/i, '');
  return {
    command: base.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'DOOR',
    source: 'archive-name',
  };
}
```

In `Doors/door-manager/app.ts`, replace each `InputView(... 'Install as BBS command:' ...)` with a `ConfirmView` that states the command and where it came from:

```ts
      const chosen = commandForArchive(e.archive_name, archiveCommandFor(e));
      const why = chosen.source === 'archive'
        ? `The archive installs as {yellow-fg}${chosen.command}{/yellow-fg}.`
        : `The archive names no command; using {yellow-fg}${chosen.command}{/yellow-fg}\nfrom the archive filename.`;
      this.vm.push(new ConfirmView(this.layout,
        `Install {yellow-fg}${sanitizeForTags(e.archive_name)}{/yellow-fg}?\n\n${why}`,
        'Install', 'Cancel',
        () => { /* the existing install body, with finalCmd = chosen.command */ }
      ));
```

Consumer mode has no extracted directory to read before downloading, so
`archiveCommandFor(e)` returns `null` there and the archive's own command is
still applied after extraction by `extractAndRegisterDoor`'s existing rename —
the confirmation names the fallback, and the install log reports the rename
when it happens.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- web/backend/tests/doors/doorman-install-naming.test.ts web/backend/tests/doors/doorman-archive-command.test.ts`
Expected: PASS

- [ ] **Step 5: Rebuild dist and commit**

```bash
cd Doors/door-manager && npm run build && cd ../..
cd web/backend && npx tsc --noEmit && cd ../..
git add Doors/door-manager/archive-command.ts Doors/door-manager/app.ts Doors/door-manager/dist web/backend/tests/doors/doorman-install-naming.test.ts
git commit -m "feat(doorman): the archive names the command, not the sysop"
```

---

### Task 9: DOORREPO stops asking too

**Files:**
- Modify: `examples/doorrepo-c/flow.c`, `examples/doorrepo-c/flow.h`
- Modify: `examples/doorrepo-c/doorrepo.c:3230-3250` (the install prompt)
- Test: `examples/doorrepo-c/tests/test_flow.c` (extend)

**Interfaces:**
- Consumes: the `/files` listing this door already fetches (`FILES|<count>|<junk>` then `<size>|<isJunk>|<path>`).
- Produces: `int flow_command_from_listing(const char *listing, char *out, size_t outlen);` — returns 1 when the listing names a command, 0 otherwise.

- [ ] **Step 1: Write the failing test**

Add to `examples/doorrepo-c/tests/test_flow.c`:

```c
static void test_command_from_listing(void)
{
    char cmd[32];

    /* The archive's own registration names the command. */
    const char *listing =
        "FILES|3|0\n"
        "950|0|Commands/BBSCmd/HACKCHECK.info\n"
        "12|0|Doors/HackCheck/HackCheck\n"
        "5|0|FILE_ID.DIZ\n";
    assert(flow_command_from_listing(listing, cmd, sizeof(cmd)) == 1);
    assert(strcmp(cmd, "HACKCHECK") == 0);

    /* Case and separator variations still resolve. */
    const char *lower =
        "FILES|1|0\n"
        "950|0|commands\\bbscmd\\ozone.info\n";
    assert(flow_command_from_listing(lower, cmd, sizeof(cmd)) == 1);
    assert(strcmp(cmd, "OZONE") == 0);

    /* No registration in the archive. */
    const char *none =
        "FILES|2|0\n"
        "950|0|Ozone/Ozone\n"
        "5|0|FILE_ID.DIZ\n";
    assert(flow_command_from_listing(none, cmd, sizeof(cmd)) == 0);

    /* A name too long for a BBS command is not a command. */
    const char *toolong =
        "FILES|1|0\n"
        "950|0|Commands/BBSCmd/THISNAMEISWAYTOOLONG.info\n";
    assert(flow_command_from_listing(toolong, cmd, sizeof(cmd)) == 0);

    printf("  command_from_listing OK\n");
}
```

and call it from `main()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd examples/doorrepo-c && make test-flow`
Expected: FAIL — implicit declaration of `flow_command_from_listing`.

- [ ] **Step 3: Write the implementation**

In `flow.c`:

```c
/* The command an archive names, read from the /files listing.
 *
 * A door archive ships Commands/BBSCmd/<CMD>.info, and that file carries the
 * tooltypes the door was built with. This door cannot enumerate a directory
 * (C89 offers none), but the server already lists every path inside the
 * archive - so the listing answers the same question the extracted directory
 * would.
 *
 * Returns 1 and fills `out` when the listing names exactly one usable
 * command, 0 otherwise. */
int flow_command_from_listing(const char *listing, char *out, size_t outlen)
{
    const char *line = listing;

    if (listing == (const char *) 0 || out == (char *) 0 || outlen == 0) {
        return 0;
    }

    while (*line != '\0') {
        const char *eol = strchr(line, '\n');
        const char *seg;
        size_t len = (eol != (const char *) 0) ? (size_t) (eol - line) : strlen(line);
        char path[512];
        char lower[512];
        size_t i;

        if (len > 0 && len < sizeof(path)) {
            /* Everything after the second '|' is the path. */
            const char *p = line;
            int bars = 0;
            while (p < line + len && bars < 2) {
                if (*p == '|') bars++;
                p++;
            }
            if (bars == 2) {
                size_t plen = (size_t) (line + len - p);
                if (plen < sizeof(path)) {
                    memcpy(path, p, plen);
                    path[plen] = '\0';

                    for (i = 0; i <= plen; i++) {
                        char c = path[i];
                        if (c == '\\') c = '/';
                        lower[i] = (char) tolower((unsigned char) c);
                    }

                    seg = strstr(lower, "commands/bbscmd/");
                    if (seg != (const char *) 0) {
                        const char *name = path + (seg - lower) + 16;
                        const char *dot = strrchr(name, '.');
                        if (dot != (const char *) 0
                            && (dot - name) > 0
                            && (size_t) (dot - name) < outlen
                            && strcmp(lower + (dot - path), ".info") == 0) {
                            size_t nlen = (size_t) (dot - name);
                            for (i = 0; i < nlen; i++) {
                                out[i] = (char) toupper((unsigned char) name[i]);
                            }
                            out[nlen] = '\0';
                            if (flow_is_valid_bbs_command(out)) {
                                return 1;
                            }
                        }
                    }
                }
            }
        }

        if (eol == (const char *) 0) break;
        line = eol + 1;
    }

    return 0;
}
```

Declare it in `flow.h`:

```c
int flow_command_from_listing(const char *listing, char *out, size_t outlen);
```

In `doorrepo.c`, replace the `ui_text_prompt` block at the install site: derive
the command with `flow_command_from_listing()` over the listing the archive
pane already holds; when it returns 0, fall back to
`flow_suggest_bbs_command()` on the archive name. Then confirm rather than
prompt:

```c
    if (flow_command_from_listing(listing, cmdname, sizeof(cmdname))) {
        sprintf(question, "Install as %s (named by the archive)?  [Y/N]", cmdname);
    } else {
        (void) flow_suggest_bbs_command(entry->archive, cmdname, sizeof(cmdname));
        sprintf(question, "Archive names no command; install as %s?  [Y/N]", cmdname);
    }
    if (!ui_confirm(b, frame, framecap, g, question)) {
        return;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd examples/doorrepo-c && make test-flow && make test`
Expected: PASS, all suites

- [ ] **Step 5: Commit**

```bash
git add examples/doorrepo-c/flow.c examples/doorrepo-c/flow.h examples/doorrepo-c/doorrepo.c examples/doorrepo-c/tests/test_flow.c
git commit -m "feat(doorrepo): the archive names the command, not the sysop"
```

---

### Task 10: Report the install from DOORREPO

**Files:**
- Modify: `examples/doorrepo-c/doorrepo.c` (after a successful install)
- Modify: `examples/doorrepo-c/config.c`, `config.h` (read `DoorRepo.token`)
- Test: `examples/doorrepo-c/tests/test_config.c` (extend)

**Interfaces:**
- Consumes: `POST /api/doors/installed` (Task 7); `http_post` (existing in `http.c`).
- Produces: `int config_read_token(const dr_config *cfg, char *out, size_t outlen);`

- [ ] **Step 1: Write the failing test**

Add to `examples/doorrepo-c/tests/test_config.c`:

```c
static void test_read_token(void)
{
    dr_config cfg;
    char token[128];
    FILE *f;

    memset(&cfg, 0, sizeof(cfg));
    strcpy(cfg.doors_dir, "build-test-tokendir");
    (void) system("mkdir -p build-test-tokendir/DoorRepo");
    f = fopen("build-test-tokendir/DoorRepo/DoorRepo.token", "wb");
    assert(f != (FILE *) 0);
    fputs("abc123\n", f);
    fclose(f);

    assert(config_read_token(&cfg, token, sizeof(token)) == 1);
    assert(strcmp(token, "abc123") == 0);

    (void) system("rm -rf build-test-tokendir");
    assert(config_read_token(&cfg, token, sizeof(token)) == 0);

    printf("  read_token OK\n");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd examples/doorrepo-c && make test-config`
Expected: FAIL — implicit declaration of `config_read_token`.

- [ ] **Step 3: Write the implementation**

In `config.c`:

```c
/* The per-launch token the BBS wrote for this session.
 *
 * Written to <DoorsDir>/DoorRepo/DoorRepo.token at launch: a 68K door under
 * the emulator never sees the backend's environment, so a file beside the
 * configuration is how the token arrives. Absent means "this BBS does not
 * offer the management API" - not an error. */
int config_read_token(const dr_config *cfg, char *out, size_t outlen)
{
    char tokenpath[512];
    FILE *f;
    size_t len;

    if (cfg == (const dr_config *) 0 || out == (char *) 0 || outlen == 0) return 0;

    sprintf(tokenpath, "%s/DoorRepo/DoorRepo.token", cfg->doors_dir);
    f = fopen(tokenpath, "rb");
    if (f == (FILE *) 0) return 0;

    if (fgets(out, (int) outlen, f) == (char *) 0) { fclose(f); return 0; }
    fclose(f);

    len = strlen(out);
    while (len > 0 && (out[len - 1] == '\n' || out[len - 1] == '\r' || out[len - 1] == ' ')) {
        out[--len] = '\0';
    }
    return len > 0 ? 1 : 0;
}
```

Declare it in `config.h`. In `doorrepo.c`, after a successful install, post the
record — failure is reported to the sysop and never rolls back a working
install:

```c
    if (config_read_token(cfg, token, sizeof(token))) {
        char body[512];
        sprintf(body, "{\"command\":\"%s\",\"archiveName\":\"%s\"}", cmdname, entry->archive);
        if (!http_post_json(cfg->repo_host, "/api/doors/installed", token, body)) {
            ae_put("[SKIP] the BBS did not record this install - it is on disk and will run.", 1);
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd examples/doorrepo-c && make test`
Expected: PASS, all suites

- [ ] **Step 5: Commit**

```bash
git add examples/doorrepo-c/config.c examples/doorrepo-c/config.h examples/doorrepo-c/doorrepo.c examples/doorrepo-c/tests/test_config.c
git commit -m "feat(doorrepo): report the install to the BBS"
```

---

### Task 11: Mint the token when the door launches

**Files:**
- Modify: `web/backend/src/handlers/door.handler.ts` (the door launch path)
- Test: `web/backend/tests/doors/door-launch-token.test.ts` (extend)

**Interfaces:**
- Consumes: `mintLaunchToken`, `revokeLaunchToken` (Task 6).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
it('mints a token for the DoorRepo door and revokes it when the door exits', async () => {
  const { launchTokenForDoor, releaseLaunchTokenForDoor } = require('../../src/handlers/door.handler');

  const token = launchTokenForDoor('DOORREPO', root, { nodeId: 3, userId: 7, secLevel: 255 });
  expect(verifyLaunchToken(token)).not.toBeNull();

  releaseLaunchTokenForDoor(token);
  expect(verifyLaunchToken(token)).toBeNull();
});

it('mints nothing for any other door', () => {
  const { launchTokenForDoor } = require('../../src/handlers/door.handler');

  expect(launchTokenForDoor('AEHELP', root, { nodeId: 3, userId: 7, secLevel: 255 })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- web/backend/tests/doors/door-launch-token.test.ts`
Expected: FAIL — `launchTokenForDoor` is not exported.

- [ ] **Step 3: Write the implementation**

In `web/backend/src/handlers/door.handler.ts`:

```ts
import { mintLaunchToken, revokeLaunchToken } from '../doors/door-launch-token';

/** Only the DoorRepo door gets a management token, and only for a sysop.
 *  Every other door has no business calling /api/doors. */
export function launchTokenForDoor(
  command: string,
  bbsRoot: string,
  session: { nodeId: number | string; userId: number; secLevel: number }
): string | null {
  if (command.toUpperCase() !== 'DOORREPO') return null;
  if (session.secLevel < 250) return null;
  return mintLaunchToken(bbsRoot, session);
}

export function releaseLaunchTokenForDoor(token: string | null): void {
  if (token) revokeLaunchToken(token);
}
```

Call `launchTokenForDoor` where a door is started and `releaseLaunchTokenForDoor`
where it exits, keeping the token in the session's door state.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- web/backend/tests/doors/door-launch-token.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Full suite, type-check, commit**

```bash
npm test 2>&1 | tail -5
cd web/backend && npx tsc --noEmit && cd ../..
git add web/backend/src/handlers/door.handler.ts web/backend/tests/doors/door-launch-token.test.ts
git commit -m "feat(doors): mint the management token when DOORREPO launches"
```

---

## Phase A acceptance

Verified by hand on the dev stack, then on live after a deploy (read
`/app/.git-sha` and the running code — the workflow has reported green while
shipping nothing):

1. Install a door through DOORMAN. `door_installs` gains a row naming the
   archive; `door_installed_files` gains one row per file and directory.
2. Delete that door. Every recorded path goes, the door leaves the list, and
   the panel's log names each path as it goes.
3. Install a door through DOORREPO. The same two tables gain the same rows,
   reported over `POST /api/doors/installed`.
4. Neither door offers a text field for the command; both confirm the name and
   say where it came from.
5. A door whose `.info` NAME is ASCII art shows the catalog's name in the
   doors menu and in DOORMAN.
6. `curl -X POST https://bbs.uprough.net/api/doors/installed` without a token
   returns 401.

## What is not in this plan

Phases B–E of the spec, each needing its own plan once A is on the board:

- **B** — read APIs (`installed`, `files`, `file`, `info`)
- **C** — write APIs (`enabled`, `info` write, `DELETE` with the streaming log)
- **D** — DOORREPO's screens against B and C
- **E** — DOORMAN's removal
