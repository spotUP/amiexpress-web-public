# Door Server Phase 1 (stand-up + read parity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `amiexpress-doorserver` as a standalone service that serves the existing door-repo read API byte-identically from its own database and archive corpus, with the data migrated and the container deployed - while amiexpress-web keeps serving its own copy untouched.

**Architecture:** A new git repository beside amiexpress-web holds an Express 5 + better-sqlite3 service. The read modules (`door-repo-manifest`, `door-repo-checksums`, the read half of `door-catalog.service`, `door-repo.routes`) are PORTED, not rewritten: same SQL, same headers, same byte formats. A parity harness captures responses from the current BBS-served API as committed fixtures and asserts the new server reproduces them exactly. Nothing in amiexpress-web changes in this phase; the cutover (proxy, `door_installs`, admin API) is phases 2 and 3.

**Tech Stack:** TypeScript 5.9 (strict), Node 20, Express ^5.1.0, better-sqlite3 ^11.10.0, Jest 29 + ts-jest, Docker (node:20-alpine), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-23-door-server-split-design.md` (in amiexpress-web; copied into the new repo in Task 9)

## Global Constraints

- **New repo location:** `~/Code/amiexpress-doorserver`, git repo `amiexpress-doorserver`. Every path in this plan that is not prefixed `amiexpress-web/` is relative to that directory.
- **Express version must be ^5.1.0** - `req.fresh` conditional-GET behaviour is the contract; a different major changes it.
- **better-sqlite3 ^11.10.0** - same major as the BBS, so the same DB file works either side during migration.
- **TypeScript strict, no `any`.** Export types for anything crossing a module boundary.
- **No emojis anywhere** - log output uses ASCII tokens: `[OK]`, `[ERROR]`, `[WARN]`, `[INFO]`.
- **Latin-1 is data, not text.** `list.txt`, `/diz`, `/doc`, `/files` are ISO-8859-1 with CRLF. Never write these files or fixtures with a tool that round-trips through UTF-8 - use `Buffer`, `fs.writeFileSync` with a Buffer, or `python3`/`sed`. An editor round-trip turns `0xA1` into `EF BF BD` and silently destroys the fixture.
- **The read API's observable behaviour must not change.** Status, headers, header casing where clients read it, byte-for-byte bodies. When porting, changing a comment is fine; changing a value is a defect.
- **Revision string** is `c<count>-t<max(indexed_at)>` from `door_catalog` - never the git SHA.
- **Every behaviour change ships with a test that fails first.** Run each new test against the unmodified code before implementing.
- **Never `git add -A`.** Add files by name. No `--no-verify`.
- **Archives are not committed.** The corpus (~174 MB) lives outside the repo, path from config.

---

### Task 1: Repository skeleton and fail-loud configuration

**Files:**
- Create: `package.json`, `tsconfig.json`, `jest.config.ts`, `.gitignore`, `README.md`
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `loadConfig(env?: NodeJS.ProcessEnv): ServerConfig` and `interface ServerConfig { dbPath: string; archivesRoot: string; port: number; adminKeys: Array<{ label: string; key: string }> }`. Throws `ConfigError` (exported) when a required value is missing or a path does not exist. Every later task imports config from here and never reads `process.env` directly.

- [ ] **Step 1: Create the repository**

```bash
mkdir -p ~/Code/amiexpress-doorserver
cd ~/Code/amiexpress-doorserver
git init
mkdir -p src tests contract scripts
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "amiexpress-doorserver",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "build": "tsc -p tsconfig.json && cp src/schema.sql dist/src/schema.sql",
    "start": "node dist/src/index.js",
    "dev": "tsx watch src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "jest --config jest.config.ts",
    "test:ci": "jest --config jest.config.ts --ci"
  },
  "dependencies": {
    "better-sqlite3": "^11.10.0",
    "express": "^5.1.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/express": "^5.0.0",
    "@types/jest": "^29.5.12",
    "@types/node": "^24.10.1",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.1.2",
    "tsx": "^4.19.2",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts", "contract/**/*.ts", "scripts/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 4: Write `jest.config.ts`**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
};

export default config;
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
*.db
*.sqlite
.DS_Store
tests/tmp/
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: no errors; `node_modules/better-sqlite3` present (it compiles a native binding - on failure, that is a toolchain problem to fix now, not later).

- [ ] **Step 7: Write the failing config test**

```typescript
// tests/config.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig, ConfigError } from '../src/config';

describe('loadConfig', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doorsrv-'));
    fs.writeFileSync(path.join(tmp, 'doors.db'), '');
    fs.mkdirSync(path.join(tmp, 'Archives'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('reads db path, archives root and port from the environment', () => {
    const cfg = loadConfig({
      DOORSERVER_DB: path.join(tmp, 'doors.db'),
      DOOR_ARCHIVES_ROOT: path.join(tmp, 'Archives'),
      PORT: '3010',
    });
    expect(cfg.dbPath).toBe(path.join(tmp, 'doors.db'));
    expect(cfg.archivesRoot).toBe(path.join(tmp, 'Archives'));
    expect(cfg.port).toBe(3010);
  });

  it('defaults the port to 3010 when PORT is unset', () => {
    const cfg = loadConfig({
      DOORSERVER_DB: path.join(tmp, 'doors.db'),
      DOOR_ARCHIVES_ROOT: path.join(tmp, 'Archives'),
    });
    expect(cfg.port).toBe(3010);
  });

  it('refuses to start when DOORSERVER_DB is missing', () => {
    expect(() => loadConfig({ DOOR_ARCHIVES_ROOT: path.join(tmp, 'Archives') }))
      .toThrow(ConfigError);
  });

  it('refuses to start when the archives root does not exist', () => {
    expect(() => loadConfig({
      DOORSERVER_DB: path.join(tmp, 'doors.db'),
      DOOR_ARCHIVES_ROOT: path.join(tmp, 'nope'),
    })).toThrow(/DOOR_ARCHIVES_ROOT/);
  });

  it('parses labelled admin keys', () => {
    const cfg = loadConfig({
      DOORSERVER_DB: path.join(tmp, 'doors.db'),
      DOOR_ARCHIVES_ROOT: path.join(tmp, 'Archives'),
      DOORSERVER_ADMIN_KEYS: 'spot:abc123,phantasm:def456',
    });
    expect(cfg.adminKeys).toEqual([
      { label: 'spot', key: 'abc123' },
      { label: 'phantasm', key: 'def456' },
    ]);
  });

  it('yields no admin keys when the variable is unset', () => {
    const cfg = loadConfig({
      DOORSERVER_DB: path.join(tmp, 'doors.db'),
      DOOR_ARCHIVES_ROOT: path.join(tmp, 'Archives'),
    });
    expect(cfg.adminKeys).toEqual([]);
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npx jest --config jest.config.ts tests/config.test.ts`
Expected: FAIL - "Cannot find module '../src/config'"

- [ ] **Step 9: Write `src/config.ts`**

```typescript
/**
 * Configuration for the door server.
 *
 * Every path is explicit. The BBS's resolveArchiveRoot() had a fallback
 * chain ending in a hardcoded developer path; a server that silently serves
 * the wrong corpus - or an empty catalog - publishes a valid revision and
 * poisons every client's cache. So: configured, or refuse to start.
 */
import * as fs from 'fs';

export class ConfigError extends Error {}

export interface AdminKey {
  label: string;
  key: string;
}

export interface ServerConfig {
  dbPath: string;
  archivesRoot: string;
  port: number;
  adminKeys: AdminKey[];
}

const DEFAULT_PORT = 3010;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new ConfigError(`${name} is not set; the door server refuses to start without it`);
  }
  return value;
}

function mustExist(name: string, value: string): string {
  if (!fs.existsSync(value)) {
    throw new ConfigError(`${name} points at ${value}, which does not exist`);
  }
  return value;
}

function parseAdminKeys(raw: string | undefined): AdminKey[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const idx = pair.indexOf(':');
      if (idx <= 0 || idx === pair.length - 1) {
        throw new ConfigError(`DOORSERVER_ADMIN_KEYS entry "${pair}" is not <label>:<key>`);
      }
      return { label: pair.slice(0, idx), key: pair.slice(idx + 1) };
    });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dbPath = mustExist('DOORSERVER_DB', required(env, 'DOORSERVER_DB'));
  const archivesRoot = mustExist('DOOR_ARCHIVES_ROOT', required(env, 'DOOR_ARCHIVES_ROOT'));
  const port = env.PORT ? Number(env.PORT) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0) {
    throw new ConfigError(`PORT is "${env.PORT}", which is not a usable port number`);
  }
  return { dbPath, archivesRoot, port, adminKeys: parseAdminKeys(env.DOORSERVER_ADMIN_KEYS) };
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx jest --config jest.config.ts tests/config.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 11: Write `README.md`**

```markdown
# amiexpress-doorserver

The AmiExpress door repository, as a standalone service: catalog, archive
corpus, curation API.

