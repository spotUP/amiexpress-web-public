# Screen File Manager, Phase 1 - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin a screen file manager - every screen the board can
display, where it resolves from, what it looks like, and the ability to
download, upload, replace, delete, import, export and share screen files.

**Architecture:** The resolution table moves out of `screen.handler.ts` into
`web/backend/src/screens/screen-resolution.ts`, which both the BBS loader and
the new API consume, so the admin and the board can never disagree about where
a screen comes from. An index service walks the board once and answers "what
resolves where, what is a duplicate, what references are broken". A router at
`/api/screens` reads and writes files as bytes. The admin page is screens
first, files underneath.

**Tech Stack:** TypeScript, Express, jest, supertest (backend); React,
react-query, vitest, xterm (config-app). `adm-zip` and `multer` are already
dependencies of the backend.

**Spec:** `docs/superpowers/specs/2026-09-01-screen-file-manager-design.md`

## Global Constraints

- **Bytes, never text.** Screen content crosses the API as base64; uploads are
  raw multipart. No JSON round-trip touches content - a UTF-8 round-trip turns
  an Amiga high-bit byte into U+FFFD.
- **Never normalise a filename.** The security level (`LOGON20.TXT`) and the
  type extension (`flt.txt.gr`) ARE the routing.
- **Resolve a path once, case-insensitively, and use that resolved path for the
  read, the backup and the write.** Reuse the `resolveUnderRoot` pattern at
  `web/backend/src/api/info-editor-routes.ts:79`.
- **Back up before every destructive write** to `path + '.backup'`, and restore
  it if the write throws.
- Every route mounts behind `authenticateToken(db)` + `requireSysop()`.
- Every write is recorded with `configRepo.logConfigChange('screen_files', 0,
  action, userId, username, oldValues, newValues)`.
- `screen.handler.ts` is hook-exempt but must SHRINK in Task 1, never grow.
- Backend: `cd web/backend && npm test -- <path>`, and
  `npm run typecheck:tests` - jest strips types, so green tests do not mean
  the types are sound. config-app: `cd web/config-app && npm test`.
- Never assert on source strings. Drive the real function.

---

### Task 1: Extract the resolution table

**Files:**
- Create: `web/backend/src/screens/screen-resolution.ts`
- Create: `dev/scripts/probe-screen-resolution.ts`
- Modify: `web/backend/src/handlers/screen.handler.ts` (remove the table, the
  two helpers and `resolveNodeScreenDir`; import them instead)
- Test: `web/backend/tests/screens/screen-resolution.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export enum ScreenDirType { NODE = 'node', CONF = 'conf', GLOBAL = 'global' }
  export const SCREEN_DIR_MAP: Record<string, ScreenDirType>;
  export function getScreenDirType(screenName: string): ScreenDirType | null;
  export function getScreenFileName(screenName: string): string;
  export function resolveNodeScreenDir(baseDir: string, nodeId: number): string;
  export interface SearchLocation { dir: string; desc: string }
  export function screenSearchLocations(
    baseDir: string,
    screenName: string,
    opts: { nodeId: number; confId?: number },
  ): SearchLocation[];
  ```

- [ ] **Step 1: Write the failing test**

`web/backend/tests/screens/screen-resolution.test.ts`:

```ts
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ScreenDirType, getScreenDirType, getScreenFileName,
  resolveNodeScreenDir, screenSearchLocations,
} from '../../src/screens/screen-resolution';

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-res-'));
  fs.mkdirSync(path.join(root, 'Node7'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Node200.info'), 'SCREENS=BBS:Screens/Shared/\n');
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the express.e screen directory table', () => {
  test('LOGON is a node screen, MENU a conference one, BULL a board one', () => {
    expect(getScreenDirType('LOGON')).toBe(ScreenDirType.NODE);
    expect(getScreenDirType('MENU')).toBe(ScreenDirType.CONF);
    expect(getScreenDirType('BULL')).toBe(ScreenDirType.GLOBAL);
  });

  test('a screen this port does not know answers null', () => {
    expect(getScreenDirType('NOTASCREEN')).toBeNull();
  });

  test('NODE_BULL and CONF_BULL both read the file named BULL', () => {
    expect(getScreenFileName('NODE_BULL')).toBe('BULL');
    expect(getScreenFileName('CONF_BULL')).toBe('BULL');
    expect(getScreenFileName('LOGON24')).toBe('Logon24hrs');
  });
});

describe('screenSearchLocations', () => {
  test('a node screen searches the node directory and nothing else', () => {
    const locations = screenSearchLocations(root, 'LOGON', { nodeId: 7 });
    expect(locations.map(l => l.dir)).toEqual([path.join(root, 'Node7')]);
  });

  test('the SCREENS tooltype replaces the node directory', () => {
    const locations = screenSearchLocations(root, 'LOGON', { nodeId: 200 });
    expect(locations[0].dir).toBe(path.join(root, 'Screens', 'Shared'));
    expect(resolveNodeScreenDir(root, 200)).toBe(path.join(root, 'Screens', 'Shared'));
  });

  test('a board screen searches the board root before Screens/', () => {
    const dirs = screenSearchLocations(root, 'BULL', { nodeId: 7 }).map(l => l.dir);
    expect(dirs[0]).toBe(root);
    expect(dirs[1]).toBe(path.join(root, 'Screens'));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web/backend && npm test -- tests/screens/screen-resolution.test.ts`
Expected: FAIL - `Cannot find module '../../src/screens/screen-resolution'`.

- [ ] **Step 3: Create the module by MOVING code**

Move, do not retype: `ScreenDirType`, `SCREEN_DIR_MAP`, `getScreenDirType`,
`getScreenFileName` and `resolveNodeScreenDir` come out of
`screen.handler.ts` unchanged, comments included. Add one new function holding
the search-location logic currently inline in `loadScreenFile`:

```ts
export function screenSearchLocations(
  baseDir: string,
  screenName: string,
  opts: { nodeId: number; confId?: number },
): SearchLocation[] {
  const locations: SearchLocation[] = [];
  const dirType = getScreenDirType(screenName);

  if (dirType === ScreenDirType.NODE) {
    // express.e:6546 - ONE directory, nodeScreenDir.
    const nodeDir = path.join(baseDir, `Node${opts.nodeId}`);
    const screenDir = resolveNodeScreenDir(baseDir, opts.nodeId);
    locations.push({
      dir: screenDir,
      desc: screenDir === nodeDir ? `Node${opts.nodeId}` : `Node${opts.nodeId} SCREENS tooltype`,
    });
  } else if (dirType === ScreenDirType.CONF && opts.confId) {
    locations.push({ dir: path.join(baseDir, `Conf${opts.confId}`), desc: `Conf${opts.confId}` });
    locations.push({ dir: path.join(baseDir, `Conf${opts.confId}`, 'Screens'), desc: `Conf${opts.confId}/Screens` });
  } else if (dirType === ScreenDirType.GLOBAL) {
    // express.e reads a GLOBAL screen from cmds.bbsLoc - the board root.
    locations.push({ dir: baseDir, desc: 'board root' });
    locations.push({ dir: path.join(baseDir, 'Screens'), desc: 'Screens' });
  }

  return locations;
}
```

- [ ] **Step 4: Make `loadScreenFile` consume it**

In `screen.handler.ts`, delete the moved definitions, import from the new
module, and replace the inline `if (screenDirType === ...)` chain that fills
`searchLocations` with:

```ts
    searchLocations.push(...screenSearchLocations(baseDir, screenName, {
      nodeId,
      confId: conferenceId || session?.relConfNum,
    }));
```

Leave the `Bulletins/` exclusion comment where it is - it explains an absence,
and that absence now lives inside `screenSearchLocations`.

- [ ] **Step 5: Run the new test and the existing screen tests**

Run:
```
cd web/backend && npm test -- tests/screens/screen-resolution.test.ts \
  tests/handlers/screen-express-e-directories.test.ts \
  tests/handlers/screen-loader-case.test.ts \
  tests/handlers/screen-handler.test.ts
```
Expected: PASS, all four suites.

- [ ] **Step 6: Commit the probe that proves the move changed nothing**

Create `dev/scripts/probe-screen-resolution.ts`:

```ts
/**
 * Every screen the board can resolve, printed one per line.
 *
 * The manager's whole risk is that the admin and the loader disagree, so the
 * check is the loader itself: run this before a change and after it, diff the
 * two files, and read what moved.
 *
 *   npx tsx dev/scripts/probe-screen-resolution.ts --data-dir /app/data/bbs > before.tsv
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';

const dataDirArg = process.argv.indexOf('--data-dir');
const DATA_DIR = path.resolve(
  dataDirArg >= 0 && process.argv[dataDirArg + 1]
    ? process.argv[dataDirArg + 1]
    : process.env.BBS_DATA_DIR || process.cwd(),
);
process.env.BBS_DATA_DIR = DATA_DIR;

const { loadScreenFile } = require('../../web/backend/src/handlers/screen.handler');
const { SCREEN_DIR_MAP, ScreenDirType } = require('../../web/backend/src/screens/screen-resolution');

const SECLEVELS = [0, 10, 20, 100, 255];
const entries = fs.readdirSync(DATA_DIR);
const nodes = entries.filter(d => /^Node\d+$/.test(d)).map(d => parseInt(d.slice(4), 10)).sort((a, b) => a - b);
const confs = entries.filter(d => /^Conf\d+$/.test(d)).map(d => parseInt(d.slice(4), 10)).sort((a, b) => a - b);

const session = (secLevel: number, relConfNum: number, nodeId: number) => ({
  user: { secLevel }, terminalType: 'ansi', screenWidth: 80, screenHeight: 24,
  petsciiMode: false, relConfNum, nodeId,
});

const rows: string[] = [];
for (const [screen, dirType] of Object.entries(SCREEN_DIR_MAP) as [string, string][]) {
  const scopes = dirType === ScreenDirType.CONF
    ? confs.map(c => ({ node: 1, conf: c }))
    : nodes.map(n => ({ node: n, conf: 1 }));
  for (const scope of scopes) {
    for (const sec of SECLEVELS) {
      const found = loadScreenFile(screen, scope.conf, scope.node, session(sec, scope.conf, scope.node));
      rows.push([
        dirType, screen, `node=${scope.node}`, `conf=${scope.conf}`, `sec=${sec}`,
        found ? path.relative(DATA_DIR, found.filePath) : 'NULL',
      ].join('\t'));
    }
  }
}
console.log(rows.join('\n'));
```

Prove the extraction with it. **Do NOT `git stash` in this repo** - the
CRLF phantom files block `stash pop` permanently. Use a second worktree:

```bash
git worktree add /tmp/base-wt origin/main
npx tsx dev/scripts/probe-screen-resolution.ts --data-dir "$PWD" > /tmp/after.tsv
(cd /tmp/base-wt && npx tsx /path/to/plan-repo/dev/scripts/probe-screen-resolution.ts --data-dir "$PWD" > /tmp/before.tsv)
diff /tmp/before.tsv /tmp/after.tsv && echo "resolution unchanged"
git worktree remove /tmp/base-wt
```
Expected: no differences.

- [ ] **Step 7: Commit**

```bash
git add web/backend/src/screens/screen-resolution.ts \
        web/backend/src/handlers/screen.handler.ts \
        web/backend/tests/screens/screen-resolution.test.ts \
        dev/scripts/probe-screen-resolution.ts
git commit -m "refactor(screens): the resolution table is a module both readers share"
```

---

### Task 2: The index service, and the guard that keeps it honest

**Files:**
- Create: `web/backend/src/screens/mci-references.ts`
- Create: `web/backend/src/screens/screen-index.service.ts`
- Test: `web/backend/tests/screens/screen-index.test.ts`
- Test: `web/backend/tests/screens/index-agrees-with-loader.test.ts`

**Interfaces:**
- Consumes: `screenSearchLocations`, `getScreenDirType`, `getScreenFileName`,
  `SCREEN_DIR_MAP`, `ScreenDirType` (Task 1); `findSecurityScreen` from
  `web/backend/src/utils/screen-security.util.ts`.
- Produces:
  ```ts
  export type ScreenFormat = 'ansi' | 'text' | 'rip' | 'petscii';
  export interface MciReference {
    code: 'CC' | 'SS' | 'SR' | 'CL';
    target: string;
    resolves: boolean;
    scopeSpecific: boolean;
  }
  export interface ScreenFileFacts {
    relPath: string; bytes: number; format: ScreenFormat;
    sha256: string; mci: MciReference[];
  }
  export interface ScopeResolution {
    scope: 'node' | 'conf' | 'board';
    id: number | null;
    dir: string;
    dirIsShared: boolean;
    file: string | null;
    variants: string[];
  }
  export interface ScreenIndexEntry {
    screen: string; dirType: ScreenDirType;
    resolutions: ScopeResolution[];
    missingScopes: number;
    duplicateGroups: { sha256: string; paths: string[] }[];
  }
  export interface ScreenIndex {
    screens: ScreenIndexEntry[];
    unused: ScreenFileFacts[];
    files: Record<string, ScreenFileFacts>;
    builtAt: string;
  }
  export function screenFileFacts(baseDir: string, absPath: string): ScreenFileFacts;
  export function buildScreenIndex(baseDir: string): ScreenIndex;
  export function getScreenIndex(baseDir: string): ScreenIndex;
  export function invalidateScreenIndex(): void;
  ```

- [ ] **Step 1: Write the failing MCI test**

`web/backend/tests/screens/screen-index.test.ts`:

```ts
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseMciReferences } from '../../src/screens/mci-references';

describe('MCI references in a screen', () => {
  test('reads the codes this board actually uses', () => {
    const refs = parseMciReferences(
      'Welcome ~CC_gwall|\n~SS_BBS:screens/uprough.txt\n~3SR_BBS:screens/logoff\n~CL.\n'
    );
    expect(refs.map(r => `${r.code}:${r.target}`)).toEqual([
      'CC:gwall',
      'SS:BBS:screens/uprough.txt',
      'SR:BBS:screens/logoff',
      'CL:',
    ]);
  });

  test('a reference naming a node or conference is scope-specific', () => {
    const refs = parseMciReferences('~SS_BBS:Node1/BBSTITLE.txt ~SS_BBS:screens/x.txt');
    expect(refs[0].scopeSpecific).toBe(true);
    expect(refs[1].scopeSpecific).toBe(false);
  });

  test('an escaped tilde is not a reference', () => {
    expect(parseMciReferences('100~~CC_ of them')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web/backend && npm test -- tests/screens/screen-index.test.ts`
Expected: FAIL - cannot find `mci-references`.

- [ ] **Step 3: Write `mci-references.ts`**

```ts
/**
 * The MCI codes a screen file carries, and whether they still point at
 * something.
 *
 * A screen on this board is a program, not a picture: 252 ~SS_ includes, 173
 * ~CC_ command invocations and 108 ~SR_ recursions across 891 files. A
 * reference to a door that was deleted is a menu item that fails only when a
 * caller presses the key, which is why the manager checks them.
 *
 * The patterns mirror screen.handler.ts's own parser (~CC_ at :955, ~SS_/~2S
 * at :967, ~nSR_ at :976, ~CL. at :571). If that parser changes, this must.
 */
export interface MciReference {
  code: 'CC' | 'SS' | 'SR' | 'CL';
  target: string;
  resolves: boolean;
  scopeSpecific: boolean;
}

const SCOPE_SPECIFIC = /(^|[:/])(Node\d+|Conf\d+)([/:]|$)/i;

export function parseMciReferences(content: string): MciReference[] {
  // `~~` is a literal tilde (screen.handler.ts:1421), so blank those first
  // rather than letting them start a code.
  const text = content.replace(/~~/g, '  ');
  const found: { at: number; ref: MciReference }[] = [];

  const push = (at: number, code: MciReference['code'], target: string) => {
    found.push({ at, ref: { code, target, resolves: false, scopeSpecific: SCOPE_SPECIFIC.test(target) } });
  };

  for (const m of text.matchAll(/~CC_([^\s|~\r\n]+)/g)) push(m.index!, 'CC', m[1]);
  for (const m of text.matchAll(/~(?:SS_|2S)([^\s|~\r\n]+)/g)) push(m.index!, 'SS', m[1]);
  for (const m of text.matchAll(/~\d*SR_([^\s|~\r\n]+)/g)) push(m.index!, 'SR', m[1]);
  for (const m of text.matchAll(/~CL\./g)) push(m.index!, 'CL', '');

  return found.sort((a, b) => a.at - b.at).map(f => f.ref);
}
```