Split out of amiexpress-web (design:
`docs/superpowers/specs/2026-08-23-door-server-split-design.md`) so other
BBSes can depend on the repository without depending on one BBS's uptime,
deploy schedule or database.

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `DOORSERVER_DB` | yes | path to `doors.db` |
| `DOOR_ARCHIVES_ROOT` | yes | directory holding the archive corpus |
| `PORT` | no | listen port, default 3010 |
| `DOORSERVER_ADMIN_KEYS` | no | `label:key,label:key` - curation keys (phase 3) |

Missing or non-existent paths are a startup failure, never a default.

## Commands

| Task | Command |
|---|---|
| dev server | `npm run dev` |
| build | `npm run build` |
| type-check | `npm run typecheck` |
| test | `npm test` |
| test (CI) | `npm run test:ci` |
```

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json tsconfig.json jest.config.ts .gitignore README.md src/config.ts tests/config.test.ts
git commit -m "feat: repository skeleton and fail-loud configuration"
```

---

### Task 2: Database module and schema

**Files:**
- Create: `src/db.ts`, `src/schema.sql`
- Test: `tests/db.test.ts`

**Interfaces:**
- Consumes: `loadConfig` / `ServerConfig` from Task 1.
- Produces: `openDb(cfg: ServerConfig, opts?: { readonly?: boolean }): Database.Database` and `applySchema(db: Database.Database): void`. Every later module takes a `ServerConfig` and calls `openDb` - no module computes a DB path of its own (the BBS had `DB_PATH` recomputed in two files; that is the bug this avoids).

- [ ] **Step 1: Write `src/schema.sql`**

The BBS's `door_catalog` minus the three per-node columns (`installed`, `installed_as`, `install_dir`), which the spec moves to the BBS's `door_installs`.

```sql
CREATE TABLE IF NOT EXISTS door_catalog (
  id                  TEXT PRIMARY KEY,
  archive_name        TEXT NOT NULL UNIQUE,
  archive_path        TEXT NOT NULL,
  binary_name         TEXT,
  door_type           TEXT DEFAULT 'XIM',
  name                TEXT NOT NULL,
  version             TEXT,
  author              TEXT,
  release_group       TEXT,
  description         TEXT,
  file_id_diz         TEXT,
  doc_filename        TEXT,
  doc_raw             TEXT,
  suggested_tooltypes TEXT,
  category            TEXT,
  archive_size        INTEGER DEFAULT 0,
  junk_count          INTEGER DEFAULT 0,
  corpus_id           TEXT,
  source              TEXT DEFAULT 'scan',
  indexed_at          INTEGER DEFAULT (strftime('%s','now')),
  md5                 TEXT,
  sha256              TEXT
);
CREATE INDEX IF NOT EXISTS idx_door_catalog_category ON door_catalog(category);
CREATE INDEX IF NOT EXISTS idx_door_catalog_name ON door_catalog(name);

CREATE TABLE IF NOT EXISTS door_catalog_files (
  catalog_id  TEXT NOT NULL,
  path        TEXT NOT NULL,
  size        INTEGER DEFAULT 0,
  is_junk     INTEGER DEFAULT 0,
  junk_reason TEXT,
  PRIMARY KEY (catalog_id, path)
);
CREATE INDEX IF NOT EXISTS idx_dcf_catalog_id ON door_catalog_files(catalog_id);
CREATE INDEX IF NOT EXISTS idx_dcf_is_junk ON door_catalog_files(is_junk);
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/db.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { openDb, applySchema } from '../src/db';
import type { ServerConfig } from '../src/config';

function tmpConfig(): { cfg: ServerConfig; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorsrv-db-'));
  fs.mkdirSync(path.join(dir, 'Archives'));
  const dbPath = path.join(dir, 'doors.db');
  fs.writeFileSync(dbPath, '');
  return {
    dir,
    cfg: { dbPath, archivesRoot: path.join(dir, 'Archives'), port: 3010, adminKeys: [] },
  };
}

describe('db', () => {
  it('creates both catalog tables', () => {
    const { cfg, dir } = tmpConfig();
    const db = openDb(cfg);
    applySchema(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    expect(tables).toEqual(expect.arrayContaining(['door_catalog', 'door_catalog_files']));
  });

  it('does not carry the per-node install columns', () => {
    const { cfg, dir } = tmpConfig();
    const db = openDb(cfg);
    applySchema(db);
    const cols = db.prepare('PRAGMA table_info(door_catalog)').all()
      .map((r) => (r as { name: string }).name);
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    expect(cols).not.toContain('installed');
    expect(cols).not.toContain('installed_as');
    expect(cols).not.toContain('install_dir');
  });

  it('opens read-only when asked and refuses writes', () => {
    const { cfg, dir } = tmpConfig();
    const rw = openDb(cfg);
    applySchema(rw);
    rw.close();
    const ro = openDb(cfg, { readonly: true });
    expect(() =>
      ro.prepare("INSERT INTO door_catalog (id, archive_name, archive_path, name) VALUES ('x','X.LHA','X.LHA','X')").run()
    ).toThrow();
    ro.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is idempotent when the schema is applied twice', () => {
    const { cfg, dir } = tmpConfig();
    const db = openDb(cfg);
    applySchema(db);
    expect(() => applySchema(db)).not.toThrow();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest --config jest.config.ts tests/db.test.ts`
Expected: FAIL - "Cannot find module '../src/db'"

- [ ] **Step 4: Write `src/db.ts`**

```typescript
/**
 * The single place that opens the catalog database.
 *
 * The BBS computed its DB path in two modules (door-catalog.service.ts and
 * door-repo-manifest.ts) from the same env vars, which meant two chances to
 * disagree. Here, a caller passes the ServerConfig it was given.
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { ServerConfig } from './config';

export function openDb(cfg: ServerConfig, opts?: { readonly?: boolean }): Database.Database {
  return new Database(cfg.dbPath, { readonly: opts?.readonly ?? false });
}

export function applySchema(db: Database.Database): void {
  const schemaPath = path.join(__dirname, 'schema.sql');
  db.exec(fs.readFileSync(schemaPath, 'utf-8'));
}
```

- [ ] **Step 5: Make sure `schema.sql` ships next to the compiled JS**