- [ ] **Step 4: Run the MCI test**

Run: `cd web/backend && npm test -- tests/screens/screen-index.test.ts`
Expected: PASS, three tests.

- [ ] **Step 5: Write the failing index test**

Append to the same file:

```ts
import { buildScreenIndex } from '../../src/screens/screen-index.service';

describe('the screen index', () => {
  let root: string;
  const write = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body, 'latin1');
  };

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-index-'));
    write('Node1/BBSTITLE.txt', 'title\n');
    write('Node2/BBSTITLE.txt', 'title\n');
    write('Node1/LOGON.TXT', '~CC_gwall|\n');
    write('Node1/LOGON20.TXT', 'sysop logon\n');
    write('Conf1/MENU.TXT', 'menu\n');
    write('BULL.txt', 'bulletin\n');
    write('Screens/leftover.txt', 'nothing reads me\n');
    write('Commands/BBSCmd/GWALL.info', 'ACCESS=10\n');
  });

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  test('reports where each screen resolves, per scope', () => {
    const index = buildScreenIndex(root);
    const bbstitle = index.screens.find(s => s.screen === 'BBSTITLE')!;
    const node1 = bbstitle.resolutions.find(r => r.id === 1)!;
    expect(node1.file).toBe(path.join('Node1', 'BBSTITLE.txt'));
    expect(node1.dirIsShared).toBe(false);
  });

  test('groups byte-identical copies', () => {
    const index = buildScreenIndex(root);
    const bbstitle = index.screens.find(s => s.screen === 'BBSTITLE')!;
    expect(bbstitle.duplicateGroups[0].paths.sort()).toEqual([
      path.join('Node1', 'BBSTITLE.txt'),
      path.join('Node2', 'BBSTITLE.txt'),
    ]);
  });

  test('lists the security variants beside the file that wins', () => {
    const index = buildScreenIndex(root);
    const logon = index.screens.find(s => s.screen === 'LOGON')!;
    const node1 = logon.resolutions.find(r => r.id === 1)!;
    expect(node1.variants.sort()).toEqual(['LOGON.TXT', 'LOGON20.TXT']);
  });

  test('a file no screen name reaches is listed as unused, never hidden', () => {
    const index = buildScreenIndex(root);
    expect(index.unused.map(f => f.relPath)).toContain(path.join('Screens', 'leftover.txt'));
  });

  test('resolves MCI references against the board', () => {
    const index = buildScreenIndex(root);
    const logon = index.files[path.join('Node1', 'LOGON.TXT')];
    expect(logon.mci[0]).toMatchObject({ code: 'CC', target: 'gwall', resolves: true });
  });

  test('a command with no .info is a broken reference', () => {
    write('Node1/LOGON.TXT', '~CC_nosuchdoor|\n');
    const index = buildScreenIndex(root);
    expect(index.files[path.join('Node1', 'LOGON.TXT')].mci[0].resolves).toBe(false);
  });

  test('sniffs the format from the bytes, not the extension', () => {
    write('Screens/art.txt', '\x1b[31mred\x1b[0m');
    const index = buildScreenIndex(root);
    expect(index.files[path.join('Screens', 'art.txt')].format).toBe('ansi');
    expect(index.files[path.join('Node1', 'BBSTITLE.txt')].format).toBe('text');
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd web/backend && npm test -- tests/screens/screen-index.test.ts`
Expected: FAIL - cannot find `screen-index.service`.

- [ ] **Step 7: Write `screen-index.service.ts`**

In this order:

1. `listScreenDirectories(baseDir)` - the board root, `Screens/` and its
   subdirectories, every `Node<N>/` and `Node<N>/Screens/`, every `Conf<N>/`
   and `Conf<N>/Screens/`, plus any directory named by a `SCREENS` tooltype.
2. `screenFileFacts(baseDir, absPath)` - `fs.statSync` for the size,
   `crypto.createHash('sha256')` over the raw buffer, and the format sniffed
   from the bytes:
   - a `.rip` extension, or a body starting `!|` -> `rip`
   - a `.seq` extension -> `petscii`
   - a 0x1B byte anywhere -> `ansi`
   - otherwise -> `text`

   then `parseMciReferences(buf.toString('latin1'))`, filling `resolves`:
   `CC` looks for `Commands/BBSCmd/<TARGET>.info` through
   `amigafs.resolvePath`; `SS` and `SR` resolve their path the same way;
   `CL` always resolves.
3. `buildScreenIndex(baseDir)` - for every entry in `SCREEN_DIR_MAP`, for
   every node (directories matching `/^Node\d+$/`), every conference, or the
   board once: take the directory from `screenSearchLocations`, the file from
   `findSecurityScreen`, and record a `ScopeResolution`. `dirIsShared` is true
   when the directory is not `<baseDir>/Node<N>`. `variants` is every file in
   that directory whose stem matches the screen's file name once a trailing
   security number and the extension are removed - listed, never renamed.
4. `duplicateGroups` - bucket that screen's resolved files by `sha256`, keep
   buckets of two or more.
5. `unused` - every file under a screen directory that is not the resolution of
   any screen and does not end in `.backup`.
6. `getScreenIndex` caches against a key built from every screen directory's
   `mtimeMs`, the way `getBoardConfig` caches; `invalidateScreenIndex` drops
   the cache and is called by every write route in Tasks 4-6.

- [ ] **Step 8: Run the index tests**

Run: `cd web/backend && npm test -- tests/screens/screen-index.test.ts`
Expected: PASS, ten tests.

- [ ] **Step 9: Write the guard test**

`web/backend/tests/screens/index-agrees-with-loader.test.ts`:

```ts
/**
 * The admin and the board must never disagree about where a screen comes from.
 *
 * That disagreement - a writer and a reader each holding their own copy of a
 * rule - is the single fault behind the 2026-08-31 admin audit: both halves
 * work, on data that never meets, and the page looks right while the board
 * does something else. Here the index claims a resolution and the LOADER is
 * asked to produce one, so a rule taught to one and not the other fails here.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let root: string;
let buildScreenIndex: typeof import('../../src/screens/screen-index.service').buildScreenIndex;
let loadScreenFile: any;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-agree-'));
  const write = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body, 'latin1');
  };
  write('Node1/BBSTITLE.txt', 'one\n');
  write('Node1/LOGON.TXT', 'logon\n');
  write('Node1/LOGON20.TXT', 'sysop\n');
  write('Node2/BBSTITLE.txt', 'two\n');
  write('Node200.info', 'SCREENS=BBS:Screens/Shared/\n');
  write('Screens/Shared/BBSTITLE.txt', 'shared\n');
  write('Conf1/MENU.TXT', 'menu\n');
  write('BULL.txt', 'bull\n');

  process.env.BBS_DATA_DIR = root;
  jest.resetModules();
  buildScreenIndex = require('../../src/screens/screen-index.service').buildScreenIndex;
  loadScreenFile = require('../../src/handlers/screen.handler').loadScreenFile;
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('every resolution the index claims is the file the loader returns', () => {
  const index = buildScreenIndex(root);
  const mismatches: string[] = [];

  for (const entry of index.screens) {
    for (const res of entry.resolutions) {
      const nodeId = res.scope === 'node' ? res.id ?? 0 : 1;
      const confId = res.scope === 'conf' ? res.id ?? undefined : 1;
      const session = {
        user: { secLevel: 0 }, terminalType: 'ansi', screenWidth: 80,
        screenHeight: 24, petsciiMode: false, relConfNum: confId, nodeId,
      };
      const loaded = loadScreenFile(entry.screen, confId, nodeId, session);
      const fromLoader = loaded ? path.relative(root, loaded.filePath) : null;
      if (fromLoader !== res.file) {
        mismatches.push(`${entry.screen} ${res.scope}=${res.id}: index ${res.file}, loader ${fromLoader}`);
      }
    }
  }

  expect(mismatches).toEqual([]);
});
```

- [ ] **Step 10: Run it, and fix the INDEX until it agrees**

Run: `cd web/backend && npm test -- tests/screens/index-agrees-with-loader.test.ts`
Expected: PASS. A failure means the index invented a rule. Fix the index -
never the loader, never the assertion.

- [ ] **Step 11: Commit**

```bash
git add web/backend/src/screens/mci-references.ts \
        web/backend/src/screens/screen-index.service.ts \
        web/backend/tests/screens/screen-index.test.ts \
        web/backend/tests/screens/index-agrees-with-loader.test.ts
git commit -m "feat(screens): an index of what resolves where, pinned to the loader"
```

---

### Task 3: The read API

**Files:**
- Create: `web/backend/src/api/screens-routes.ts`
- Modify: `web/backend/src/server/routes-setup.ts:145` (register beside the
  info-editor router)
- Test: `web/backend/tests/api/screens-read.test.ts`

**Interfaces:**
- Consumes: `getScreenIndex`, `screenFileFacts` (Task 2),
  `screenSearchLocations` (Task 1).
- Produces:
  ```ts
  export const screensRouter: express.Router;
  export function resolveScreenPath(relativePath: string): string | null;
  ```

- [ ] **Step 1: Write the failing test**

`web/backend/tests/api/screens-read.test.ts`:

```ts
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let root: string;
let app: express.Express;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screens-api-'));
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  // A high-bit byte, because latin1 is the point.
  fs.writeFileSync(path.join(root, 'Node1', 'BBSTITLE.txt'), Buffer.from([0xa1, 0x0d, 0x0a]));

  process.env.BBS_DATA_DIR = root;
  jest.resetModules();
  const { screensRouter } = require('../../src/api/screens-routes');
  app = express();
  app.use(express.json({ limit: '8mb' }));
  app.use('/api/screens', screensRouter);
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('GET /api/screens answers the index in the envelope pages unwrap', async () => {
  const res = await request(app).get('/api/screens');
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.data.screens.some((s: any) => s.screen === 'BBSTITLE')).toBe(true);
});

test('GET /api/screens/file returns the exact bytes as base64', async () => {
  const res = await request(app).get('/api/screens/file').query({ path: 'Node1/BBSTITLE.txt' });
  expect(res.status).toBe(200);
  expect(Buffer.from(res.body.data.content, 'base64')).toEqual(Buffer.from([0xa1, 0x0d, 0x0a]));
  expect(res.body.data.format).toBe('text');
});

test('GET /api/screens/resolve explains where it looked', async () => {
  const res = await request(app).get('/api/screens/resolve').query({ screen: 'BBSTITLE', node: '1' });
  expect(res.body.data.searched[0].desc).toBe('Node1');
  expect(res.body.data.chosen).toBe(path.join('Node1', 'BBSTITLE.txt'));
});

test('a path outside the board root is refused', async () => {
  const res = await request(app).get('/api/screens/file').query({ path: '../../etc/passwd' });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web/backend && npm test -- tests/api/screens-read.test.ts`
Expected: FAIL - cannot find `screens-routes`.

- [ ] **Step 3: Write the read routes**

Copy `resolveUnderRoot` and `sendOk` out of `info-editor-routes.ts` verbatim,
renaming the first to `resolveScreenPath` and exporting it - Tasks 4-6 use it.
Then:

```ts
screensRouter.get('/', (_req: Request, res: Response) => {
  sendOk(res, getScreenIndex(config.get('dataDir')));
});

screensRouter.get('/file', (req: Request, res: Response) => {
  const rel = String(req.query.path || '');
  const full = resolveScreenPath(rel);
  if (!full) return res.status(400).json({ success: false, error: 'Path outside the board root' });

  const buf = fs.readFileSync(full);

  if (req.query.download) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(full)}"`);
    return res.end(buf);
  }
  sendOk(res, { ...screenFileFacts(config.get('dataDir'), full), content: buf.toString('base64') });
});

screensRouter.get('/resolve', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const screen = String(req.query.screen || '');
  const nodeId = parseInt(String(req.query.node ?? '1'), 10);
  const confId = req.query.conf ? parseInt(String(req.query.conf), 10) : undefined;

  const searched = screenSearchLocations(baseDir, screen, { nodeId, confId })
    .map(l => ({ dir: path.relative(baseDir, l.dir), desc: l.desc }));

  const index = getScreenIndex(baseDir);
  const entry = index.screens.find(s => s.screen === screen.toUpperCase());
  const chosen = entry?.resolutions.find(r =>
    (r.scope === 'conf' ? r.id === confId : r.id === nodeId))?.file ?? null;

  sendOk(res, { screen, searched, chosen });
});
```

- [ ] **Step 4: Run the test**

Run: `cd web/backend && npm test -- tests/api/screens-read.test.ts`
Expected: PASS, four tests.

- [ ] **Step 5: Register the router**

In `routes-setup.ts`, beside the info-editor block:

```ts
  // ===== Screen Files API - Sysop-only Routes =====
  const { screensRouter } = require('../api/screens-routes');
  app.use('/api/screens', authenticateToken(db), requireSysop(), screensRouter);
```

- [ ] **Step 6: Typecheck and commit**

```bash
cd web/backend && npm run typecheck:tests
git add web/backend/src/api/screens-routes.ts \
        web/backend/src/server/routes-setup.ts \
        web/backend/tests/api/screens-read.test.ts
git commit -m "feat(screens): the read API - index, resolution and bytes"
```

---

### Task 4: The write API

**Files:**
- Modify: `web/backend/src/api/screens-routes.ts`
- Test: `web/backend/tests/api/screens-write.test.ts`

**Interfaces:**
- Consumes: `resolveScreenPath`, `sendOk` (Task 3), `invalidateScreenIndex`,
  `getScreenIndex` (Task 2).
- Produces: `PUT /file`, `POST /upload`, `DELETE /file`, each accepting
  `targets?: string[]` - relative paths that receive the same bytes.

- [ ] **Step 1: Write the failing test**

`web/backend/tests/api/screens-write.test.ts`, with the same `beforeAll` shape
as Task 3 plus `Node2/BBSTITLE.txt` and a `Node3/` directory:

```ts
test('PUT replaces the bytes and leaves a backup', async () => {
  const bytes = Buffer.from([0xa1, 0x41, 0x0a]);
  const res = await request(app).put('/api/screens/file')
    .query({ path: 'Node1/BBSTITLE.txt' })
    .send({ content: bytes.toString('base64') });

  expect(res.status).toBe(200);
  expect(fs.readFileSync(path.join(root, 'Node1/BBSTITLE.txt'))).toEqual(bytes);
  expect(fs.existsSync(path.join(root, 'Node1/BBSTITLE.txt.backup'))).toBe(true);
});

test('a fan-out writes every target and backs each one up', async () => {
  const bytes = Buffer.from('shared\n', 'latin1');
  await request(app).put('/api/screens/file')
    .query({ path: 'Node1/BBSTITLE.txt' })
    .send({
      content: bytes.toString('base64'),
      targets: ['Node1/BBSTITLE.txt', 'Node2/BBSTITLE.txt'],
    });

  expect(fs.readFileSync(path.join(root, 'Node2/BBSTITLE.txt'))).toEqual(bytes);
  expect(fs.existsSync(path.join(root, 'Node2/BBSTITLE.txt.backup'))).toBe(true);
});