`package.json` already carries this from Task 1 (tsconfig's `rootDir: "."` plus the contract/ and scripts/ roots make tsc emit under `dist/src/`, so the entry point is `dist/src/index.js`). Confirm the script reads:

```json
"build": "tsc -p tsconfig.json && cp src/schema.sql dist/src/schema.sql"
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx jest --config jest.config.ts tests/db.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 7: Verify the build copies the schema**

Run: `npm run build && ls dist/src/schema.sql`
Expected: `dist/src/schema.sql` listed

- [ ] **Step 8: Commit**

```bash
git add src/db.ts src/schema.sql tests/db.test.ts package.json
git commit -m "feat: catalog database module and schema without per-node columns"
```

---

### Task 3: Catalog read service

**Files:**
- Create: `src/catalog.ts`
- Test: `tests/catalog.test.ts`
- Reference (read, do not modify): `amiexpress-web/web/backend/src/doors/door-catalog.service.ts:103-157`, `:472-481`

**Interfaces:**
- Consumes: `openDb` (Task 2), `ServerConfig` (Task 1).
- Produces:
  - `interface CatalogEntry` - the `door_catalog` row shape MINUS `installed`/`installed_as`/`install_dir`
  - `interface ArchiveFile { path: string; size: number; is_junk: number; junk_reason: string | null }`
  - `resolveArchivePath(cfg: ServerConfig, archivePath: string): string`
  - `getCatalogEntryByArchive(cfg: ServerConfig, archiveName: string): CatalogEntry | null`
  - `getArchiveFiles(cfg: ServerConfig, catalogId: string): ArchiveFile[]`
  - `getCatalogRevision(cfg: ServerConfig): string`
  - `getDoorCount(cfg: ServerConfig): number`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/catalog.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { openDb, applySchema } from '../src/db';
import {
  resolveArchivePath, getCatalogEntryByArchive, getArchiveFiles,
  getCatalogRevision, getDoorCount,
} from '../src/catalog';
import type { ServerConfig } from '../src/config';

let dir: string;
let cfg: ServerConfig;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorsrv-cat-'));
  fs.mkdirSync(path.join(dir, 'Archives'));
  fs.mkdirSync(path.join(dir, 'Archives', 'FAME'));
  fs.writeFileSync(path.join(dir, 'Archives', 'FAME', 'ACC-V103.LHA'), 'x');
  const dbPath = path.join(dir, 'doors.db');
  fs.writeFileSync(dbPath, '');
  cfg = { dbPath, archivesRoot: path.join(dir, 'Archives'), port: 3010, adminKeys: [] };
  const db = openDb(cfg);
  applySchema(db);
  db.prepare(
    `INSERT INTO door_catalog (id, archive_name, archive_path, name, door_type, indexed_at)
     VALUES ('id1', 'ACC-V103.LHA', 'FAME/ACC-V103.LHA', 'Account Editor', 'XIM', 1700000000)`
  ).run();
  db.prepare(
    `INSERT INTO door_catalog_files (catalog_id, path, size, is_junk, junk_reason)
     VALUES ('id1', 'Account/AccEd.Rexx', 25552, 0, NULL), ('id1', 'TC.displayme', 1346, 1, 'ad')`
  ).run();
  db.close();
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('catalog reads', () => {
  it('resolves a relative archive_path against the archives root', () => {
    expect(resolveArchivePath(cfg, 'FAME/ACC-V103.LHA'))
      .toBe(path.join(dir, 'Archives', 'FAME', 'ACC-V103.LHA'));
  });

  it('passes an absolute archive_path through unchanged', () => {
    expect(resolveArchivePath(cfg, '/somewhere/else/X.LHA')).toBe('/somewhere/else/X.LHA');
  });

  it('finds an entry by archive name', () => {
    const entry = getCatalogEntryByArchive(cfg, 'ACC-V103.LHA');
    expect(entry?.id).toBe('id1');
    expect(entry?.door_type).toBe('XIM');
  });

  it('returns null for an unknown archive name', () => {
    expect(getCatalogEntryByArchive(cfg, 'NOPE.LHA')).toBeNull();
  });

  it('finds an entry whose name differs only in case', () => {
    expect(getCatalogEntryByArchive(cfg, 'acc-v103.lha')?.id).toBe('id1');
  });

  it('returns the archive files in path order with junk flags', () => {
    const files = getArchiveFiles(cfg, 'id1');
    expect(files.map((f) => f.path)).toEqual(['Account/AccEd.Rexx', 'TC.displayme']);
    expect(files[1].is_junk).toBe(1);
  });

  it('builds the revision from count and newest indexed_at', () => {
    expect(getCatalogRevision(cfg)).toBe('c1-t1700000000');
  });

  it('counts doors without touching checksums', () => {
    expect(getDoorCount(cfg)).toBe(1);
  });

  it('reports revision "unknown" when the catalog cannot be read', () => {
    const broken: ServerConfig = { ...cfg, dbPath: path.join(dir, 'missing.db') };
    fs.writeFileSync(broken.dbPath, '');
    expect(getCatalogRevision(broken)).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.config.ts tests/catalog.test.ts`
Expected: FAIL - "Cannot find module '../src/catalog'"

- [ ] **Step 3: Write `src/catalog.ts`**

Port the read half of the BBS's `door-catalog.service.ts`. The SQL is unchanged; the differences are: the config is passed in, `installed*` columns are gone, and `resolveArchivePath` has no fallback chain.

```typescript
/**
 * Read access to the door catalog.
 *
 * Ported from amiexpress-web/web/backend/src/doors/door-catalog.service.ts.
 * The SQL is deliberately identical - this service answers the same
 * questions the BBS-hosted API answered, and the parity harness asserts the
 * bytes match.
 *
 * archive_path is stored RELATIVE to the archives root (e.g.
 * "FAME/5D!STC01.LHA") so the same database works on a dev machine and on
 * the server. Older rows may carry an absolute path; both forms resolve.
 */
import * as path from 'path';
import { openDb } from './db';
import type { ServerConfig } from './config';

export interface CatalogEntry {
  id: string;
  archive_name: string;
  archive_path: string;
  binary_name: string | null;
  door_type: string;
  name: string;
  version: string | null;
  author: string | null;
  release_group: string | null;
  description: string | null;
  file_id_diz: string | null;
  doc_filename: string | null;
  doc_raw: string | null;
  suggested_tooltypes: string | null;
  category: string | null;
  archive_size: number;
  junk_count: number;
  corpus_id: string | null;
  source: string | null;
  md5: string | null;
  sha256: string | null;
}

export interface ArchiveFile {
  path: string;
  size: number;
  is_junk: number;
  junk_reason: string | null;
}

export function resolveArchivePath(cfg: ServerConfig, archivePath: string): string {
  if (path.isAbsolute(archivePath)) return archivePath;
  return path.join(cfg.archivesRoot, archivePath);
}

export function getCatalogEntryByArchive(cfg: ServerConfig, archiveName: string): CatalogEntry | null {
  const db = openDb(cfg, { readonly: true });
  try {
    // COLLATE NOCASE matches the BBS original (door-catalog.service.ts:150):
    // archive-name lookup is case-insensitive, and clients rely on it.
    const row = db
      .prepare('SELECT * FROM door_catalog WHERE archive_name = ? COLLATE NOCASE')
      .get(archiveName) as CatalogEntry | undefined;
    return row ?? null;
  } finally {
    db.close();
  }
}

export function getArchiveFiles(cfg: ServerConfig, catalogId: string): ArchiveFile[] {
  const db = openDb(cfg, { readonly: true });
  try {
    return db
      .prepare('SELECT path, size, is_junk, junk_reason FROM door_catalog_files WHERE catalog_id = ? ORDER BY path')
      .all(catalogId) as ArchiveFile[];
  } finally {
    db.close();
  }
}

/**
 * Revision string: a fingerprint of the CATALOG, not of the deployment.
 * COUNT + newest indexed_at changes whenever any row is added, removed or
 * re-indexed, and needs no file that only exists inside a container. A
 * catalog we cannot read has no revision we can honestly assert.
 */
export function getCatalogRevision(cfg: ServerConfig): string {
  try {
    const db = openDb(cfg, { readonly: true });
    try {
      const row = db
        .prepare('SELECT COUNT(*) AS n, COALESCE(MAX(indexed_at), 0) AS t FROM door_catalog')
        .get() as { n: number; t: number };
      return `c${row.n}-t${row.t}`;
    } finally {
      db.close();
    }
  } catch {
    return 'unknown';
  }
}

export function getDoorCount(cfg: ServerConfig): number {
  const db = openDb(cfg, { readonly: true });
  try {
    return (db.prepare('SELECT COUNT(*) AS n FROM door_catalog').get() as { n: number }).n;
  } finally {
    db.close();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config jest.config.ts tests/catalog.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/catalog.ts tests/catalog.test.ts
git commit -m "feat: catalog read service ported from the BBS"
```

---

### Task 4: Archive checksums

**Files:**
- Create: `src/checksums.ts`
- Test: `tests/checksums.test.ts`
- Reference: `amiexpress-web/web/backend/src/doors/door-repo-checksums.ts` (21 lines, port as-is)

**Interfaces:**
- Consumes: nothing.
- Produces: `getArchiveChecksums(absPath: string): { md5: string; sha256: string }`, `_clearChecksumCacheForTests(): void`. Cache key is `${absPath}:${mtimeMs}:${size}`; a missing file throws (loud by design - the route catches it and 404s).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/checksums.test.ts
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getArchiveChecksums, _clearChecksumCacheForTests } from '../src/checksums';