test('a rename that changes the security suffix is refused', async () => {
  const res = await request(app).put('/api/screens/file')
    .query({ path: 'Node1/LOGON20.TXT', rename: 'LOGON.TXT' })
    .send({ content: Buffer.from('x').toString('base64') });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/security level|routing/i);
});

test('DELETE backs up and says what stops resolving', async () => {
  const res = await request(app).delete('/api/screens/file').query({ path: 'Node2/BBSTITLE.txt' });
  expect(res.status).toBe(200);
  expect(res.body.data.stopsResolving).toContain('BBSTITLE node=2');
  expect(fs.existsSync(path.join(root, 'Node2/BBSTITLE.txt'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'Node2/BBSTITLE.txt.backup'))).toBe(true);
});

test('a failed write in a fan-out restores every file already written', async () => {
  const target = path.join(root, 'Node1', 'BBSTITLE.txt');
  fs.writeFileSync(target, 'original\n', 'latin1');
  fs.chmodSync(path.join(root, 'Node3'), 0o500);

  await request(app).put('/api/screens/file')
    .query({ path: 'Node1/BBSTITLE.txt' })
    .send({
      content: Buffer.from('new\n').toString('base64'),
      targets: ['Node1/BBSTITLE.txt', 'Node3/BBSTITLE.txt'],
    });

  expect(fs.readFileSync(target, 'latin1')).toBe('original\n');
  fs.chmodSync(path.join(root, 'Node3'), 0o700);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web/backend && npm test -- tests/api/screens-write.test.ts`
Expected: FAIL - 404 on PUT.

- [ ] **Step 3: Implement the shared write helper**

```ts
/**
 * Write one buffer to many targets, atomically enough to undo.
 *
 * Each target is backed up before it is touched, and a failure anywhere
 * restores every file already written - a fan-out across forty nodes is
 * all-or-nothing rather than half-applied.
 */
function writeToTargets(targets: string[], buf: Buffer): { written: string[] } {
  const done: { full: string; backup: string | null }[] = [];
  try {
    for (const rel of targets) {
      const full = resolveScreenPath(rel);
      if (!full) throw new Error(`Path outside the board root: ${rel}`);
      let backup: string | null = null;
      if (fs.existsSync(full)) {
        backup = `${full}.backup`;
        fs.copyFileSync(full, backup);
      }
      fs.writeFileSync(full, buf);
      done.push({ full, backup });
    }
  } catch (error) {
    for (const d of done) {
      if (d.backup) fs.copyFileSync(d.backup, d.full);
      else fs.unlinkSync(d.full);
    }
    throw error;
  }
  invalidateScreenIndex();
  return { written: done.map(d => d.full) };
}

/** The security suffix and the type extension ARE the routing (express.e:6544-6640). */
function renameChangesRouting(from: string, to: string): boolean {
  const stem = (n: string) => n.toLowerCase().replace(/\.[^.]+$/, '');
  const sec = (n: string) => (stem(n).match(/(\d+)$/) || ['', ''])[1];
  const ext = (n: string) => n.toLowerCase().slice(n.toLowerCase().indexOf('.'));
  return sec(from) !== sec(to) || ext(from) !== ext(to);
}
```

`resolveScreenPath` answers null for a file that does not exist yet, so a
create resolves the PARENT and joins the basename - add
`resolveScreenPathAllowingNew(rel)` that does exactly that and use it inside
`writeToTargets`.

- [ ] **Step 4: Implement the three routes**

- `PUT /file` - decode `content` from base64, refuse a `rename` that returns
  true from `renameChangesRouting`, then `writeToTargets(targets ?? [rel], buf)`.
- `POST /upload` - `multer({ storage: multer.memoryStorage() })`, same helper,
  and refuse when the uploaded bytes sniff to a format the target's extension
  does not match (`.rip` bytes under a `.txt` name).
- `DELETE /file` - snapshot `getScreenIndex` before, back up, unlink,
  `invalidateScreenIndex()`, snapshot after, and report every
  `` `${screen} ${scope}=${id}` `` whose `file` went from a path to null.

Each ends with
`configRepo.logConfigChange('screen_files', 0, action, req.user?.id,
req.user?.username ?? 'sysop', { path: rel }, { targets })`.

- [ ] **Step 5: Run the tests**

Run: `cd web/backend && npm test -- tests/api/screens-write.test.ts`
Expected: PASS, five tests.

- [ ] **Step 6: Commit**

```bash
git add web/backend/src/api/screens-routes.ts web/backend/tests/api/screens-write.test.ts
git commit -m "feat(screens): replace, upload and delete, with a backup and an undo"
```

---

### Task 5: Sharing a directory

**Files:**
- Create: `web/backend/src/screens/share-preconditions.ts`
- Modify: `web/backend/src/api/screens-routes.ts`
- Test: `web/backend/tests/screens/share-preconditions.test.ts`
- Test: `web/backend/tests/api/screens-share.test.ts`

**Interfaces:**
- Consumes: `screenFileFacts` (Task 2), `resolveScreenPath` (Task 3),
  `NodeConfigService` from
  `web/backend/src/services/config-services/node-config.service.ts` (its
  `updateNodeConfig` owns the `SCREENS` key and appends the trailing slash).
- Produces:
  ```ts
  export interface ShareCheck {
    ok: boolean;
    reasons: string[];
    losing: string[];
    gaining: string[];
  }
  export function checkShare(baseDir: string, nodeId: number, sharedDirRel: string): ShareCheck;
  ```

- [ ] **Step 1: Write the failing precondition test**

`web/backend/tests/screens/share-preconditions.test.ts`:

```ts
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkShare } from '../../src/screens/share-preconditions';

let root: string;
const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'share-'));
  write('Node1/BBSTITLE.txt', 'title\n');
  write('Node1/LOGON.TXT', 'logon\n');
  write('Screens/Shared/BBSTITLE.txt', 'title\n');
  write('Screens/Shared/LOGON.TXT', 'logon\n');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('identical sets pass', () => {
  expect(checkShare(root, 1, 'Screens/Shared').ok).toBe(true);
});

test('a byte difference blocks it, even one trailing newline', () => {
  fs.appendFileSync(path.join(root, 'Node1', 'BBSTITLE.txt'), '\n');
  const check = checkShare(root, 1, 'Screens/Shared');
  expect(check.ok).toBe(false);
  expect(check.reasons.join(' ')).toMatch(/BBSTITLE\.txt differs/);
});

test('a file the node has and the shared set lacks is reported as losing', () => {
  write('Node1/JOIN.TXT', 'join\n');
  expect(checkShare(root, 1, 'Screens/Shared').losing).toContain('JOIN.TXT');
});

test('a file only the shared set has is reported as gaining', () => {
  write('Screens/Shared/JOINED.TXT', 'joined\n');
  expect(checkShare(root, 1, 'Screens/Shared').gaining).toContain('JOINED.TXT');
});

test('a node-specific MCI reference blocks it', () => {
  write('Node1/LOGON.TXT', '~SS_BBS:Node1/x.txt');
  write('Screens/Shared/LOGON.TXT', '~SS_BBS:Node1/x.txt');
  const check = checkShare(root, 1, 'Screens/Shared');
  expect(check.ok).toBe(false);
  expect(check.reasons.join(' ')).toMatch(/names a node or conference/i);
});

test('filenames are matched case-insensitively, an Amiga volume', () => {
  fs.renameSync(path.join(root, 'Node1', 'LOGON.TXT'), path.join(root, 'Node1', 'logon.txt'));
  const check = checkShare(root, 1, 'Screens/Shared');
  expect(check.losing).toEqual([]);
  expect(check.gaining).toEqual([]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web/backend && npm test -- tests/screens/share-preconditions.test.ts`
Expected: FAIL - cannot find `share-preconditions`.

- [ ] **Step 3: Implement `checkShare`**

```ts
/**
 * Whether a node can be pointed at a shared screen directory.
 *
 * The SCREENS tooltype redirects the node's WHOLE screen set, not one file
 * (ACP.e:2666-2673), so sharing on the strength of one identical BBSTITLE
 * would silently repoint LOGON, LOGOFF, JOIN and everything else that node
 * reads. Every file has to match, by bytes.
 *
 * No normalisation: CRLF, trailing whitespace and SAUCE differences are real
 * differences. Names are matched case-insensitively - the volume is an Amiga
 * one - and reported exactly as they sit on disk.
 */
export function checkShare(baseDir: string, nodeId: number, sharedDirRel: string): ShareCheck {
  const reasons: string[] = [];
  const nodeDir = path.join(baseDir, `Node${nodeId}`);
  const sharedDir = path.join(baseDir, sharedDirRel);

  const byLowerName = (dir: string) => {
    const map = new Map<string, string>();
    for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      if (name.endsWith('.backup')) continue;
      if (fs.statSync(path.join(dir, name)).isDirectory()) continue;
      map.set(name.toLowerCase(), name);
    }
    return map;
  };

  const mine = byLowerName(nodeDir);
  const theirs = byLowerName(sharedDir);

  const losing = [...mine].filter(([k]) => !theirs.has(k)).map(([, v]) => v);
  const gaining = [...theirs].filter(([k]) => !mine.has(k)).map(([, v]) => v);

  for (const [key, name] of mine) {
    const other = theirs.get(key);
    if (!other) continue;
    const a = screenFileFacts(baseDir, path.join(nodeDir, name));
    const b = screenFileFacts(baseDir, path.join(sharedDir, other));
    if (a.sha256 !== b.sha256 || a.bytes !== b.bytes) reasons.push(`${name} differs`);
    for (const facts of [a, b]) {
      if (facts.mci.some(m => m.scopeSpecific)) {
        reasons.push(`${facts.relPath} names a node or conference`);
      }
    }
  }

  return { ok: reasons.length === 0 && losing.length === 0 && gaining.length === 0, reasons, losing, gaining };
}
```

- [ ] **Step 4: Run the precondition tests**

Run: `cd web/backend && npm test -- tests/screens/share-preconditions.test.ts`
Expected: PASS, six tests.

- [ ] **Step 5: Write the route test**

`web/backend/tests/api/screens-share.test.ts`:

```ts
test('POST /share refuses when the sets differ, and changes nothing', async () => {
  fs.writeFileSync(path.join(root, 'Node1', 'EXTRA.TXT'), 'x', 'latin1');

  const res = await request(app).post('/api/screens/share')
    .send({ nodes: [1], sharedDir: 'Screens/Shared' });

  expect(res.status).toBe(409);
  expect(res.body.data.blocked[0].losing).toContain('EXTRA.TXT');
  expect(fs.existsSync(path.join(root, 'Node1.info'))).toBe(false);
});

test('a dry run reports what would happen and writes nothing', async () => {
  fs.unlinkSync(path.join(root, 'Node1', 'EXTRA.TXT'));

  const res = await request(app).post('/api/screens/share')
    .send({ nodes: [1], sharedDir: 'Screens/Shared', dryRun: true });

  expect(res.body.data.wouldWrite).toEqual(['Node1.info']);
  expect(fs.existsSync(path.join(root, 'Node1.info'))).toBe(false);
});

test('POST /share writes the tooltype with its trailing slash and deletes nothing', async () => {
  const res = await request(app).post('/api/screens/share')
    .send({ nodes: [1], sharedDir: 'Screens/Shared' });

  expect(res.status).toBe(200);
  expect(readTooltypeMap(path.join(root, 'Node1.info')).get('SCREENS')).toBe('BBS:Screens/Shared/');
  expect(fs.existsSync(path.join(root, 'Node1', 'BBSTITLE.txt'))).toBe(true);
});
```

- [ ] **Step 6: Implement `POST /share`**

Check every requested node FIRST. If any check fails, answer 409 with
`{ blocked: [{ id, reasons, losing, gaining }], canShare: [] }` and write
nothing at all - a partial share is how forty nodes end up in two states.
Otherwise, for each node call

```ts
await new NodeConfigService(db).updateNodeConfig(
  nodeId + 1,                                   // the service's row id is node_number + 1
  { node_number: nodeId, screens: `BBS:${sharedDirRel}` } as never,
  { userId: req.user?.id, username: req.user?.username ?? 'sysop' } as never,
);
```

then `invalidateScreenIndex()` and log to the audit log. `dryRun` returns the
same shape with `wouldWrite` listing the icons and writes nothing.

- [ ] **Step 7: Run the route tests, typecheck, commit**

```bash
cd web/backend && npm test -- tests/api/screens-share.test.ts && npm run typecheck:tests
git add web/backend/src/screens/share-preconditions.ts \
        web/backend/src/api/screens-routes.ts \
        web/backend/tests/screens/share-preconditions.test.ts \
        web/backend/tests/api/screens-share.test.ts
git commit -m "feat(screens): share a directory, when every byte says it is safe"
```

---

### Task 6: Export and import

**Files:**
- Modify: `web/backend/src/api/screens-routes.ts`
- Test: `web/backend/tests/api/screens-archive.test.ts`

**Interfaces:**
- Consumes: `resolveScreenPath`, `writeToTargets` (Tasks 3-4), `adm-zip`.
- Produces: `GET /export?scope=`, `POST /import` (multipart field `archive`,
  optional `dryRun`).

- [ ] **Step 1: Write the failing test**

```ts
import AdmZip from 'adm-zip';

test('GET /export returns a zip holding the scope, bytes intact', async () => {
  const res = await request(app).get('/api/screens/export').query({ scope: 'Node1' })
    .buffer().parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  const zip = new AdmZip(res.body);
  const entry = zip.getEntry('Node1/BBSTITLE.txt')!;
  expect(entry.getData()).toEqual(fs.readFileSync(path.join(root, 'Node1/BBSTITLE.txt')));
});

test('POST /import with dryRun lists what would land and writes nothing', async () => {
  const zip = new AdmZip();
  zip.addFile('Node1/BBSTITLE.txt', Buffer.from([0xa1]));
  const before = fs.readFileSync(path.join(root, 'Node1/BBSTITLE.txt'));

  const res = await request(app).post('/api/screens/import')
    .field('dryRun', 'true')
    .attach('archive', zip.toBuffer(), 'screens.zip');

  expect(res.body.data.plan).toEqual([
    { path: 'Node1/BBSTITLE.txt', action: 'replace', bytes: 1 },
  ]);
  expect(fs.readFileSync(path.join(root, 'Node1/BBSTITLE.txt'))).toEqual(before);
});

test('a real import writes the bytes and backs up what it replaced', async () => {
  const zip = new AdmZip();
  zip.addFile('Node1/BBSTITLE.txt', Buffer.from([0xa1]));

  await request(app).post('/api/screens/import').attach('archive', zip.toBuffer(), 'screens.zip');

  expect(fs.readFileSync(path.join(root, 'Node1/BBSTITLE.txt'))).toEqual(Buffer.from([0xa1]));
  expect(fs.existsSync(path.join(root, 'Node1/BBSTITLE.txt.backup'))).toBe(true);
});

test('an entry escaping the board root is refused and nothing is written', async () => {
  const zip = new AdmZip();
  zip.addFile('../escape.txt', Buffer.from('x'));

  const res = await request(app).post('/api/screens/import').attach('archive', zip.toBuffer(), 'e.zip');

  expect(res.status).toBe(400);
  expect(fs.existsSync(path.join(path.dirname(root), 'escape.txt'))).toBe(false);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web/backend && npm test -- tests/api/screens-archive.test.ts`
Expected: FAIL - 404 on export.

- [ ] **Step 3: Implement export**

`scope` accepts `all`, `Screens`, a `Node<N>` or a `Conf<N>`. Walk that
scope's screen directories, `zip.addFile(relPath, fs.readFileSync(abs))`,
answer with `Content-Type: application/zip` and
`Content-Disposition: attachment; filename="screens-<scope>-<YYYY-MM-DD>.zip"`.

- [ ] **Step 4: Implement import**

Read every entry; resolve each through `resolveScreenPath` (allowing new
files); refuse the WHOLE archive with 400 if any entry escapes the root or
lands outside a screen location - a partly-applied archive is worse than a
rejected one. Build the plan as `{ path, action: 'create' | 'replace', bytes }`,
answer it when `dryRun` is set, otherwise pass each entry through
`writeToTargets` so the existing backup-and-restore applies, then
`invalidateScreenIndex()` and log.

- [ ] **Step 5: Run the tests, typecheck, commit**

```bash
cd web/backend && npm test -- tests/api/screens-archive.test.ts && npm run typecheck:tests
git add web/backend/src/api/screens-routes.ts web/backend/tests/api/screens-archive.test.ts
git commit -m "feat(screens): export a scope, import an archive, dry run first"
```

---

### Task 7: The page - screens, files and preview

**Files:**
- Create: `web/config-app/src/pages/screen-index-view.ts`
- Create: `web/config-app/src/pages/ScreenFilesPage.tsx`
- Modify: `web/config-app/src/api/client.ts` (add `put` and the screen calls)
- Modify: `web/config-app/src/App.tsx` (add the `screens` route)
- Modify: `web/config-app/src/components/AppShell/nav-config.ts` (Content group)
- Test: `web/config-app/src/test/screen-index-view.test.ts`

**Interfaces:**
- Consumes: `GET /api/screens`, `GET /api/screens/file` (Task 3).
- Produces:
  ```ts
  export interface ScreenRow {
    screen: string; scopeLabel: string; resolvedCount: number;
    missingCount: number; distinctContents: number; brokenReferences: number;
  }
  export function toScreenRows(index: ScreenIndex): ScreenRow[];
  export function filterScreenRows(rows: ScreenRow[], query: string): ScreenRow[];
  ```

- [ ] **Step 1: Write the failing view-model test**

`web/config-app/src/test/screen-index-view.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { toScreenRows, filterScreenRows } from '../pages/screen-index-view';

const index = {
  screens: [
    {
      screen: 'BBSTITLE', dirType: 'node',
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/BBSTITLE.txt', variants: [] },
        { scope: 'node', id: 2, dir: 'Node2', dirIsShared: false, file: null, variants: [] },
      ],
      missingScopes: 1,
      duplicateGroups: [{ sha256: 'a', paths: ['Node1/BBSTITLE.txt'] }],
    },
  ],
  unused: [],
  files: {
    'Node1/BBSTITLE.txt': {
      relPath: 'Node1/BBSTITLE.txt', bytes: 6, format: 'text', sha256: 'a',
      mci: [{ code: 'CC', target: 'nosuchdoor', resolves: false, scopeSpecific: false }],
    },
  },
  builtAt: '2026-09-01T00:00:00.000Z',
} as any;

describe('the screens list', () => {
  test('counts what resolves and what is missing', () => {
    const [row] = toScreenRows(index);
    expect(row).toMatchObject({ screen: 'BBSTITLE', resolvedCount: 1, missingCount: 1 });
  });

  test('says which scope a screen belongs to, in words', () => {
    expect(toScreenRows(index)[0].scopeLabel).toBe('node scope');
  });

  test('counts the distinct contents behind a screen', () => {
    expect(toScreenRows(index)[0].distinctContents).toBe(1);
  });

  test('counts broken references so a dead menu item is visible in the list', () => {
    expect(toScreenRows(index)[0].brokenReferences).toBe(1);
  });

  test('search matches the screen name', () => {
    const rows = toScreenRows(index);
    expect(filterScreenRows(rows, 'bbstitle')).toHaveLength(1);
    expect(filterScreenRows(rows, 'menu')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web/config-app && npm test -- screen-index-view`
Expected: FAIL - cannot resolve `../pages/screen-index-view`.

- [ ] **Step 3: Write `screen-index-view.ts`**

Pure functions only, so they are tested without rendering:
`toScreenRows` maps each `ScreenIndexEntry` to a row -
`resolvedCount` = resolutions with a file, `missingCount` = `missingScopes`,
`distinctContents` = the number of distinct `sha256` values among the resolved
files, `brokenReferences` = MCI references with `resolves: false` across those
files, `scopeLabel` = `'node scope' | 'conference scope' | 'board root'`.
`filterScreenRows` matches the screen name case-insensitively.

- [ ] **Step 4: Run the test**

Run: `cd web/config-app && npm test -- screen-index-view`
Expected: PASS, five tests.

- [ ] **Step 5: Add the API calls**

`client.ts` has `get`, `post` and `delete` but no `put` - add it beside `post`,
following the same shape as the methods around it:

```ts
  async put<T>(url: string, body?: any): Promise<{ data: T }> {
    return this.request<T>(url, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
  }
```

then, in the same file as the other domain calls:

```ts
  async getScreenIndex() { return this.get<ScreenIndex>('/api/screens'); }
  async getScreenFile(path: string) {
    return this.get<ScreenFileWithContent>(`/api/screens/file?path=${encodeURIComponent(path)}`);
  }
  async putScreenFile(path: string, content: string, targets?: string[]) {
    return this.put(`/api/screens/file?path=${encodeURIComponent(path)}`, { content, targets });
  }
  async deleteScreenFile(path: string) {
    return this.delete(`/api/screens/file?path=${encodeURIComponent(path)}`);
  }
  async shareScreens(nodes: number[], sharedDir: string, dryRun = false) {
    return this.post('/api/screens/share', { nodes, sharedDir, dryRun });
  }
```

- [ ] **Step 6: Write the page**

`ScreenFilesPage.tsx` renders `components/ui/DataTable` over `toScreenRows`
(never a raw `<table>` - every admin page but Node Configuration is on
`DataTable`). Selecting a screen shows its resolutions per scope and the files
underneath, with the duplicate groups collapsed into one row each.

Preview reuses the renderer the admin already ships:

```tsx
import { SessionLogTerminal } from '../components/SessionLogTerminal';

// ANSI and plain text: the same xterm the session log replays into.
<SessionLogTerminal content={atob(file.content)} />
```

`.rip` renders through the vendored RIPterm component; `.seq` renders through
the PETSCII path with the label "PETSCII does not render correctly on the
board yet". Beside the preview, list the file's MCI references - code, target,
and whether it resolves - and never expand them: expanding needs a live
session, and a faked value would be a lie about what a caller sees.

- [ ] **Step 7: Register the page**

`App.tsx`, beside the other content routes:

```tsx
        <Route path="screens" element={<ScreenFilesPage />} />
```

`nav-config.ts`, in the Content group after Doors (import `FileImage` from
`lucide-react` with the other icons - the house rule is a flat icon set, never
an emoji):

```ts
      { path: 'screens', label: 'Screen Files', icon: FileImage, description: 'Every screen the board can display, and where it resolves from' },
```

- [ ] **Step 8: Run the tests and the typecheck**

Run: `cd web/config-app && npm test && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, and no type errors.

- [ ] **Step 9: Commit**

```bash
git add web/config-app/src/pages/ScreenFilesPage.tsx \
        web/config-app/src/pages/screen-index-view.ts \
        web/config-app/src/api/client.ts \
        web/config-app/src/App.tsx \
        web/config-app/src/components/AppShell/nav-config.ts \
        web/config-app/src/test/screen-index-view.test.ts
git commit -m "feat(admin): the screen files page - what resolves where, and how it looks"
```

---

### Task 8: Replace, upload and delete in the page

**Files:**
- Create: `web/config-app/src/pages/screen-write-plan.ts`
- Modify: `web/config-app/src/pages/ScreenFilesPage.tsx`
- Test: `web/config-app/src/test/screen-write-plan.test.ts`

**Interfaces:**
- Consumes: `putScreenFile`, `deleteScreenFile` (Task 7), the index (Task 2).
- Produces:
  ```ts
  export type FanOutChoice = 'this-file' | 'all-copies' | 'share-then-write';
  export interface FanOutOption {
    choice: FanOutChoice; label: string; targets: string[]; suggested: boolean;
  }
  export function fanOutOptions(index: ScreenIndex, screen: string, openPath: string): FanOutOption[];
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest';
import { fanOutOptions } from '../pages/screen-write-plan';

const twoNodes = (hashA: string, hashB: string) => ({
  screens: [{
    screen: 'BBSTITLE', dirType: 'node',
    resolutions: [
      { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/BBSTITLE.txt', variants: [] },
      { scope: 'node', id: 2, dir: 'Node2', dirIsShared: false, file: 'Node2/BBSTITLE.txt', variants: [] },
    ],
    missingScopes: 0, duplicateGroups: [],
  }],
  unused: [],
  files: {
    'Node1/BBSTITLE.txt': { relPath: 'Node1/BBSTITLE.txt', bytes: 1, format: 'text', sha256: hashA, mci: [] },
    'Node2/BBSTITLE.txt': { relPath: 'Node2/BBSTITLE.txt', bytes: 1, format: 'text', sha256: hashB, mci: [] },
  },
  builtAt: '',
} as any);

describe('the fan-out choices', () => {
  test('offers this-file and all-copies when a screen exists on several nodes', () => {
    const options = fanOutOptions(twoNodes('a', 'b'), 'BBSTITLE', 'Node1/BBSTITLE.txt');
    expect(options.map(o => o.choice)).toEqual(['this-file', 'all-copies', 'share-then-write']);
    expect(options[1].targets).toEqual(['Node1/BBSTITLE.txt', 'Node2/BBSTITLE.txt']);
  });

  test('suggests sharing only when every copy is already identical', () => {
    const identical = fanOutOptions(twoNodes('a', 'a'), 'BBSTITLE', 'Node1/BBSTITLE.txt');
    const divergent = fanOutOptions(twoNodes('a', 'b'), 'BBSTITLE', 'Node1/BBSTITLE.txt');
    expect(identical.find(o => o.choice === 'share-then-write')!.suggested).toBe(true);
    expect(divergent.find(o => o.choice === 'share-then-write')!.suggested).toBe(false);
  });

  test('a screen that exists once offers only this-file', () => {
    const one = twoNodes('a', 'a');
    one.screens[0].resolutions = [one.screens[0].resolutions[0]];
    delete one.files['Node2/BBSTITLE.txt'];
    expect(fanOutOptions(one, 'BBSTITLE', 'Node1/BBSTITLE.txt').map((o: any) => o.choice))
      .toEqual(['this-file']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web/config-app && npm test -- screen-write-plan`
Expected: FAIL - cannot resolve `../pages/screen-write-plan`.

- [ ] **Step 3: Write `screen-write-plan.ts`**

`fanOutOptions` returns `this-file` always; adds `all-copies` and
`share-then-write` only when the screen resolves in more than one scope; sets
`suggested` on `share-then-write` when every resolved file shares one
`sha256`. Labels read as sentences: `'this file only'`,
`` `all ${n} nodes that have ${screen}` ``, `'share from one directory, then write once'`.

- [ ] **Step 4: Run the test**

Run: `cd web/config-app && npm test -- screen-write-plan`
Expected: PASS, three tests.

- [ ] **Step 5: Wire the dialogs**

Replace and upload open the fan-out dialog built from `fanOutOptions`; the
confirmation names every target and how many backups it will write. Delete
shows the API's `stopsResolving` list before confirming. Both use the existing
`useNotification()` confirm-then-toast pattern the rest of the admin uses, so a
destructive action looks the same here as everywhere else.

- [ ] **Step 6: Commit**

```bash
cd web/config-app && npm test && npx tsc --noEmit -p tsconfig.json
git add web/config-app/src/pages/screen-write-plan.ts \
        web/config-app/src/pages/ScreenFilesPage.tsx \
        web/config-app/src/test/screen-write-plan.test.ts
git commit -m "feat(admin): replace and delete a screen, with the fan-out in front of you"
```

---

### Task 9: Share, import and export in the page

**Files:**
- Create: `web/config-app/src/pages/screen-share-view.ts`
- Modify: `web/config-app/src/pages/ScreenFilesPage.tsx`
- Test: `web/config-app/src/test/screen-share-view.test.ts`

**Interfaces:**
- Consumes: `POST /api/screens/share`, `GET /api/screens/export`,
  `POST /api/screens/import` (Tasks 5-6).
- Produces:
  ```ts
  export interface ShareSummary {
    canShare: number[];
    blocked: { id: number; reasons: string[] }[];
  }
  export function summariseShare(checks: Record<number, ShareCheck>): ShareSummary;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest';
import { summariseShare } from '../pages/screen-share-view';

describe('the share summary', () => {
  test('splits nodes into those that can share and those that cannot, with the reason', () => {
    const summary = summariseShare({
      1: { ok: true, reasons: [], losing: [], gaining: [] },
      2: { ok: false, reasons: ['LOGON.TXT differs'], losing: [], gaining: [] },
    } as any);
    expect(summary.canShare).toEqual([1]);
    expect(summary.blocked).toEqual([{ id: 2, reasons: ['LOGON.TXT differs'] }]);
  });

  test('a node losing a file is blocked, and the file is named in the reason', () => {
    const summary = summariseShare({
      3: { ok: false, reasons: [], losing: ['JOIN.TXT'], gaining: [] },
    } as any);
    expect(summary.blocked[0].reasons.join(' ')).toMatch(/JOIN\.TXT/);
  });
});
```

- [ ] **Step 2: Run it, watch it fail, implement, run it again**

Run: `cd web/config-app && npm test -- screen-share-view`
`summariseShare` folds `losing` and `gaining` into readable reasons
(`` `would lose ${name}` ``, `` `would gain ${name}` ``) so the dialog never
shows an empty explanation for a blocked node.

- [ ] **Step 3: Wire the UI**

A duplicate group shows "41 nodes, 1 distinct content" with a **Share from one
directory** action. The dialog runs the dry run first and lists, per node, what
it loses and gains; blocked nodes are shown with their reason and cannot be
selected. Export is a link to `/api/screens/export?scope=`; import is a file
input that posts with `dryRun` first and shows the plan before the real run.

- [ ] **Step 4: Full check and commit**

```bash
cd web/backend && npm test -- tests/screens tests/api/screens && npm run typecheck:tests
cd ../config-app && npm test && npx tsc --noEmit -p tsconfig.json
git add web/config-app/src/pages/ScreenFilesPage.tsx \
        web/config-app/src/pages/screen-share-view.ts \
        web/config-app/src/test/screen-share-view.test.ts
git commit -m "feat(admin): share a screen directory, and move screens in and out"
```

---

## Manual verification - the sysop's, not the implementer's

With the dev stack running (`./dev/scripts/start-servers.sh --bbs-only`) at
`http://localhost:3001/admin`. Do NOT tick these off on the sysop's behalf.

- [ ] Screen Files lists every screen, and BBSTITLE shows its nodes resolved
- [ ] Opening BBSTITLE on node 1 previews the art as a caller sees it
- [ ] A menu with `~CC_` codes lists them; a deleted door shows as broken
- [ ] Download a screen - the bytes match the file on the volume
- [ ] Replace it with "this file only"; the board shows the new one
- [ ] Replace with "all N nodes"; one `.backup` exists per node
- [ ] Delete a screen, and read what it says will stop resolving first
- [ ] Share a set of identical nodes; the tooltype appears in Node
      Configuration and the board still displays the screen
- [ ] Clear that tooltype; the node reads its own directory again
- [ ] Export `Node1`, then import it back - dry run first, then for real

## After phase 1

Phase 1b (screens in the entrypoint's tracked class) and phases 2-3 (the ANSI
editor, then RIP) are scoped in the spec. Do not start them from this plan.