describe('getArchiveChecksums', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    _clearChecksumCacheForTests();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorsrv-sum-'));
    file = path.join(dir, 'A.LHA');
    fs.writeFileSync(file, Buffer.from([0x00, 0xa1, 0xff, 0x41]));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('hashes the exact bytes on disk', () => {
    const buf = fs.readFileSync(file);
    expect(getArchiveChecksums(file)).toEqual({
      md5: crypto.createHash('md5').update(buf).digest('hex'),
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    });
  });

  it('recomputes after the file changes', () => {
    const first = getArchiveChecksums(file).md5;
    fs.writeFileSync(file, Buffer.from([0x01, 0x02]));
    expect(getArchiveChecksums(file).md5).not.toBe(first);
  });

  // The test above changes the file's SIZE, which invalidates the cache key
  // on its own - it would pass even if mtimeMs were dropped from the key.
  // A re-indexed archive can be the same size with different bytes, and
  // these digests are what clients verify downloads against, so pin the
  // mtime component separately. The mtime is bumped explicitly because two
  // writes in the same millisecond can report an identical mtime.
  it('recomputes when the bytes change but the size does not', () => {
    const first = getArchiveChecksums(file).md5;
    fs.writeFileSync(file, Buffer.from([0xff, 0xfe, 0xfd, 0xfc]));
    const later = new Date(Date.now() + 2000);
    fs.utimesSync(file, later, later);
    expect(getArchiveChecksums(file).md5).not.toBe(first);
  });

  it('throws for a missing file rather than returning a fake digest', () => {
    expect(() => getArchiveChecksums(path.join(dir, 'gone.LHA'))).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.config.ts tests/checksums.test.ts`
Expected: FAIL - "Cannot find module '../src/checksums'"

- [ ] **Step 3: Copy the module across**

```bash
cp ~/Code/amiexpress-web/web/backend/src/doors/door-repo-checksums.ts \
   ~/Code/amiexpress-doorserver/src/checksums.ts
```

No edits are needed - the module has no BBS-specific imports. Add a one-line header comment noting it was ported from `door-repo-checksums.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config jest.config.ts tests/checksums.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/checksums.ts tests/checksums.test.ts
git commit -m "feat: archive checksum cache ported from the BBS"
```

---

### Task 5: Manifest, list.txt and the published contract

**Files:**
- Create: `src/manifest.ts`, `contract/manifest-types.ts`, `scripts/gen-contract-types.ts`
- Test: `tests/manifest.test.ts`, `tests/contract-staleness.test.ts`
- Reference: `amiexpress-web/web/backend/src/doors/door-repo-manifest.ts` (479 lines - port wholesale), `amiexpress-web/Doors/door-manager/repo-types.generated.ts` (the shape clients already compile against)

**Interfaces:**
- Consumes: `getCatalogRevision`, `resolveArchivePath` (Task 3), `getArchiveChecksums` (Task 4), `openDb` (Task 2).
- Produces:
  - `interface ManifestDoor` and `interface DoorRepoManifest` (exported from `contract/manifest-types.ts`, re-exported by `src/manifest.ts`)
  - `buildManifest(cfg: ServerConfig, opts?: { type?: string; q?: string }): DoorRepoManifest`
  - `renderListTxt(m: DoorRepoManifest): Buffer`
  - `renderListTxtCached(cfg: ServerConfig, opts?: { type?: string; q?: string }): Buffer`
  - `LAZY_CHECKSUM_FALLBACK_LIMIT: number`
  - `CONTRACT_VERSION: string` (in `contract/manifest-types.ts`, value `'1'` - the manifest's `formatVersion`)

- [ ] **Step 1: Port the module**

```bash
cp ~/Code/amiexpress-web/web/backend/src/doors/door-repo-manifest.ts \
   ~/Code/amiexpress-doorserver/src/manifest.ts
```

Then apply exactly these edits and no others:
1. Imports: `./door-repo-checksums` becomes `./checksums`; `./door-catalog.service` becomes `./catalog`; delete the `../server/repo-revision` import and the `export { getRepoRevision }` re-export (the git SHA has no meaning here).
2. Delete the module-level `DB_PATH` and local `openDb()`; import `openDb` from `./db` instead.
3. Every exported function takes `cfg: ServerConfig` as its FIRST parameter and passes it to `openDb` / `resolveArchivePath` / `getCatalogRevision`.
4. `getCatalogRevision` and `getDoorCount` are deleted here - they now live in `src/catalog.ts` (Task 3); import them.
5. Move `ManifestDoor` / `DoorRepoManifest` into `contract/manifest-types.ts` and import them back, re-exporting both so existing call sites keep compiling.
6. The SQL, the `JUNK_JOIN`, `hasFilesTable`, `LAZY_CHECKSUM_FALLBACK_LIMIT`, `oneLine`, `esc`, `toLatin1Safe`, the `DOORREPO|1|<revision>|<count>` header and every field order in `renderListTxt` stay byte-identical - with ONE exception, below.
7. **The `?q=` filter loses its `installed_as` term.** The source reads:

   ```
   '(archive_name LIKE ? OR name LIKE ? OR author LIKE ? OR release_group LIKE ? OR description LIKE ? OR installed_as LIKE ?)'
   ```

   `installed_as` is one of the three per-node columns this server's schema
   drops, so a verbatim port throws at prepare time and every `/manifest?q=`
   and `/list.txt?q=` request 500s. Drop that term and its `params.push`
   entry - five `LIKE ?` placeholders and five pushed params, not six. Keep
   the `ORDER BY archive_name COLLATE NOCASE ASC` exactly as it is.

- [ ] **Step 2: Write `contract/manifest-types.ts`**

```typescript
/**
 * The door-repo wire contract: the manifest shape every client compiles
 * against. Clients vendor a generated mirror of this file (see
 * scripts/gen-contract-types.ts); the version below tells a client whether
 * its mirror is old enough to matter.
 */
export const CONTRACT_VERSION = '1';

export interface ManifestDoor {
  archiveName: string;
  doorType: string;
  name: string | null;
  author: string | null;
  releaseGroup: string | null;
  category: string | null;
  description: string | null;
  fileIdDiz: string | null;
  archiveSize: number | null;
  md5: string | null;
  sha256: string | null;
  junkCount: number;
  hasDoc: boolean;
}

export interface DoorRepoManifest {
  formatVersion: 1;
  revision: string;
  generatedAt: string;
  doors: ManifestDoor[];
}
```

- [ ] **Step 3: Write `scripts/gen-contract-types.ts`**

```typescript
/**
 * Emits the client-vendorable mirror of contract/manifest-types.ts.
 *
 * A client (DOORMAN today, any TypeScript consumer later) commits the
 * output and a staleness test compares it to this file, so a contract
 * change cannot ship without the mirror moving with it.
 */
import * as fs from 'fs';
import * as path from 'path';

const SOURCE = path.join(__dirname, '..', 'contract', 'manifest-types.ts');

export function renderMirror(sourceText: string): string {
  return [
    '/**',
    ' * GENERATED FILE -- DO NOT EDIT BY HAND.',
    ' *',
    ' * Mirror of amiexpress-doorserver contract/manifest-types.ts.',
    ' * Regenerate with: npx tsx scripts/gen-contract-types.ts',
    ' */',
    '',
    sourceText.replace(/^\/\*\*[\s\S]*?\*\/\n/, ''),
  ].join('\n');
}

if (require.main === module) {
  const out = process.argv[2];
  if (!out) {
    console.error('[ERROR] usage: gen-contract-types.ts <output-path>');
    process.exit(1);
  }
  fs.writeFileSync(out, renderMirror(fs.readFileSync(SOURCE, 'utf-8')), 'utf-8');
  console.log(`[OK] wrote ${out}`);
}
```

- [ ] **Step 4: Write the failing manifest test**

```typescript
// tests/manifest.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { openDb, applySchema } from '../src/db';
import { buildManifest, renderListTxt, renderListTxtCached } from '../src/manifest';
import type { ServerConfig } from '../src/config';

let dir: string;
let cfg: ServerConfig;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorsrv-man-'));
  fs.mkdirSync(path.join(dir, 'Archives'));
  fs.writeFileSync(path.join(dir, 'Archives', 'ACC-V103.LHA'), 'x');
  const dbPath = path.join(dir, 'doors.db');
  fs.writeFileSync(dbPath, '');
  cfg = { dbPath, archivesRoot: path.join(dir, 'Archives'), port: 3010, adminKeys: [] };
  const db = openDb(cfg);
  applySchema(db);
  db.prepare(
    `INSERT INTO door_catalog
       (id, archive_name, archive_path, name, door_type, description, doc_raw,
        archive_size, md5, sha256, indexed_at)
     VALUES ('id1', 'ACC-V103.LHA', 'ACC-V103.LHA', 'Account Editor', 'XIM',
             'Line one\nLine two', 'the doc', 4711, 'aa', 'bb', 1700000000)`
  ).run();
  db.prepare(
    `INSERT INTO door_catalog_files (catalog_id, path, size, is_junk, junk_reason)
     VALUES ('id1', 'TC.displayme', 1346, 1, 'ad'), ('id1', 'Account/AccEd.Rexx', 25552, 0, NULL)`
  ).run();
  db.close();
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('buildManifest', () => {
  it('publishes the live junk count, not the denormalised column', () => {
    const m = buildManifest(cfg);
    expect(m.doors[0].junkCount).toBe(1);
  });

  it('reports hasDoc from doc_raw', () => {
    expect(buildManifest(cfg).doors[0].hasDoc).toBe(true);
  });

  it('carries the catalog revision, not a git sha', () => {
    expect(buildManifest(cfg).revision).toBe('c1-t1700000000');
  });

  it('filters by door type', () => {
    expect(buildManifest(cfg, { type: 'AIM' }).doors).toHaveLength(0);
    expect(buildManifest(cfg, { type: 'XIM' }).doors).toHaveLength(1);
  });

  // The source's q filter also searched installed_as, a per-node column this
  // server does not have. Without dropping that term the query throws at
  // prepare time, so this test is what proves the port dropped it.
  it('searches by free text without touching per-node columns', () => {
    expect(buildManifest(cfg, { q: 'Account' }).doors).toHaveLength(1);
    expect(buildManifest(cfg, { q: 'nothing-matches-this' }).doors).toHaveLength(0);
  });
});

describe('renderListTxt', () => {
  it('emits a DOORREPO header whose count matches the data lines', () => {
    const body = renderListTxt(buildManifest(cfg)).toString('latin1');
    const lines = body.split('\r\n').filter((l) => l.length > 0);
    expect(lines[0]).toBe('DOORREPO|1|c1-t1700000000|1');
    expect(lines).toHaveLength(2);
  });

  it('collapses embedded newlines so one door is one line', () => {
    const body = renderListTxt(buildManifest(cfg)).toString('latin1');
    expect(body).toContain('Line one Line two');
  });

  it('terminates lines with CRLF', () => {
    expect(renderListTxt(buildManifest(cfg)).toString('latin1')).toContain('\r\n');
  });
});

describe('renderListTxtCached', () => {
  it('returns identical bytes on a repeat call', () => {
    const a = renderListTxtCached(cfg);
    const b = renderListTxtCached(cfg);
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it('re-renders after the catalog revision changes', () => {
    const before = renderListTxtCached(cfg).toString('latin1');
    const db = openDb(cfg);
    db.prepare(
      `INSERT INTO door_catalog (id, archive_name, archive_path, name, door_type, indexed_at)
       VALUES ('id2', 'B.LHA', 'B.LHA', 'Bee', 'XIM', 1700000001)`
    ).run();
    db.close();
    expect(renderListTxtCached(cfg).toString('latin1')).not.toBe(before);
  });
});
```

- [ ] **Step 5: Write the failing contract staleness test**

```typescript
// tests/contract-staleness.test.ts
import * as fs from 'fs';
import * as path from 'path';
import { renderMirror } from '../scripts/gen-contract-types';
import { CONTRACT_VERSION } from '../contract/manifest-types';

describe('contract', () => {
  it('declares a version', () => {
    expect(CONTRACT_VERSION).toBe('1');
  });

  it('renders a mirror that compiles to the same declarations', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'contract', 'manifest-types.ts'), 'utf-8');
    const mirror = renderMirror(source);
    expect(mirror).toContain('export interface ManifestDoor');
    expect(mirror).toContain('export interface DoorRepoManifest');
    expect(mirror).toContain('GENERATED FILE');
    expect(mirror).not.toMatch(/^import /m);
  });
});
```

- [ ] **Step 6: Run both tests to verify they fail**

Run: `npx jest --config jest.config.ts tests/manifest.test.ts tests/contract-staleness.test.ts`
Expected: FAIL - module not found / edits from Step 1 not yet applied

- [ ] **Step 7: Apply the Step 1 edits until both suites pass**

Run: `npx jest --config jest.config.ts tests/manifest.test.ts tests/contract-staleness.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 8: Type-check**

Run: `npm run typecheck`
Expected: clean

- [ ] **Step 9: Commit**

```bash
git add src/manifest.ts contract/manifest-types.ts scripts/gen-contract-types.ts tests/manifest.test.ts tests/contract-staleness.test.ts
git commit -m "feat: manifest builder, list.txt renderer and published contract types"
```

---

### Task 6: HTTP routes and server bootstrap

**Files:**
- Create: `src/routes.ts`, `src/app.ts`, `src/index.ts`
- Test: `tests/routes.test.ts`
- Reference: `amiexpress-web/web/backend/src/server/door-repo.routes.ts` (411 lines - port wholesale)

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: `createApp(cfg: ServerConfig): express.Express`, `createRouter(cfg: ServerConfig): express.Router`, plus the ported helpers `candidateArchiveNames(encoded: string): string[]`, `streamArchive(fd: number, res: Response, archiveName: string, onDone?: (err: Error | null) => void): void`, `handleArchiveStreamError(res: Response, archiveName: string): void`.

- [ ] **Step 1: Port the router**

```bash
cp ~/Code/amiexpress-web/web/backend/src/server/door-repo.routes.ts \
   ~/Code/amiexpress-doorserver/src/routes.ts
```

Apply exactly these edits:
1. Delete `isDoorRepoOwner()` and its comment block. Mount gating is gone: this whole process IS the repo.
2. Imports: `../doors/door-repo-manifest` becomes `./manifest`; `../doors/door-repo-checksums` becomes `./checksums`; `../doors/door-catalog.service` becomes `./catalog`.
3. Replace the module-level `export const doorRepoRouter = express.Router()` with `export function createRouter(cfg: ServerConfig): express.Router`, declaring the router inside and passing `cfg` to every catalog/manifest call.
4. Keep, unchanged: `parseManifestQuery`, `sendNotFound` (including its `NOT FOUND: <name>\r\n` body and `text/plain` type), `handleArchiveStreamError`, `streamArchive` (`stream.pipeline`, no `autoClose: false`, no manual close), the single-`openSync` archive handler, `candidateArchiveNames` + `decodePercentLatin1`, the `/^\/(diz|archive|files|doc)\/(.+)$/` dispatcher, every `X-Door-Repo-Revision` set, the `req.fresh` check BEFORE `buildManifest()`, the Latin-1 `Buffer.from(..., 'latin1')` sends and the `X-Doc-Filename` sanitiser.

- [ ] **Step 2: Write `src/app.ts` and `src/index.ts`**

```typescript
// src/app.ts
import express from 'express';
import { createRouter } from './routes';
import type { ServerConfig } from './config';

export function createApp(cfg: ServerConfig): express.Express {
  const app = express();
  // The API is public and cacheable by anyone; CORP/CORS policy for
  // browser consumers is the BBS's business at its own host, not ours.
  app.disable('x-powered-by');
  app.use('/api/door-repo', createRouter(cfg));
  return app;
}
```

```typescript
// src/index.ts
import { createApp } from './app';
import { loadConfig, ConfigError } from './config';
import { getDoorCount, getCatalogRevision } from './catalog';

function main(): void {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
  const app = createApp(cfg);
  app.listen(cfg.port, () => {
    console.log(`[OK] door server listening on ${cfg.port}`);
    console.log(`[INFO] catalog ${getDoorCount(cfg)} doors, revision ${getCatalogRevision(cfg)}`);
  });
}

main();
```

- [ ] **Step 3: Write the failing route test**

```typescript
// tests/routes.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { openDb, applySchema } from '../src/db';
import { createApp } from '../src/app';
import type { ServerConfig } from '../src/config';

let dir: string;
let cfg: ServerConfig;
let app: ReturnType<typeof createApp>;

const ARCHIVE_BYTES = Buffer.from([0x4c, 0x5a, 0x00, 0xa1, 0xff]);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorsrv-rt-'));
  fs.mkdirSync(path.join(dir, 'Archives'));
  fs.writeFileSync(path.join(dir, 'Archives', 'ACC-V103.LHA'), ARCHIVE_BYTES);
  const dbPath = path.join(dir, 'doors.db');
  fs.writeFileSync(dbPath, '');
  cfg = { dbPath, archivesRoot: path.join(dir, 'Archives'), port: 3010, adminKeys: [] };
  const db = openDb(cfg);
  applySchema(db);
  db.prepare(
    `INSERT INTO door_catalog
       (id, archive_name, archive_path, name, door_type, file_id_diz, doc_raw,
        doc_filename, archive_size, indexed_at)
     VALUES ('id1', 'ACC-V103.LHA', 'ACC-V103.LHA', 'Account Editor', 'XIM',
             'DIZ line', 'doc bytes', 'AccEd.Doc', 5, 1700000000)`
  ).run();
  db.prepare(
    `INSERT INTO door_catalog_files (catalog_id, path, size, is_junk, junk_reason)
     VALUES ('id1', 'Account/AccEd.Rexx', 25552, 0, NULL)`
  ).run();
  db.close();
  app = createApp(cfg);
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('read API', () => {
  it('serves the manifest with the revision as ETag', async () => {
    const res = await request(app).get('/api/door-repo/manifest');
    expect(res.status).toBe(200);
    expect(res.headers.etag).toBe('"c1-t1700000000"');
    expect(res.headers['x-door-repo-revision']).toBe('c1-t1700000000');
    expect(res.body.doors).toHaveLength(1);
  });

  it('answers 304 to a matching If-None-Match', async () => {
    const res = await request(app)
      .get('/api/door-repo/manifest')
      .set('If-None-Match', '"c1-t1700000000"');
    expect(res.status).toBe(304);
  });

  it('serves list.txt as ISO-8859-1 with CRLF', async () => {
    const res = await request(app).get('/api/door-repo/list.txt');
    expect(res.headers['content-type']).toContain('ISO-8859-1');
    expect(res.text).toContain('DOORREPO|1|c1-t1700000000|1');
    expect(res.text).toContain('\r\n');
  });

  it('serves the files listing in the FILES| format', async () => {
    const res = await request(app).get('/api/door-repo/files/ACC-V103.LHA');
    expect(res.text.split('\r\n')[0]).toBe('FILES|1|0');
    expect(res.text).toContain('25552|0|Account/AccEd.Rexx');
  });

  it('serves the diz and 404s when there is none', async () => {
    expect((await request(app).get('/api/door-repo/diz/ACC-V103.LHA')).text).toBe('DIZ line');
    expect((await request(app).get('/api/door-repo/diz/NOPE.LHA')).status).toBe(404);
  });

  it('serves the doc with a sanitised filename header', async () => {
    const res = await request(app).get('/api/door-repo/doc/ACC-V103.LHA');
    expect(res.headers['x-doc-filename']).toBe('AccEd.Doc');
    expect(res.text).toBe('doc bytes');
  });

  it('streams the archive with checksum headers and an exact length', async () => {
    const res = await request(app).get('/api/door-repo/archive/ACC-V103.LHA').buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-length']).toBe(String(ARCHIVE_BYTES.length));
    expect(res.headers['x-archive-md5']).toMatch(/^[0-9a-f]{32}$/);
    expect(res.headers['x-archive-sha256']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('404s an unknown archive with the plain-text body clients parse', async () => {
    const res = await request(app).get('/api/door-repo/archive/NOPE.LHA');
    expect(res.status).toBe(404);
    expect(res.text).toBe('NOT FOUND: NOPE.LHA\r\n');
  });

  it('404s a traversal payload instead of reaching the filesystem', async () => {
    const res = await request(app).get('/api/door-repo/archive/..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(404);
  });

  it('serves health without hashing the corpus', async () => {
    const res = await request(app).get('/api/door-repo/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', revision: 'c1-t1700000000', doors: 1 });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx jest --config jest.config.ts tests/routes.test.ts`
Expected: FAIL - module not found / `createRouter` not exported

- [ ] **Step 5: Finish the Step 1 and 2 edits until the suite passes**

Run: `npx jest --config jest.config.ts tests/routes.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 6: Start the server against the fixture database by hand**

```bash
DOORSERVER_DB=/tmp/doors-smoke.db DOOR_ARCHIVES_ROOT=/tmp/Archives npx tsx src/index.ts
```
Expected: `[ERROR] DOORSERVER_DB points at ... which does not exist` when the paths are absent - the fail-loud path, confirmed by hand once.

- [ ] **Step 7: Commit**

```bash
git add src/routes.ts src/app.ts src/index.ts tests/routes.test.ts
git commit -m "feat: door-repo read API served by the standalone server"
```

---

### Task 7: Parity harness

**Files:**
- Create: `scripts/capture-parity-fixtures.ts`, `tests/parity.test.ts`
- Create: `tests/fixtures/parity/` (captured responses, committed)

**Interfaces:**
- Consumes: `createApp` (Task 6).
- Produces: a committed fixture set and a test that fails if any ported endpoint's status, headers or bytes differ from what the BBS-hosted API produced. This is the gate for Task 8 - data does not move until this is green.

**One field is exempt from byte comparison.** `/manifest` and `/health` are
JSON; the manifest's `generatedAt` is a wall-clock timestamp, so its bytes
differ on every call. The harness compares JSON bodies structurally with
`generatedAt` removed and asserts the field is a valid ISO instant; every
non-JSON endpoint (`list.txt`, `diz`, `doc`, `files`, `archive`) is compared
byte-for-byte, which is where the Latin-1 and CRLF risk actually lives.

**Fixture sample (each chosen because it exercises a different failure mode):**

| Archive | Why |
|---|---|
| `ACC-V103.LHA` | ARexx door, has doc, real junk files |
| `5D!DP002.LHA` | doorpack, many files |
| `-D-CALC.LHA` | the archive at the centre of the download corruption |
| `$CP-BUß1.LZX` | percent-decoding path - the only Latin-1 name in the live catalog (verified). Capture it BOTH ways: UTF-8 percent-encoded (`%C3%9F`, what `encodeURIComponent` produces) and Latin-1 percent-encoded (`%DF`, what an Amiga client sends). The route tries both spellings; a port that lost `candidateArchiveNames` would still pass the UTF-8 capture alone. |
| `NOPE-NOT-REAL.LHA` | 404 body |
| `HEAD /archive/...` and `HEAD /files/...` | both 404 today (non-GET falls through the catch-all router) - captured so the port cannot silently change it |
| `GET /archive/... Range: bytes=0-99` | Range is ignored today; the full 25528 bytes come back with a 200 |

- [ ] **Step 1: Write the capture script**

```typescript
// scripts/capture-parity-fixtures.ts
/**
 * Captures responses from a RUNNING door-repo API (the BBS-hosted one) as
 * committed fixtures, so the standalone server can be asserted byte-equal
 * without a live server in CI.
 *
 * Bodies are stored as base64: several are Latin-1 with control bytes, and
 * a UTF-8 round-trip through a text file would corrupt exactly the bytes
 * this harness exists to protect.
 */
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.argv[2];
const OUT = path.join(__dirname, '..', 'tests', 'fixtures', 'parity');

const HEADERS_OF_INTEREST = [
  'content-type', 'content-length', 'etag', 'x-door-repo-revision',
  'x-archive-md5', 'x-archive-sha256', 'x-doc-filename',
];

interface Capture {
  name: string;
  method: 'GET' | 'HEAD';
  requestPath: string;
  requestHeaders: Record<string, string>;
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
}

async function capture(
  name: string,
  requestPath: string,
  requestHeaders: Record<string, string> = {},
  method: 'GET' | 'HEAD' = 'GET'
): Promise<Capture> {
  const res = await fetch(`${BASE}${requestPath}`, { method, headers: requestHeaders });
  const body = Buffer.from(await res.arrayBuffer());
  const headers: Record<string, string> = {};
  for (const key of HEADERS_OF_INTEREST) {
    const value = res.headers.get(key);
    if (value !== null) headers[key] = value;
  }
  return { name, method, requestPath, requestHeaders, status: res.status, headers, bodyBase64: body.toString('base64') };
}

async function main(): Promise<void> {
  if (!BASE) {
    console.error('[ERROR] usage: capture-parity-fixtures.ts <base-url e.g. http://localhost:3001/api/door-repo>');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const archives = process.argv.slice(3);
  const captures: Capture[] = [];
  captures.push(await capture('manifest', '/manifest'));
  captures.push(await capture('list', '/list.txt'));
  captures.push(await capture('health', '/health'));
  // The filtered forms have their own SQL path - and the q filter is the one
  // place the port deliberately differs from the source (it drops the
  // installed_as term, whose column this server does not have). Capture both
  // so the difference is visible rather than assumed.
  captures.push(await capture('manifest-type-xim', '/manifest?type=XIM'));
  captures.push(await capture('list-type-xim', '/list.txt?type=XIM'));
  captures.push(await capture('manifest-q', '/manifest?q=door'));
  for (const a of archives) {
    const enc = encodeURIComponent(a);
    captures.push(await capture(`files-${a}`, `/files/${enc}`));
    captures.push(await capture(`diz-${a}`, `/diz/${enc}`));
    captures.push(await capture(`doc-${a}`, `/doc/${enc}`));
    captures.push(await capture(`archive-${a}`, `/archive/${enc}`));
  }
  captures.push(await capture('archive-missing', '/archive/NOPE-NOT-REAL.LHA'));
  // HEAD and Range are captured because they are ODD today and the port must
  // not quietly "fix" them. Verified against the live API: the catch-all
  // router bails on any method that is not GET (door-repo.routes.ts:379), so
  // HEAD on a per-archive path falls through to Express's HTML 404 - even
  // for an archive that GET serves happily. And GET ignores Range entirely:
  // a `bytes=0-99` request returns 200 with all 25528 bytes. Both are
  // pre-existing behaviour, tracked separately; parity means preserving
  // them here, not repairing them mid-move.
  if (archives.length > 0) {
    const first = encodeURIComponent(archives[0]);
    captures.push(await capture(`head-archive-${archives[0]}`, `/archive/${first}`, {}, 'HEAD'));
    captures.push(await capture(`head-files-${archives[0]}`, `/files/${first}`, {}, 'HEAD'));
    captures.push(await capture(`range-archive-${archives[0]}`, `/archive/${first}`, { Range: 'bytes=0-99' }));
  }
  // Latin-1 archive name, percent-encoded the way an Amiga client encodes it
  // (%DF, not UTF-8's %C3%9F). Passed raw, NOT through encodeURIComponent.
  captures.push(await capture('files-latin1-raw', '/files/%24CP-BU%DF1.LZX'));
  fs.writeFileSync(path.join(OUT, 'captures.json'), JSON.stringify(captures, null, 1), 'utf-8');
  console.log(`[OK] captured ${captures.length} responses from ${BASE}`);
}

void main();
```

- [ ] **Step 2: Capture against the BBS-hosted API**

With the BBS backend running locally in owner mode:

```bash
cd ~/Code/amiexpress-doorserver
npx tsx scripts/capture-parity-fixtures.ts http://localhost:3001/api/door-repo \
  ACC-V103.LHA '5D!DP002.LHA' -D-CALC.LHA '$CP-BUß1.LZX'
```
Expected: `[OK] captured N responses`, `tests/fixtures/parity/captures.json` written.

- [ ] **Step 3: Write the failing parity test**

```typescript
// tests/parity.test.ts
/**
 * Byte-parity against the BBS-hosted API.
 *
 * The captures were taken from the API this server replaces. Any
 * difference in status, header or body is a regression in the move - the
 * whole safety argument for the split is that location changed and
 * behaviour did not.
 *
 * Skips itself when no capture file is present, so a fresh checkout is not
 * blocked; CI runs with the fixtures committed.
 */
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';

const CAPTURES = path.join(__dirname, 'fixtures', 'parity', 'captures.json');

interface Capture {
  name: string;
  method: 'GET' | 'HEAD';
  requestPath: string;
  requestHeaders: Record<string, string>;
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
}

const describeOrSkip = fs.existsSync(CAPTURES) && process.env.PARITY_DB ? describe : describe.skip;

describeOrSkip('parity with the BBS-hosted API', () => {
  const captures: Capture[] = JSON.parse(fs.readFileSync(CAPTURES, 'utf-8'));
  const cfg = loadConfig({
    DOORSERVER_DB: process.env.PARITY_DB,
    DOOR_ARCHIVES_ROOT: process.env.PARITY_ARCHIVES,
  });
  const app = createApp(cfg);

  for (const c of captures) {
    it(`${c.name} matches`, async () => {
      const agent = request(app);
      const res = await (c.method === 'HEAD'
        ? agent.head(`/api/door-repo${c.requestPath}`)
        : agent.get(`/api/door-repo${c.requestPath}`))
        .set(c.requestHeaders)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (d: Buffer) => chunks.push(d));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(c.status);
      for (const [key, value] of Object.entries(c.headers)) {
        if (key === 'content-type' || key === 'content-length' || key.startsWith('x-') || key === 'etag') {
          expect(`${key}=${res.headers[key]}`).toBe(`${key}=${value}`);
        }
      }

      // The manifest body carries `generatedAt: new Date().toISOString()`
      // (door-repo-manifest.ts:309), so its bytes are never twice the same
      // and a raw base64 comparison could not pass even against the server
      // that produced the capture. Verified against the live API: two calls
      // one second apart differ only in that field. Compare the manifest
      // structurally with the timestamp lifted out, and assert separately
      // that the field is still a real ISO instant. Its length is fixed
      // (24 chars), so Content-Length above stays a valid check.
      // EVERY other endpoint is compared byte-for-byte.
      // A HEAD response has no body by definition; its status and headers are
      // the whole contract.
      if (c.method === 'HEAD') return;

      const isJson = (c.headers['content-type'] ?? '').includes('application/json');
      if (isJson) {
        const expected = JSON.parse(Buffer.from(c.bodyBase64, 'base64').toString('utf-8'));
        const actual = JSON.parse((res.body as Buffer).toString('utf-8'));
        expect(actual.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        delete expected.generatedAt;
        delete actual.generatedAt;
        expect(actual).toEqual(expected);
      } else {
        expect((res.body as Buffer).toString('base64')).toBe(c.bodyBase64);
      }
    });
  }
});
```

- [ ] **Step 4: Run it against a copy of the live catalog**

```bash
cp ~/Code/amiexpress-web/database.sqlite /tmp/parity-source.db
PARITY_DB=/tmp/parity-source.db PARITY_ARCHIVES=~/Code/amiexpress_doors/Archives \
  npx jest --config jest.config.ts tests/parity.test.ts
```
Expected: FAIL on any endpoint whose port drifted. Fix `src/` until every capture matches. The catalog copy still has the `installed*` columns; that is fine - the server never selects them.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add scripts/capture-parity-fixtures.ts tests/parity.test.ts tests/fixtures/parity/captures.json
git commit -m "test: byte-parity harness against the BBS-hosted door-repo API"
```

---

### Task 8: Data migration

**Files:**
- Create: `scripts/migrate-from-bbs.ts`
- Test: `tests/migrate.test.ts`

**Interfaces:**
- Consumes: `openDb`, `applySchema` (Task 2).
- Produces: `migrateFromBbs(opts: { sourceDb: string; targetDb: string }): { entries: number; files: number }` - copies `door_catalog` (dropping `installed`, `installed_as`, `install_dir`) and `door_catalog_files` via `ATTACH`, and returns the row counts it wrote.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/migrate.test.ts
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { migrateFromBbs } from '../scripts/migrate-from-bbs';

let dir: string;
let source: string;
let target: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorsrv-mig-'));
  source = path.join(dir, 'bbs.db');
  target = path.join(dir, 'doors.db');
  const db = new Database(source);
  db.exec(`
    CREATE TABLE door_catalog (
      id TEXT PRIMARY KEY, archive_name TEXT NOT NULL UNIQUE, archive_path TEXT NOT NULL,
      binary_name TEXT, door_type TEXT, name TEXT NOT NULL, version TEXT, author TEXT,
      release_group TEXT, description TEXT, file_id_diz TEXT, doc_filename TEXT, doc_raw TEXT,
      suggested_tooltypes TEXT, category TEXT, archive_size INTEGER, junk_count INTEGER,
      installed INTEGER DEFAULT 0, installed_as TEXT, install_dir TEXT,
      corpus_id TEXT, source TEXT, indexed_at INTEGER, md5 TEXT, sha256 TEXT);
    CREATE TABLE door_catalog_files (
      catalog_id TEXT NOT NULL, path TEXT NOT NULL, size INTEGER, is_junk INTEGER,
      junk_reason TEXT, PRIMARY KEY (catalog_id, path));
  `);
  db.prepare(
    `INSERT INTO door_catalog (id, archive_name, archive_path, name, door_type, doc_raw,
      installed, installed_as, install_dir, indexed_at)
     VALUES ('id1','ACC-V103.LHA','FAME/ACC-V103.LHA','Account Editor','XIM',
             char(12) || 'doc with a form feed', 1, 'ACC', 'Doors/ACC', 1700000000)`
  ).run();
  db.prepare(
    `INSERT INTO door_catalog_files (catalog_id, path, size, is_junk, junk_reason)
     VALUES ('id1','Account/AccEd.Rexx',25552,0,NULL)`
  ).run();
  db.close();
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('migrateFromBbs', () => {
  it('copies every catalog row and file row', () => {
    const counts = migrateFromBbs({ sourceDb: source, targetDb: target });
    expect(counts).toEqual({ entries: 1, files: 1 });
  });

  it('leaves the per-node install columns behind', () => {
    migrateFromBbs({ sourceDb: source, targetDb: target });
    const db = new Database(target, { readonly: true });
    const cols = db.prepare('PRAGMA table_info(door_catalog)').all()
      .map((r) => (r as { name: string }).name);
    db.close();
    expect(cols).not.toContain('installed');
  });

  it('preserves control bytes in doc_raw', () => {
    migrateFromBbs({ sourceDb: source, targetDb: target });
    const db = new Database(target, { readonly: true });
    const row = db.prepare('SELECT doc_raw FROM door_catalog WHERE id = ?').get('id1') as { doc_raw: string };
    db.close();
    expect(row.doc_raw.charCodeAt(0)).toBe(12);
  });

  it('is idempotent - re-running does not duplicate rows', () => {
    migrateFromBbs({ sourceDb: source, targetDb: target });
    const second = migrateFromBbs({ sourceDb: source, targetDb: target });
    expect(second.entries).toBe(1);
    const db = new Database(target, { readonly: true });
    const n = (db.prepare('SELECT COUNT(*) AS n FROM door_catalog').get() as { n: number }).n;
    db.close();
    expect(n).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.config.ts tests/migrate.test.ts`
Expected: FAIL - "Cannot find module '../scripts/migrate-from-bbs'"

- [ ] **Step 3: Write `scripts/migrate-from-bbs.ts`**

```typescript
/**
 * Copies the door catalog out of the BBS database into the door server's.
 *
 * ATTACH + INSERT SELECT, never a SQL text dump: doc_raw carries form
 * feeds, ANSI and other control bytes, and dumping it to text and back has
 * mangled it before. The per-node columns (installed, installed_as,
 * install_dir) are deliberately not copied - they describe one node and
 * move to that node's own door_installs table.
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const COLUMNS = [
  'id', 'archive_name', 'archive_path', 'binary_name', 'door_type', 'name', 'version',
  'author', 'release_group', 'description', 'file_id_diz', 'doc_filename', 'doc_raw',
  'suggested_tooltypes', 'category', 'archive_size', 'junk_count', 'corpus_id', 'source',
  'indexed_at', 'md5', 'sha256',
];

export interface MigrationCounts {
  entries: number;
  files: number;
}

export function migrateFromBbs(opts: { sourceDb: string; targetDb: string }): MigrationCounts {
  if (!fs.existsSync(opts.sourceDb)) {
    throw new Error(`source database ${opts.sourceDb} does not exist`);
  }
  const db = new Database(opts.targetDb);
  try {
    db.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'schema.sql'), 'utf-8'));
    db.prepare('ATTACH DATABASE ? AS src').run(opts.sourceDb);
    try {
      const cols = COLUMNS.join(', ');
      db.exec(`INSERT OR REPLACE INTO main.door_catalog (${cols}) SELECT ${cols} FROM src.door_catalog`);
      db.exec(
        `INSERT OR REPLACE INTO main.door_catalog_files (catalog_id, path, size, is_junk, junk_reason)
         SELECT catalog_id, path, size, is_junk, junk_reason FROM src.door_catalog_files`
      );
      const entries = (db.prepare('SELECT COUNT(*) AS n FROM main.door_catalog').get() as { n: number }).n;
      const files = (db.prepare('SELECT COUNT(*) AS n FROM main.door_catalog_files').get() as { n: number }).n;
      return { entries, files };
    } finally {
      db.exec('DETACH DATABASE src');
    }
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const [sourceDb, targetDb] = process.argv.slice(2);
  if (!sourceDb || !targetDb) {
    console.error('[ERROR] usage: migrate-from-bbs.ts <bbs-database.sqlite> <doors.db>');
    process.exit(1);
  }
  const counts = migrateFromBbs({ sourceDb, targetDb });
  console.log(`[OK] migrated ${counts.entries} catalog entries and ${counts.files} file rows`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config jest.config.ts tests/migrate.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Migrate a real copy and compare counts**

```bash
cp ~/Code/amiexpress-web/database.sqlite /tmp/bbs-copy.db
npx tsx scripts/migrate-from-bbs.ts /tmp/bbs-copy.db /tmp/doors.db
sqlite3 /tmp/bbs-copy.db 'SELECT COUNT(*) FROM door_catalog; SELECT COUNT(*) FROM door_catalog_files;'
sqlite3 /tmp/doors.db     'SELECT COUNT(*) FROM door_catalog; SELECT COUNT(*) FROM door_catalog_files;'
```
Expected: both report 3301 and 58406 (or whatever the source holds - the two must match).

- [ ] **Step 6: Re-run the parity harness against the MIGRATED database**

```bash
PARITY_DB=/tmp/doors.db PARITY_ARCHIVES=~/Code/amiexpress_doors/Archives \
  npx jest --config jest.config.ts tests/parity.test.ts
```
Expected: PASS - the same bytes, now out of the server's own schema. This is the real proof the migration is lossless.

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate-from-bbs.ts tests/migrate.test.ts
git commit -m "feat: lossless catalog migration out of the BBS database"
```

---

### Task 9: Container, deployment and documentation

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.github/workflows/deploy-doorserver.yml`, `.github/workflows/tests.yml`
- Create: `docs/DOOR-REPO-API.md` (moved from amiexpress-web), `docs/superpowers/specs/2026-08-23-door-server-split-design.md` (copied)

**Interfaces:**
- Consumes: everything above.
- Produces: a deployed container answering `GET /api/door-repo/health` on the Hetzner host, with `doors.db` and `Archives/` on the `doorserver-data` volume.

- [ ] **Step 1: Write the `Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY contract ./contract
COPY scripts ./scripts
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
ARG GIT_SHA=unknown
RUN echo "$GIT_SHA" > /app/.git-sha
EXPOSE 3010
CMD ["node", "dist/src/index.js"]
```

- [ ] **Step 2: Write `docker-compose.yml`**

```yaml
services:
  doorserver:
    build:
      context: .
      args:
        GIT_SHA: ${GIT_SHA:-unknown}
    restart: unless-stopped
    ports:
      - "3010:3010"
    volumes:
      - doorserver-data:/data
    environment:
      DOORSERVER_DB: /data/doors.db
      DOOR_ARCHIVES_ROOT: /data/Archives
      PORT: "3010"
      DOORSERVER_ADMIN_KEYS: ${DOORSERVER_ADMIN_KEYS:-}
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3010/api/door-repo/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  doorserver-data:
    name: doorserver-data
```

- [ ] **Step 3: Write `.github/workflows/tests.yml`**

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test:ci
```

- [ ] **Step 4: Write `.github/workflows/deploy-doorserver.yml`**

Mirrors amiexpress-web's `deploy-hetzner.yml`: serialized concurrency, hard reset to origin/main, prune before build.

```yaml
name: Deploy door server

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-doorserver
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Hetzner VPS
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: root
          key: ${{ secrets.HETZNER_SSH_KEY }}
          command_timeout: 30m
          script: |
            set -euo pipefail
            cd /app/doorserver
            echo "== git fetch + hard reset =="
            git fetch --prune origin main
            git reset --hard origin/main
            echo "== prune builder cache (host runs near 80% disk) =="
            docker builder prune -f
            echo "== build + up =="
            GIT_SHA=$(git rev-parse HEAD) docker compose up -d --build
            echo "== health =="
            sleep 10
            curl -fsS http://localhost:3010/api/door-repo/health
```

- [ ] **Step 5: Move the API documentation**

```bash
mkdir -p docs/superpowers/specs
cp ~/Code/amiexpress-web/docs/DOOR-REPO-API.md docs/DOOR-REPO-API.md
cp ~/Code/amiexpress-web/docs/superpowers/specs/2026-08-23-door-server-split-design.md docs/superpowers/specs/
```

Add a line at the top of `docs/DOOR-REPO-API.md`: the API is served by this repo; amiexpress-web proxies `/api/door-repo/*` for compatibility. Leave the amiexpress-web copy in place until phase 2 replaces it with a pointer - deleting it now would strand the BBS's own docs.

- [ ] **Step 6: Provision the host**

```bash
ssh root@203.0.113.10 'set -euo pipefail
  df -h / | tail -1
  docker builder prune -f
  mkdir -p /app
  git clone git@github.com:spotUP/amiexpress-doorserver.git /app/doorserver'
```
Expected: disk reported before any build; clone succeeds.

- [ ] **Step 7: Seed the volume with the catalog and archives**

The archives live INSIDE the BBS's own docker volume, not in the checkout:
`amiexpress-bbs-data` mounts at
`/var/lib/docker/volumes/amiexpress-bbs-data/_data`, and the corpus is
`.../\_data/bbs/Archives` (175 MB, verified on the host).

**They are COPIED here, not moved.** Phase 1 leaves amiexpress-web serving
its own door-repo API - that is this phase's whole safety property - and the
BBS resolves archives from `<BBS_DATA_DIR>/Archives`. Moving the corpus out
would 404 every archive on the live BBS the moment it ran, before any proxy
exists to cover it. The BBS's copy is deleted in PHASE 2, after the proxy
lands and the BBS stops serving archives itself.

Disk before doing this: the host is at **91% (3.6 GB free)**, so a 175 MB
copy is affordable but a docker build on top of it is not automatic - prune
first, and re-check with `df -h /` between steps.

```bash
# on the host, with the migrated doors.db copied to /root/seed/doors.db
docker builder prune -f          # 5.9 GB of build cache, ~4 GB reclaimable
df -h / | tail -1
docker volume create doorserver-data
docker run --rm -v doorserver-data:/data -v /root/seed:/seed alpine \
  sh -c 'cp /seed/doors.db /data/doors.db && mkdir -p /data/Archives'
# COPY (not mv) - the BBS still serves these until phase 2 cuts over
docker run --rm -v doorserver-data:/data \
  -v /var/lib/docker/volumes/amiexpress-bbs-data/_data/bbs/Archives:/src:ro alpine \
  sh -c 'cp -a /src/. /data/Archives/'
```
Verify the copy is complete before trusting it - count and total size on both
sides must match:

```bash
docker run --rm -v doorserver-data:/data alpine sh -c 'find /data/Archives -type f | wc -l; du -sh /data/Archives'
find /var/lib/docker/volumes/amiexpress-bbs-data/_data/bbs/Archives -type f | wc -l
du -sh /var/lib/docker/volumes/amiexpress-bbs-data/_data/bbs/Archives
df -h / | tail -1
```
Expected: identical file counts, matching sizes (~175 MB), and the BBS's own
copy still in place and still serving.

- [ ] **Step 8: Deploy and verify against the rule that a green workflow can lie**

```bash
ssh root@203.0.113.10 'docker inspect -f "{{.Created}}" $(docker compose -f /app/doorserver/docker-compose.yml ps -q doorserver)'
curl -fsS https://doors.uprough.net/api/door-repo/health
curl -sI https://doors.uprough.net/api/door-repo/archive/ACC-V103.LHA | grep -i x-archive-md5
```
Expected: image created just now; health reports the migrated door count and a `c<count>-t<...>` revision; the md5 header matches the local file's `md5sum`.

- [ ] **Step 9: Add the Caddy vhost on the host**

The live Caddyfile is NOT in version control (`/etc/caddy/Caddyfile`). Back it up first, add a `doors.uprough.net` site block reverse-proxying to `localhost:3010`, and set NO `header` directives there - Caddy's non-deferred `header` duplicates what the app already sends, which is exactly how `Cross-Origin-Resource-Policy` ended up doubled.

```bash
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-doorserver-$(date +%Y%m%d)
# edit, then:
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

- [ ] **Step 10: Commit**

```bash
git add Dockerfile docker-compose.yml .github/workflows/tests.yml .github/workflows/deploy-doorserver.yml docs/DOOR-REPO-API.md docs/superpowers/specs/2026-08-23-door-server-split-design.md
git commit -m "feat: container, CI and deployment for the door server"
```

---

## Phase 1 done when

- `npm test` and `npm run typecheck` are green in the new repo.
- The parity harness passes against the MIGRATED `doors.db`, not just a copy of the BBS's.
- `https://doors.uprough.net/api/door-repo/health` reports the full door count and a catalog revision.
- A real archive downloads from the new host with a correct `x-archive-md5`.
- amiexpress-web is untouched and still serving its own copy - nothing has been cut over, and the BBS's archive corpus is still where it was (the door server got a copy, not the original).

Phases 2 (BBS proxy + `door_installs`) and 3 (admin API + DOORMAN owner mode + curation tooling) get their own plans, written after this one lands.
