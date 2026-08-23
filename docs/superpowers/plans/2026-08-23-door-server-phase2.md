# Door Server Phase 2 (the BBS becomes a client) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** amiexpress-web stops serving the door catalog from its own database and becomes a client of the standalone door server, keeping only a record of what THIS node installed.

**Architecture:** `/api/door-repo/*` on the BBS becomes a streaming reverse proxy to `DOOR_SERVER_URL`, so every existing client keeps working at the URL it already uses. The sqlite-backed handlers are deleted, not kept as a fallback. A new `door_installs` table records this node's installs, replacing the `installed`/`installed_as`/`install_dir` columns. The BBS's `door_catalog` tables are dropped LAST, in their own task, after a live confirmation.

**Tech Stack:** TypeScript 5.9 (strict), Node 20, Express ^5.1.0, better-sqlite3 ^11.10.0, Jest 29 + ts-jest, global `fetch` + `stream.Readable.fromWeb`.

**Spec:** `docs/superpowers/specs/2026-08-23-door-server-split-design.md` (Component 2, "The proxy" and "door_installs")

**Phase 1 (complete, deployed):** the door server is live at `https://doors.uprough.net/api/door-repo/`, serving 3300 doors byte-identically. Its repo is `github.com/spotUP/amiexpress-doorserver`, checked out on the host at `/app/doorserver`.

## Global Constraints

- **This phase changes a LIVE BBS.** Every task must be revertible on its own, and no task may leave the door-repo API unavailable to the C door (`RepoHost=bbs.uprough.net`) between commits.
- **`DOOR_SERVER_URL` unset must behave exactly as `DOOR_REPO_ROLE != owner` does today**: the path 404s via Express's default no-route handler, not a custom body. A disabled feature must not be advertised.
- TypeScript strict, no `any`. Types crossing a module boundary are exported.
- No emojis. ASCII tokens `[OK]`, `[ERROR]`, `[WARN]`, `[INFO]` in log output.
- Never `git add -A` / `git add .` - add files by name. Never `--no-verify`.
- Every behaviour ships with a test observed FAILING first.
- **Do not add compression, and do not forward `accept-encoding` upstream.** The door server sends identity encoding; a gzipped upstream response would break `Content-Length` and the C client.
- The BBS's helmet and `doorRepoCors` middleware stay in front of the proxy. The door server sets none of those headers; the BBS adds them exactly as it does today.
- **The two catalogs can drift.** The door server holds a snapshot taken 2026-08-23; the BBS's own `door_catalog` has since changed (installing ACC-V103 altered it). After the proxy lands, the BBS's copy stops being read - that is the point. Do not "reconcile" them; Task 8 deletes the BBS's copy.

---

### Task 1: `door_installs` table and its repository

**Files:**
- Modify: `web/backend/src/database.ts` (migrations block, alongside the `door_catalog` migrations at :786-800)
- Create: `web/backend/src/doors/door-installs.repository.ts`
- Test: `web/backend/tests/doors/door-installs-repository.test.ts`

**Interfaces:**
- Consumes: the BBS's existing sqlite handle and migration pattern (`PRAGMA table_info` guard, `CREATE TABLE IF NOT EXISTS`).
- Produces:
  ```typescript
  export interface DoorInstall {
    id: string; catalog_id: string | null; archive_name: string; command: string;
    install_dir: string; door_type: string | null; name: string | null; md5: string | null;
    description: string | null; category: string | null; version: string | null;
    release_group: string | null;
    installed_at: number; source_url: string | null; source_revision: string | null;
  }
  export function recordInstall(entry: Omit<DoorInstall, 'installed_at'> & { installed_at?: number }): void
  export function removeInstall(command: string): void
  export function getInstallByCommand(command: string): DoorInstall | null
  export function getInstallByArchive(archiveName: string): DoorInstall | null
  export function listInstalls(): DoorInstall[]
  export function isArchiveInstalled(archiveName: string): boolean
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// web/backend/tests/doors/door-installs-repository.test.ts
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const DDL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'doors', 'door-installs.schema.sql'), 'utf-8');

describe('door_installs repository', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'installs-'));
    dbPath = path.join(dir, 'test.db');
    const db = new Database(dbPath);
    db.exec(DDL);
    db.close();
    process.env.DATABASE_DIR = dir;
    process.env.DATABASE_FILE = 'test.db';
    jest.resetModules();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.DATABASE_DIR;
    delete process.env.DATABASE_FILE;
  });

  function repo() {
    return require('../../src/doors/door-installs.repository') as
      typeof import('../../src/doors/door-installs.repository');
  }

  const base = {
    id: 'i1', catalog_id: 'c1', archive_name: 'ACC-V103.LHA', command: 'ACCV103',
    install_dir: 'Doors/ACCV103', door_type: 'AIM', name: 'Account Editor',
    md5: 'ef283e5f', description: 'Account editor', category: 'Utility',
    version: '1.03', release_group: 'VTL',
    source_url: 'https://doors.uprough.net/api/door-repo',
    source_revision: 'c3300-t1787029906',
  };

  it('records an install and finds it by command', () => {
    const r = repo();
    r.recordInstall(base);
    expect(r.getInstallByCommand('ACCV103')?.archive_name).toBe('ACC-V103.LHA');
  });

  it('finds an install by archive name, which is the durable join key', () => {
    const r = repo();
    r.recordInstall(base);
    expect(r.getInstallByArchive('ACC-V103.LHA')?.command).toBe('ACCV103');
    expect(r.isArchiveInstalled('ACC-V103.LHA')).toBe(true);
    expect(r.isArchiveInstalled('NOPE.LHA')).toBe(false);
  });

  it('stamps installed_at when the caller does not', () => {
    const r = repo();
    r.recordInstall(base);
    expect(r.getInstallByCommand('ACCV103')!.installed_at).toBeGreaterThan(0);
  });

  // BBSApi overlays these onto the doors list; without them a door installed
  // from the repo would lose its description and version in the door menu.
  it('keeps the display metadata BBSApi overlays', () => {
    const r = repo();
    r.recordInstall(base);
    expect(r.getInstallByCommand('ACCV103')).toMatchObject({
      description: 'Account editor', category: 'Utility',
      version: '1.03', release_group: 'VTL',
    });
  });

  it('re-installing the same command replaces the row rather than duplicating it', () => {
    const r = repo();
    r.recordInstall(base);
    r.recordInstall({ ...base, id: 'i2', archive_name: 'ACC-V105.LHA' });
    expect(r.listInstalls()).toHaveLength(1);
    expect(r.getInstallByCommand('ACCV103')?.archive_name).toBe('ACC-V105.LHA');
  });

  it('removes an install', () => {
    const r = repo();
    r.recordInstall(base);
    r.removeInstall('ACCV103');
    expect(r.getInstallByCommand('ACCV103')).toBeNull();
    expect(r.listInstalls()).toHaveLength(0);
  });

  it('returns null rather than throwing for an unknown command', () => {
    expect(repo().getInstallByCommand('NOSUCH')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/door-installs-repository.test.ts`
Expected: FAIL - `door-installs.schema.sql` does not exist.

- [ ] **Step 3: Write `web/backend/src/doors/door-installs.schema.sql`**

```sql
-- What THIS node installed. The shared catalog lives in the door server;
-- these rows are the one thing that is genuinely local, and they replace
-- door_catalog's installed / installed_as / install_dir columns.
CREATE TABLE IF NOT EXISTS door_installs (
  id              TEXT PRIMARY KEY,
  catalog_id      TEXT,
  archive_name    TEXT NOT NULL,
  command         TEXT NOT NULL UNIQUE,
  install_dir     TEXT NOT NULL,
  door_type       TEXT,
  name            TEXT,
  md5             TEXT,
  -- Display metadata, snapshotted at install time. BBSApi overlays these
  -- onto the doors list (BBSApi.ts, the .map() after buildDoorList), and the
  -- shared catalog is no longer local to read them from. They describe the
  -- version THIS node installed, which is the honest thing to show anyway.
  description     TEXT,
  category        TEXT,
  version         TEXT,
  release_group   TEXT,
  installed_at    INTEGER NOT NULL,
  source_url      TEXT,
  source_revision TEXT
);
CREATE INDEX IF NOT EXISTS idx_door_installs_archive ON door_installs(archive_name);
```

- [ ] **Step 4: Write `web/backend/src/doors/door-installs.repository.ts`**

```typescript
/**
 * The record of doors installed on THIS node.
 *
 * The catalog itself moved to the standalone door server, which knows
 * nothing about who installed what - so `installed`, `installed_as` and
 * `install_dir` could not move with it. They live here instead.
 *
 * `archive_name` is the durable join key against the shared catalog:
 * `catalog_id` is the remote row id and is allowed to go stale, because the
 * server may re-index or delete a row without telling anyone.
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export interface DoorInstall {
  id: string;
  catalog_id: string | null;
  archive_name: string;
  command: string;
  install_dir: string;
  door_type: string | null;
  name: string | null;
  md5: string | null;
  /** Display metadata snapshotted at install time - BBSApi overlays these
   *  onto the doors list, and the shared catalog is no longer local. */
  description: string | null;
  category: string | null;
  version: string | null;
  release_group: string | null;
  installed_at: number;
  source_url: string | null;
  source_revision: string | null;
}

function dbPath(): string {
  return path.join(
    process.env.DATABASE_DIR || path.join(__dirname, '..', '..', '..', '..'),
    process.env.DATABASE_FILE || 'database.sqlite'
  );
}

function openDb(readonly = false): Database.Database {
  return new Database(dbPath(), { readonly });
}

export function ensureSchema(db: Database.Database): void {
  db.exec(fs.readFileSync(path.join(__dirname, 'door-installs.schema.sql'), 'utf-8'));
}

export function recordInstall(
  entry: Omit<DoorInstall, 'installed_at'> & { installed_at?: number }
): void {
  const db = openDb();
  try {
    db.prepare(
      `INSERT INTO door_installs
         (id, catalog_id, archive_name, command, install_dir, door_type, name, md5,
          description, category, version, release_group,
          installed_at, source_url, source_revision)
       VALUES (@id, @catalog_id, @archive_name, @command, @install_dir, @door_type,
               @name, @md5, @description, @category, @version, @release_group,
               @installed_at, @source_url, @source_revision)
       ON CONFLICT(command) DO UPDATE SET
         id = excluded.id, catalog_id = excluded.catalog_id,
         archive_name = excluded.archive_name, install_dir = excluded.install_dir,
         door_type = excluded.door_type, name = excluded.name, md5 = excluded.md5,
         description = excluded.description, category = excluded.category,
         version = excluded.version, release_group = excluded.release_group,
         installed_at = excluded.installed_at, source_url = excluded.source_url,
         source_revision = excluded.source_revision`
    ).run({ ...entry, installed_at: entry.installed_at ?? Math.floor(Date.now() / 1000) });
  } finally {
    db.close();
  }
}

export function removeInstall(command: string): void {
  const db = openDb();
  try {
    db.prepare('DELETE FROM door_installs WHERE command = ?').run(command);
  } finally {
    db.close();
  }
}

export function getInstallByCommand(command: string): DoorInstall | null {
  const db = openDb(true);
  try {
    return (db.prepare('SELECT * FROM door_installs WHERE command = ?')
      .get(command) as DoorInstall | undefined) ?? null;
  } finally {
    db.close();
  }
}

export function getInstallByArchive(archiveName: string): DoorInstall | null {
  const db = openDb(true);
  try {
    return (db.prepare('SELECT * FROM door_installs WHERE archive_name = ? COLLATE NOCASE')
      .get(archiveName) as DoorInstall | undefined) ?? null;
  } finally {
    db.close();
  }
}

export function listInstalls(): DoorInstall[] {
  const db = openDb(true);
  try {
    return db.prepare('SELECT * FROM door_installs ORDER BY command').all() as DoorInstall[];
  } finally {
    db.close();
  }
}

export function isArchiveInstalled(archiveName: string): boolean {
  return getInstallByArchive(archiveName) !== null;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/door-installs-repository.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 6: Wire the table into the BBS migrations**

In `web/backend/src/database.ts`, immediately after the `door_catalog` column migrations (around :800), add:

```typescript
      // door_installs — what THIS node installed. The catalog itself now
      // lives in the standalone door server (see
      // docs/superpowers/specs/2026-08-23-door-server-split-design.md), which
      // cannot know who installed what, so these rows stay local.
      {
        const installsDdl = fs.readFileSync(
          path.join(__dirname, 'doors', 'door-installs.schema.sql'), 'utf-8');
        this.db.exec(installsDdl);
console.log('[+] door_installs table ensured');
      }
```

Confirm `fs` and `path` are already imported in that file; if not, add them.

- [ ] **Step 7: Verify the migration runs against a real BBS database copy**

```bash
cp ~/Code/amiexpress-web/database.sqlite /tmp/bbs-migration-test.db
cd web/backend && DATABASE_DIR=/tmp DATABASE_FILE=bbs-migration-test.db npx tsx -e "require('./src/database');" 2>&1 | tail -5
sqlite3 /tmp/bbs-migration-test.db ".schema door_installs" | head -5
rm -f /tmp/bbs-migration-test.db
```
Expected: the table exists with the eleven columns above. NEVER run this against the real `database.sqlite`.

- [ ] **Step 8: Type-check and commit**

```bash
cd web/backend && npx tsc --noEmit
git add web/backend/src/doors/door-installs.schema.sql web/backend/src/doors/door-installs.repository.ts web/backend/src/database.ts web/backend/tests/doors/door-installs-repository.test.ts
git commit -m "feat(bbs): record what this node installed, separately from the shared catalog"
```

---

### Task 2: Backfill `door_installs` from the existing catalog

**Files:**
- Create: `dev/scripts/backfill-door-installs.ts`
- Test: `web/backend/tests/doors/backfill-door-installs.test.ts`

**Interfaces:**
- Consumes: `recordInstall`, `listInstalls` (Task 1).
- Produces: `backfillDoorInstalls(dbFile: string): { migrated: number; skipped: number }` - reads `door_catalog` rows where `installed = 1` and writes one `door_installs` row each. Idempotent: re-running does not duplicate.

- [ ] **Step 1: Write the failing test**

```typescript
// web/backend/tests/doors/backfill-door-installs.test.ts
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { backfillDoorInstalls } from '../../../../dev/scripts/backfill-door-installs';

describe('backfillDoorInstalls', () => {
  let dir: string;
  let dbFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-'));
    dbFile = path.join(dir, 'bbs.db');
    const db = new Database(dbFile);
    db.exec(`
      CREATE TABLE door_catalog (
        id TEXT PRIMARY KEY, archive_name TEXT NOT NULL UNIQUE, archive_path TEXT NOT NULL,
        door_type TEXT, name TEXT NOT NULL, md5 TEXT, description TEXT, category TEXT,
        version TEXT, release_group TEXT,
        installed INTEGER DEFAULT 0, installed_as TEXT, install_dir TEXT);
    `);
    db.exec(fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'doors', 'door-installs.schema.sql'), 'utf-8'));
    db.prepare(
      `INSERT INTO door_catalog (id, archive_name, archive_path, door_type, name, md5,
         description, category, version, release_group, installed, installed_as, install_dir)
       VALUES ('c1','ACC-V103.LHA','A/ACC-V103.LHA','AIM','Account Ed','ef28','Editor','Utility','1.03','VTL',1,'ACCV103','Doors/ACCV103'),
              ('c2','OTHER.LHA','A/OTHER.LHA','XIM','Other','aa11',NULL,NULL,NULL,NULL,0,NULL,NULL),
              ('c3','THIRD.LHA','A/THIRD.LHA','XIM','Third','bb22',NULL,NULL,NULL,NULL,1,'THIRD','Doors/THIRD')`
    ).run();
    db.close();
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('migrates only the rows marked installed', () => {
    const counts = backfillDoorInstalls(dbFile);
    expect(counts.migrated).toBe(2);
    const db = new Database(dbFile, { readonly: true });
    const rows = db.prepare('SELECT command, archive_name FROM door_installs ORDER BY command').all();
    db.close();
    expect(rows).toEqual([
      { command: 'ACCV103', archive_name: 'ACC-V103.LHA' },
      { command: 'THIRD', archive_name: 'THIRD.LHA' },
    ]);
  });

  it('carries the catalog id, type and digest across', () => {
    backfillDoorInstalls(dbFile);
    const db = new Database(dbFile, { readonly: true });
    const row = db.prepare('SELECT * FROM door_installs WHERE command = ?').get('ACCV103') as Record<string, unknown>;
    db.close();
    expect(row).toMatchObject({
      catalog_id: 'c1', door_type: 'AIM', md5: 'ef28', install_dir: 'Doors/ACCV103',
      description: 'Editor', category: 'Utility', version: '1.03', release_group: 'VTL',
    });
  });

  it('is idempotent - a second run adds nothing', () => {
    backfillDoorInstalls(dbFile);
    const second = backfillDoorInstalls(dbFile);
    const db = new Database(dbFile, { readonly: true });
    const n = (db.prepare('SELECT COUNT(*) AS n FROM door_installs').get() as { n: number }).n;
    db.close();
    expect(n).toBe(2);
    expect(second.migrated + second.skipped).toBe(2);
  });

  it('skips a row whose installed_as is empty, because a command name is required', () => {
    const db = new Database(dbFile);
    db.prepare(`INSERT INTO door_catalog (id, archive_name, archive_path, name, installed, installed_as)
                VALUES ('c4','BAD.LHA','A/BAD.LHA','Bad',1,NULL)`).run();
    db.close();
    const counts = backfillDoorInstalls(dbFile);
    expect(counts.skipped).toBeGreaterThanOrEqual(1);
    const check = new Database(dbFile, { readonly: true });
    const n = (check.prepare('SELECT COUNT(*) AS n FROM door_installs').get() as { n: number }).n;
    check.close();
    expect(n).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/backfill-door-installs.test.ts`
Expected: FAIL - cannot find `dev/scripts/backfill-door-installs`.

- [ ] **Step 3: Write `dev/scripts/backfill-door-installs.ts`**

```typescript
/**
 * Seeds door_installs from the catalog rows this node had marked installed.
 *
 * Runs ONCE per node, before door_catalog's installed columns go away. A row
 * with no installed_as has no command name and cannot become an install
 * record, so it is skipped and counted rather than guessed at.
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export interface BackfillCounts {
  migrated: number;
  skipped: number;
}

interface CatalogRow {
  id: string; archive_name: string; door_type: string | null; name: string | null;
  md5: string | null; description: string | null; category: string | null;
  version: string | null; release_group: string | null;
  installed_as: string | null; install_dir: string | null;
}

export function backfillDoorInstalls(dbFile: string): BackfillCounts {
  const db = new Database(dbFile);
  try {
    db.exec(fs.readFileSync(
      path.join(__dirname, '..', '..', 'web', 'backend', 'src', 'doors', 'door-installs.schema.sql'),
      'utf-8'));

    const rows = db.prepare(
      `SELECT id, archive_name, door_type, name, md5, description, category, version,
              release_group, installed_as, install_dir
         FROM door_catalog WHERE installed = 1`
    ).all() as CatalogRow[];

    const insert = db.prepare(
      `INSERT INTO door_installs
         (id, catalog_id, archive_name, command, install_dir, door_type, name, md5,
          description, category, version, release_group,
          installed_at, source_url, source_revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
       ON CONFLICT(command) DO NOTHING`
    );

    let migrated = 0;
    let skipped = 0;
    const now = Math.floor(Date.now() / 1000);
    for (const row of rows) {
      const command = (row.installed_as ?? '').trim();
      if (!command) {
        skipped++;
        continue;
      }
      insert.run(
        `local-${row.id}`, row.id, row.archive_name, command,
        row.install_dir ?? `Doors/${command}`, row.door_type, row.name, row.md5,
        row.description, row.category, row.version, row.release_group, now
      );
      migrated++;
    }
    return { migrated, skipped };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('[ERROR] usage: backfill-door-installs.ts <database.sqlite>');
    process.exit(1);
  }
  const counts = backfillDoorInstalls(target);
  console.log(`[OK] backfilled ${counts.migrated} installs, skipped ${counts.skipped}`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/backfill-door-installs.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Dry-run against a COPY of the real database**

```bash
cp ~/Code/amiexpress-web/database.sqlite /tmp/backfill-test.db
npx tsx dev/scripts/backfill-door-installs.ts /tmp/backfill-test.db
sqlite3 /tmp/backfill-test.db "SELECT COUNT(*) FROM door_installs;"
sqlite3 /tmp/backfill-test.db "SELECT COUNT(*) FROM door_catalog WHERE installed = 1;"
rm -f /tmp/backfill-test.db
```
Expected: the two counts match (or differ only by rows with an empty `installed_as`, which the script reports as skipped). NEVER run against the real file.

- [ ] **Step 6: Commit**

```bash
git add dev/scripts/backfill-door-installs.ts web/backend/tests/doors/backfill-door-installs.test.ts
git commit -m "feat(bbs): backfill door_installs from the catalog's installed rows"
```

---

### Task 3: The proxy replaces the sqlite-backed door-repo routes

**Files:**
- Rewrite: `web/backend/src/server/door-repo.routes.ts`
- Modify: `web/backend/src/server/app.ts:233-235` (the mount gate)
- Test: `web/backend/tests/api/door-repo-proxy.test.ts`
- Delete (in this task): the sqlite handlers inside `door-repo.routes.ts`; the file keeps only the proxy.

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces: `export function isDoorRepoProxyEnabled(env?: NodeJS.ProcessEnv): boolean` (true when `DOOR_SERVER_URL` is a non-empty string) and `export const doorRepoRouter: express.Router`. `app.ts` mounts it only when `isDoorRepoProxyEnabled()`.

**Facts measured before this task was written - do not re-derive them, and do not "fix" what they establish:**

1. **`req.url` inside this mounted router excludes the mount path and keeps the query string**, verified against express 5.1.0:
   `/api/door-repo/list.txt?type=XIM` -> `req.url = /list.txt?type=XIM`, `baseUrl = /api/door-repo`.
   So `${base}/api/door-repo${req.url}` is the correct target. Using `originalUrl` would double the prefix.
2. **Percent-encoding survives raw**: `/api/door-repo/files/%24CP-BU%DF1.LZX` arrives as
   `req.url = /files/%24CP-BU%DF1.LZX` - NOT decoded. This is load-bearing. The door server's
   `candidateArchiveNames` needs the raw `%DF` to do its Latin-1 fallback, and the catalog has an
   archive named `$CP-BUß1.LZX`. Never decode and re-encode the path in the proxy; pass `req.url`
   through byte-for-byte.
3. **CORS preflight never reaches this router.** `doorRepoCors` (mounted at app.ts:90, ahead of the
   router at :234) answers `OPTIONS` itself with 204 and returns WITHOUT calling `next()`
   (door-repo-cors.ts:72-77). Do NOT add OPTIONS handling or CORS headers to the proxy - doing so
   would duplicate headers, which is precisely the bug that broke `Cross-Origin-Resource-Policy` on
   this host before.

- [ ] **Step 1: Write the failing test**

```typescript
// web/backend/tests/api/door-repo-proxy.test.ts
import express from 'express';
import request from 'supertest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

describe('door-repo proxy', () => {
  let upstream: Server;
  let upstreamUrl: string;
  let seen: { method: string; url: string; headers: Record<string, unknown> }[] = [];

  beforeAll((done) => {
    const app = express();
    app.use((req, res) => {
      seen.push({ method: req.method, url: req.url, headers: req.headers });
      if (req.url.startsWith('/api/door-repo/health')) {
        res.set('X-Door-Repo-Revision', 'c3300-t1');
        res.json({ status: 'ok', revision: 'c3300-t1', doors: 3300 });
        return;
      }
      if (req.url.startsWith('/api/door-repo/list.txt')) {
        if (req.headers['if-none-match'] === '"c3300-t1"') { res.status(304).end(); return; }
        res.set('Content-Type', 'text/plain; charset=ISO-8859-1');
        res.set('X-Door-Repo-Revision', 'c3300-t1');
        res.send(Buffer.from('DOORREPO|1|c3300-t1|1\r\n', 'latin1'));
        return;
      }
      if (req.url.startsWith('/api/door-repo/archive/')) {
        res.set('X-Archive-MD5', 'deadbeef');
        res.set('Content-Type', 'application/octet-stream');
        res.send(Buffer.from([0x00, 0xa1, 0xff]));
        return;
      }
      res.status(404).set('Content-Type', 'text/plain').send('NOT FOUND: x\r\n');
    });
    upstream = app.listen(0, () => {
      upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
      done();
    });
  });

  afterAll((done) => { upstream.close(() => done()); });
  beforeEach(() => { seen = []; jest.resetModules(); });

  function bbs() {
    process.env.DOOR_SERVER_URL = upstreamUrl;
    const { doorRepoRouter } = require('../../src/server/door-repo.routes');
    const app = express();
    app.use('/api/door-repo', doorRepoRouter);
    return app;
  }

  it('passes a JSON response through with its revision header', async () => {
    const res = await request(bbs()).get('/api/door-repo/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-door-repo-revision']).toBe('c3300-t1');
    expect(res.body.doors).toBe(3300);
  });

  it('preserves Latin-1 bytes and the content type', async () => {
    const res = await request(bbs()).get('/api/door-repo/list.txt');
    expect(res.headers['content-type']).toContain('ISO-8859-1');
    expect(res.text).toContain('DOORREPO|1|c3300-t1|1');
  });

  it('forwards If-None-Match and returns the upstream 304', async () => {
    const res = await request(bbs())
      .get('/api/door-repo/list.txt')
      .set('If-None-Match', '"c3300-t1"');
    expect(res.status).toBe(304);
    expect(seen.some((r) => r.headers['if-none-match'] === '"c3300-t1"')).toBe(true);
  });

  it('preserves the archive checksum header and the exact bytes', async () => {
    const res = await request(bbs())
      .get('/api/door-repo/archive/ACC-V103.LHA')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (d: Buffer) => chunks.push(d));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.headers['x-archive-md5']).toBe('deadbeef');
    expect(Buffer.compare(res.body as Buffer, Buffer.from([0x00, 0xa1, 0xff]))).toBe(0);
  });

  it('passes the upstream 404 body through unchanged, for C clients that parse it', async () => {
    const res = await request(bbs()).get('/api/door-repo/archive/NOPE.LHA');
    expect(res.status).toBe(404);
    expect(res.text).toBe('NOT FOUND: x\r\n');
  });

  it('forwards the request method, so HEAD stays HEAD', async () => {
    await request(bbs()).head('/api/door-repo/files/ACC-V103.LHA');
    expect(seen.some((r) => r.method === 'HEAD')).toBe(true);
  });

  it('forwards Range untouched', async () => {
    await request(bbs()).get('/api/door-repo/archive/ACC-V103.LHA').set('Range', 'bytes=0-99');
    expect(seen.some((r) => r.headers.range === 'bytes=0-99')).toBe(true);
  });

  it('never asks upstream for a compressed body, which would break Content-Length', async () => {
    await request(bbs()).get('/api/door-repo/list.txt').set('Accept-Encoding', 'gzip, deflate');
    expect(seen.every((r) => !r.headers['accept-encoding'] ||
      String(r.headers['accept-encoding']).includes('identity'))).toBe(true);
  });

  it('answers 502 in plain text when the door server is unreachable', async () => {
    process.env.DOOR_SERVER_URL = 'http://127.0.0.1:1';
    jest.resetModules();
    const { doorRepoRouter } = require('../../src/server/door-repo.routes');
    const app = express();
    app.use('/api/door-repo', doorRepoRouter);
    const res = await request(app).get('/api/door-repo/health');
    expect(res.status).toBe(502);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('DOOR REPO UNAVAILABLE');
  });
});

describe('isDoorRepoProxyEnabled', () => {
  it('is false when DOOR_SERVER_URL is unset, so the path 404s like a disabled feature', () => {
    const { isDoorRepoProxyEnabled } = require('../../src/server/door-repo.routes');
    expect(isDoorRepoProxyEnabled({})).toBe(false);
    expect(isDoorRepoProxyEnabled({ DOOR_SERVER_URL: '' })).toBe(false);
    expect(isDoorRepoProxyEnabled({ DOOR_SERVER_URL: 'https://doors.uprough.net' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/api/door-repo-proxy.test.ts`
Expected: FAIL - `isDoorRepoProxyEnabled` is not exported and the router still serves from sqlite.

- [ ] **Step 3: Replace `web/backend/src/server/door-repo.routes.ts` entirely**

```typescript
/**
 * door-repo proxy: forwards /api/door-repo/* to the standalone door server.
 *
 * The catalog, the archive corpus and the curation API moved to
 * github.com/spotUP/amiexpress-doorserver (design:
 * docs/superpowers/specs/2026-08-23-door-server-split-design.md). This BBS
 * keeps answering at the same URL so nothing already deployed breaks - the
 * DoorRepo C door ships with RepoHost=bbs.uprough.net baked into config on
 * other people's machines.
 *
 * Deliberately NOT kept: the sqlite-backed handlers this file used to carry.
 * Two implementations of one contract is how the duplicated
 * Cross-Origin-Resource-Policy header happened on this host.
 *
 * The BBS's helmet and doorRepoCors middleware still run in front of this
 * router, exactly as before; the door server sets none of those headers.
 */
import express, { NextFunction, Request, Response } from 'express';
import { Readable } from 'stream';

/** True when a door server is configured. When false, app.ts does not mount
 *  the router at all, so the path 404s through Express's own no-route
 *  handler - a disabled feature must not be advertised. */
export function isDoorRepoProxyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return typeof env.DOOR_SERVER_URL === 'string' && env.DOOR_SERVER_URL.length > 0;
}

/** Response headers that carry meaning to a door-repo client. Everything
 *  else the upstream sends is dropped; the BBS's own middleware supplies
 *  CORS and security headers. */
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'etag',
  'last-modified',
  'x-door-repo-revision',
  'x-archive-md5',
  'x-archive-sha256',
  'x-doc-filename',
];

/** Request headers worth forwarding. `accept-encoding` is deliberately
 *  absent: the door server replies with identity encoding, and a gzipped
 *  upstream body would invalidate the Content-Length a C89 client reads. */
const FORWARDED_REQUEST_HEADERS = ['if-none-match', 'if-modified-since', 'range', 'user-agent'];

function upstreamBase(): string {
  return (process.env.DOOR_SERVER_URL ?? '').replace(/\/+$/, '');
}

export const doorRepoRouter = express.Router();

doorRepoRouter.use(async (req: Request, res: Response, next: NextFunction) => {
  const base = upstreamBase();
  if (!base) {
    next();
    return;
  }

  const target = `${base}/api/door-repo${req.url}`;
  const headers: Record<string, string> = { 'accept-encoding': 'identity' };
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(target, { method: req.method, headers, redirect: 'manual' });
  } catch (err) {
    // Plain text in the same register as the API's own 404 body, so a C
    // client parsing bytes sees something predictable rather than HTML.
    console.error(`[door-repo proxy] ERROR upstream unreachable: ${(err as Error).message}`);
    res.status(502).set('Content-Type', 'text/plain').send('DOOR REPO UNAVAILABLE\r\n');
    return;
  }

  res.status(upstream.status);
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) res.set(name, value);
  }

  if (upstream.status === 304 || req.method === 'HEAD' || upstream.body === null) {
    res.end();
    return;
  }

  Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
});
```

- [ ] **Step 4: Update the mount in `web/backend/src/server/app.ts`**

Replace the `isDoorRepoOwner()` import and gate (:233-235) with:

```typescript
if (isDoorRepoProxyEnabled()) {
  app.use('/api/door-repo', doorRepoRouter);
}
```
and change the import on line 9 to `import { doorRepoRouter, isDoorRepoProxyEnabled } from './door-repo.routes';`. Update the comment block above it: the gate is now "is a door server configured", not "is this BBS the repo owner".

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/api/door-repo-proxy.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 6: Delete the now-unused suites and confirm nothing else imports the removed functions**

```bash
git rm web/backend/tests/api/door-repo-routes.test.ts
grep -rn "isDoorRepoOwner\|door-repo-manifest\|door-repo-checksums" web/backend/src Doors --include='*.ts' | grep -v '/dist/'
```
Every remaining hit must be inside `web/backend/src/doors/door-repo-manifest.ts` or `door-repo-checksums.ts` themselves (they are deleted in Task 8) - nothing else may still import them. If DOORMAN hits appear, they belong to Task 5; note them and continue.

- [ ] **Step 7: Type-check, run the whole backend suite, commit**

```bash
cd web/backend && npx tsc --noEmit && npx jest --config dev-scripts/jest.config.ts --rootDir . --ci 2>&1 | tail -5
git add web/backend/src/server/door-repo.routes.ts web/backend/src/server/app.ts web/backend/tests/api/door-repo-proxy.test.ts
git commit -m "feat(bbs): proxy the door-repo API to the standalone server"
```

---

### Task 4: `BBSApi` reads installs, not the catalog

**Files:**
- Modify: `web/backend/src/doors/BBSApi.ts:31` (import) and `:1345` (the call site)
- Test: `web/backend/tests/doors/bbsapi-installed-lookup.test.ts`

**Interfaces:**
- Consumes: `getInstallByCommand` (Task 1).
- Produces: nothing new; this removes the BBS's last read of `door_catalog` outside the modules Task 8 deletes.

- [ ] **Step 1: Read the call site and its surroundings**

```bash
sed -n '1335,1360p' web/backend/src/doors/BBSApi.ts
```
It calls `_searchCatalog(door.command, true)` - "find the catalog row for this command, installed only" - and uses the result to describe the running door.

- [ ] **Step 2: Write the failing test**

```typescript
// web/backend/tests/doors/bbsapi-installed-lookup.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

describe('BBSApi installed-door lookup', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbsapi-'));
    const dbPath = path.join(dir, 'test.db');
    const db = new Database(dbPath);
    db.exec(fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'doors', 'door-installs.schema.sql'), 'utf-8'));
    db.close();
    process.env.DATABASE_DIR = dir;
    process.env.DATABASE_FILE = 'test.db';
    jest.resetModules();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.DATABASE_DIR;
    delete process.env.DATABASE_FILE;
  });

  it('finds an installed door by its command through door_installs', () => {
    const repo = require('../../src/doors/door-installs.repository') as
      typeof import('../../src/doors/door-installs.repository');
    repo.recordInstall({
      id: 'i1', catalog_id: null, archive_name: 'ACC-V103.LHA', command: 'ACCV103',
      install_dir: 'Doors/ACCV103', door_type: 'AIM', name: 'Account Editor',
      md5: null, source_url: null, source_revision: null,
    });
    expect(repo.getInstallByCommand('ACCV103')?.name).toBe('Account Editor');
  });

  it('does not import the catalog service any more', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'doors', 'BBSApi.ts'), 'utf-8');
    expect(src).not.toMatch(/door-catalog\.service/);
    expect(src).toMatch(/door-installs\.repository/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/bbsapi-installed-lookup.test.ts`
Expected: FAIL on the second test - `BBSApi.ts` still imports `door-catalog.service`.

- [ ] **Step 4: Change the import and the call site**

Replace line 31's import with:

```typescript
import { getInstallByCommand } from './door-installs.repository';
```

The existing overlay searches the catalog and then matches on `installed_as`
- a two-step dance that exists only because the catalog was keyed by archive.
`door_installs` is keyed by command, so the lookup is direct. Replace the
whole `try { const results = _searchCatalog(...) ... }` overlay block with:

```typescript
      // Overlay the metadata captured when this door was installed. It used
      // to come from door_catalog; the shared catalog now lives in the door
      // server, and door_installs holds this node's snapshot of it (keyed by
      // command, so no installed_as matching is needed any more).
      try {
        const match = getInstallByCommand(door.command);
        if (match) {
          return {
            ...door,
            name: match.name || door.name,
            description: match.description || door.description,
            category: match.category || door.category,
            version: match.version || undefined,
            releaseGroup: match.release_group || undefined,
          };
        }
```
Leave the `catch` and everything after it exactly as it is.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/bbsapi-installed-lookup.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 6: Type-check and commit**

```bash
cd web/backend && npx tsc --noEmit
git add web/backend/src/doors/BBSApi.ts web/backend/tests/doors/bbsapi-installed-lookup.test.ts
git commit -m "feat(bbs): resolve installed doors from door_installs"
```

---

### Task 5: DOORMAN records installs locally instead of faking catalog rows

**Files:**
- Modify: `Doors/door-manager/app.ts:457-500` (consumer-mode install) and `:1296` (uninstall)
- Modify: `Doors/door-manager/repoDataSource.ts` (the `installed` resolver)
- Test: `web/backend/tests/doors/doorman-records-install.test.ts`

**Interfaces:**
- Consumes: `recordInstall`, `removeInstall`, `isArchiveInstalled` (Task 1).
- Produces: DOORMAN's install path no longer calls `upsertCatalogEntry` or `markInstalled`.

- [ ] **Step 1: Read what consumer mode does today**

```bash
sed -n '440,505p' Doors/door-manager/app.ts
```
It synthesizes a local `door_catalog` row (`upsertCatalogEntry`) purely so `markInstalled` has something to write to - the workaround this task removes.

- [ ] **Step 2: Write the failing test**

```typescript
// web/backend/tests/doors/doorman-records-install.test.ts
import * as fs from 'fs';
import * as path from 'path';

describe('DOORMAN install path', () => {
  const appSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '..', 'Doors', 'door-manager', 'app.ts'), 'utf-8');

  it('records the install in door_installs', () => {
    expect(appSrc).toMatch(/recordInstall/);
  });

  it('no longer synthesizes a catalog row to hang the install flag on', () => {
    expect(appSrc).not.toMatch(/upsertCatalogEntry/);
    expect(appSrc).not.toMatch(/markInstalled/);
  });

  it('uninstall removes the install record rather than clearing a catalog flag', () => {
    expect(appSrc).toMatch(/removeInstall/);
    expect(appSrc).not.toMatch(/markUninstalled/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/doorman-records-install.test.ts`
Expected: FAIL - all three assertions.

- [ ] **Step 4: Rewire DOORMAN's dependency object**

In `app.ts`, replace the `upsertCatalogEntry` / `markInstalled` pair in the consumer-install deps with a single `recordInstall` call carrying what the manifest already knows:

```typescript
        recordInstall: () => {
          deps.recordInstall({
            id: `install-${finalCmd}`,
            catalog_id: localRow?.id ?? null,
            archive_name: e.archive_name,
            command: finalCmd,
            install_dir: `Doors/${finalCmd}`,
            door_type: e.door_type ?? null,
            name: e.name ?? null,
            // CatalogEntry carries no md5 (checked: repoDataSource.ts's
            // interface has no such field). The archive's digest was already
            // verified at download time; install bookkeeping does not need it.
            md5: null,
            description: e.description ?? null,
            category: e.category ?? null,
            version: e.version ?? null,
            release_group: e.release_group ?? null,
            source_url: process.env.DOOR_REPO_URL ?? null,
            source_revision: manifestRevision ?? null,
          });
        },
```
and at :1296 replace `svc?.markUninstalled(e.id)` with `deps.removeInstall(e.installed_as ?? e.archive_name)`. In `repoDataSource.ts`, the `installed` flag resolver switches from a catalog lookup to `isArchiveInstalled(entry.archive_name)`.

Owner mode's curation screens (`deleteCatalogEntry`, `stripArchiveOnServer`, `updateJunkCount`, `removeArchiveFiles`) are NOT touched here - they move to the admin API in phase 3. If they no longer compile because the catalog service is gone, guard them behind the existing `svc?.` optional-call pattern so they degrade to "unavailable" rather than crashing, and note it for phase 3.

- [ ] **Step 5: Run the tests, then rebuild DOORMAN's dist**

```bash
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/doorman-records-install.test.ts
cd ~/Code/amiexpress-web/Doors/door-manager && npm run build
```
Expected: 3 tests pass, and `dist/app.js` is rebuilt - a source-only commit is invisible to the running BBS.

- [ ] **Step 6: Commit**

```bash
git add Doors/door-manager/app.ts Doors/door-manager/repoDataSource.ts Doors/door-manager/dist web/backend/tests/doors/doorman-records-install.test.ts
git commit -m "feat(doorman): record installs locally instead of faking catalog rows"
```

---

### Task 6: Vendor the contract mirror

**Files:**
- Create: `Doors/door-manager/repo-types.generated.ts` (regenerated from the door server's contract)
- Create: `web/backend/tests/doors/contract-mirror-staleness.test.ts`

**Interfaces:**
- Consumes: `~/Code/amiexpress-doorserver/contract/manifest-types.ts` and its generator `scripts/gen-contract-types.ts`.
- Produces: a committed mirror whose staleness is now actually testable - phase 1 left this unmet, because there was no mirror to compare against.

- [ ] **Step 1: Regenerate the mirror from the door server's contract**

```bash
cd ~/Code/amiexpress-doorserver
npx tsx scripts/gen-contract-types.ts ~/Code/amiexpress-web/Doors/door-manager/repo-types.generated.ts
head -8 ~/Code/amiexpress-web/Doors/door-manager/repo-types.generated.ts
```
Expected: the file begins with the GENERATED FILE banner and carries `CONTRACT_VERSION`.

- [ ] **Step 2: Write the staleness test**

```typescript
// web/backend/tests/doors/contract-mirror-staleness.test.ts
import * as fs from 'fs';
import * as path from 'path';

/**
 * The door server owns the manifest contract; this repo commits a mirror so
 * DOORMAN compiles without depending on that checkout. If the two drift, a
 * client can be reading fields the server no longer sends.
 *
 * Skips when the door server checkout is absent, so CI here does not depend
 * on a sibling repo - but fails loudly when it IS present and differs.
 */
const SERVER_CONTRACT = '~/Code/amiexpress-doorserver/contract/manifest-types.ts';
const MIRROR = path.join(__dirname, '..', '..', '..', '..', 'Doors', 'door-manager', 'repo-types.generated.ts');

const describeIfServer = fs.existsSync(SERVER_CONTRACT) ? describe : describe.skip;

describe('vendored contract mirror', () => {
  it('exists and is marked generated', () => {
    const mirror = fs.readFileSync(MIRROR, 'utf-8');
    expect(mirror).toContain('GENERATED FILE');
    expect(mirror).toContain('export interface ManifestDoor');
  });
});

describeIfServer('mirror against the door server contract', () => {
  it('declares the same fields the server does', () => {
    const server = fs.readFileSync(SERVER_CONTRACT, 'utf-8');
    const mirror = fs.readFileSync(MIRROR, 'utf-8');
    const fields = (src: string, iface: string): string[] => {
      const body = new RegExp(`export interface ${iface} \\{([^}]*)\\}`).exec(src)?.[1] ?? '';
      return body.split('\n').map((l) => l.trim().split(/[?:]/)[0].trim())
        .filter((l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'));
    };
    expect(fields(mirror, 'ManifestDoor')).toEqual(fields(server, 'ManifestDoor'));
    expect(fields(mirror, 'DoorRepoManifest')).toEqual(fields(server, 'DoorRepoManifest'));
  });
});
```

- [ ] **Step 3: Run it and confirm it passes for the right reason**

```bash
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/contract-mirror-staleness.test.ts
```
Then prove it bites: add a junk field to a COPY of the server contract, point `SERVER_CONTRACT` at the copy temporarily, watch the field test FAIL, then restore. Put both runs in the report.

- [ ] **Step 4: Commit**

```bash
git add Doors/door-manager/repo-types.generated.ts web/backend/tests/doors/contract-mirror-staleness.test.ts
git commit -m "feat(doorman): vendor the door server's contract and test it for drift"
```

---

### Task 7: Deploy the proxy and verify it against the door server

**Files:**
- Modify: `docker-compose.yml` (add `DOOR_SERVER_URL` to the bbs service environment)
- Modify: `handoff.md` (state of play)

**Interfaces:**
- Consumes: everything above.
- Produces: a live BBS whose `/api/door-repo/*` is served by the door server.

- [ ] **Step 1: Put both containers on a shared network, then set the URL**

**Do NOT use `http://127.0.0.1:3010`.** Measured on the live host: inside the
BBS container that address is the container itself, and the two containers sit
on separate bridge networks (`amiexpress_default`, `doorserver_default`), so
the BBS cannot reach the door server at all. The door server publishes on
`127.0.0.1:3010` of the HOST deliberately - that is what keeps it off every
interface - so widening the bind or using `host.docker.internal` would undo a
phase-1 security decision.

Instead, give the two containers a shared network and let service DNS do the
work. The host publish stays loopback-only, so Caddy keeps serving the public
vhost exactly as it does now (verified: host -> 127.0.0.1:3010 returns 200).

On the host, once:
```bash
docker network create doorserver-net
```

In THIS repo's `docker-compose.yml`, on the `bbs` service:
```yaml
    networks:
      - default
      - doorserver-net
    environment:
      # The door catalog lives in the standalone door server; this BBS proxies
      # to it so shipped clients (RepoHost=bbs.uprough.net) keep working.
      # Unset = the /api/door-repo paths 404, exactly as a disabled feature should.
      # Reached by service DNS over the shared network - NOT 127.0.0.1, which
      # inside a container is the container.
      DOOR_SERVER_URL: ${DOOR_SERVER_URL:-http://doorserver:3010}
```
and at the file's top level:
```yaml
networks:
  doorserver-net:
    external: true
```

In the OTHER repo (`~/Code/amiexpress-doorserver/docker-compose.yml`),
add the same `networks:` stanza to its `doorserver` service and the same
top-level `external: true` block, so the service is reachable by the name
`doorserver`. That is a separate commit in that repo; it is additive and does
not change the published port. Verify from inside the BBS container before
trusting it:
```bash
docker exec amiexpress-bbs sh -lc 'wget -qO- http://doorserver:3010/api/door-repo/health'
```

- [ ] **Step 2: Capture the CURRENT live responses before changing anything**

```bash
for p in health list.txt files/ACC-V103.LHA diz/ACC-V103.LHA; do
  curl -s "https://bbs.uprough.net/api/door-repo/$p" | md5sum | sed "s|^|  $p |"
done
```
Save the output. This is the before-picture the proxy must reproduce (modulo the catalog drift noted in Global Constraints - `list.txt` and the manifest WILL differ, because the BBS's own catalog changed after ACC was installed and the door server holds the pre-install snapshot. Everything else must match).

- [ ] **Step 3: Push and let CI deploy**

```bash
git push origin main
gh run list --limit 1 --workflow="Deploy to Hetzner"
```
Wait for success, then verify the deploy landed rather than trusting the tick:
```bash
ssh root@bbs.uprough.net 'docker exec amiexpress-bbs cat /app/.git-sha; docker exec amiexpress-bbs printenv DOOR_SERVER_URL'
```

- [ ] **Step 4: Verify the proxy end to end from OUTSIDE the host**

```bash
for p in health "files/ACC-V103.LHA" "diz/ACC-V103.LHA" "doc/ACC-V103.LHA"; do
  a=$(curl -s "https://bbs.uprough.net/api/door-repo/$p" | md5sum | cut -c1-32)
  b=$(curl -s "https://doors.uprough.net/api/door-repo/$p" | md5sum | cut -c1-32)
  [ "$a" = "$b" ] && echo "  [MATCH] $p" || echo "  [DIFFER] $p bbs=$a doors=$b"
done
curl -sI https://bbs.uprough.net/api/door-repo/archive/ACC-V103.LHA | grep -i "x-archive-md5\|content-length"
curl -s -o /dev/null -w "304 path: %{http_code}\n" -H 'If-None-Match: "c3300-t1787029906"' https://bbs.uprough.net/api/door-repo/manifest
```
Expected: every per-archive endpoint matches the door server exactly, the archive checksum header survives the proxy, and a conditional GET still returns 304.

- [ ] **Step 5: Verify the C door still works, because it is the client that matters**

Ask the human to run DOORREPO on the live BBS and browse the catalog. That door reaches the API over HTTP with `RepoHost=bbs.uprough.net`; it is now talking to the door server through the proxy without knowing it. Do NOT drive the BBS session yourself - arm log capture and hand over a short script, as this project does.

- [ ] **Step 6: Commit the handoff update**

```bash
git add handoff.md docker-compose.yml
git commit -m "docs(handoff): the BBS now proxies the door-repo API to the door server"
```

---

### Task 8: Drop the BBS's catalog tables - LAST, and only after a live confirmation

**Files:**
- Delete: `web/backend/src/doors/door-catalog.service.ts`, `web/backend/src/doors/door-repo-manifest.ts`, `web/backend/src/doors/door-repo-checksums.ts`
- Delete: the corresponding suites under `web/backend/tests/doors/`
- Create: `dev/scripts/drop-bbs-catalog-tables.ts`

**Interfaces:**
- Consumes: a live BBS that has been serving through the proxy successfully.
- Produces: `dropBbsCatalogTables(dbFile: string): { droppedCatalog: number; droppedFiles: number }`.

**STOP - this task needs explicit human approval before Step 3 runs against anything live.** It deletes 3300 rows and 58400 file rows from the BBS's database. The door server holds the authoritative copy, and a database backup must exist first.

- [ ] **Step 1: Confirm nothing still reads the tables**

```bash
grep -rn "door_catalog" web/backend/src Doors --include='*.ts' | grep -v '/dist/' | grep -v 'door-installs'
```
Expected: hits only inside the three modules being deleted. Any other hit blocks this task.

- [ ] **Step 2: Delete the modules and their suites, run the whole backend suite**

```bash
git rm web/backend/src/doors/door-catalog.service.ts web/backend/src/doors/door-repo-manifest.ts web/backend/src/doors/door-repo-checksums.ts
git rm web/backend/tests/doors/strip-archive-on-server.test.ts web/backend/tests/doors/delete-catalog-entry.test.ts web/backend/tests/doors/resolve-archive-path.test.ts
cd web/backend && npx tsc --noEmit && npx jest --config dev-scripts/jest.config.ts --rootDir . --ci 2>&1 | tail -5
```
Expected: type-check clean and the suite green. A compile error here means something still depends on the catalog - fix that before going further, do not delete more.

- [ ] **Step 3: Write the drop script (do not run it yet)**

```typescript
/**
 * Drops the BBS's copy of the door catalog.
 *
 * The authoritative catalog lives in the door server; this BBS has been
 * serving through the proxy since phase 2, so these rows are read by nothing.
 * Deliberately last, deliberately separate, and deliberately requiring an
 * explicit confirmation argument: it removes 3300 catalog rows and 58400
 * file rows.
 */
import Database from 'better-sqlite3';

export interface DropCounts {
  droppedCatalog: number;
  droppedFiles: number;
}

export function dropBbsCatalogTables(dbFile: string): DropCounts {
  const db = new Database(dbFile);
  try {
    const count = (t: string): number => {
      try {
        return (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
      } catch {
        return 0;
      }
    };
    const droppedCatalog = count('door_catalog');
    const droppedFiles = count('door_catalog_files');
    db.exec('DROP TABLE IF EXISTS door_catalog_files');
    db.exec('DROP TABLE IF EXISTS door_catalog');
    return { droppedCatalog, droppedFiles };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const [target, confirm] = process.argv.slice(2);
  if (!target || confirm !== '--yes-drop-the-catalog') {
    console.error('[ERROR] usage: drop-bbs-catalog-tables.ts <database.sqlite> --yes-drop-the-catalog');
    process.exit(1);
  }
  const counts = dropBbsCatalogTables(target);
  console.log(`[OK] dropped ${counts.droppedCatalog} catalog rows and ${counts.droppedFiles} file rows`);
}
```

- [ ] **Step 4: Test it against a copy**

```typescript
// web/backend/tests/doors/drop-bbs-catalog-tables.test.ts
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { dropBbsCatalogTables } from '../../../../dev/scripts/drop-bbs-catalog-tables';

it('drops both catalog tables and reports what it removed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drop-'));
  const f = path.join(dir, 'bbs.db');
  const db = new Database(f);
  db.exec(`CREATE TABLE door_catalog (id TEXT); CREATE TABLE door_catalog_files (catalog_id TEXT);
           CREATE TABLE door_installs (id TEXT);
           INSERT INTO door_catalog VALUES ('a'); INSERT INTO door_catalog_files VALUES ('a');`);
  db.close();
  const counts = dropBbsCatalogTables(f);
  expect(counts).toEqual({ droppedCatalog: 1, droppedFiles: 1 });
  const check = new Database(f, { readonly: true });
  const tables = check.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    .map((r) => (r as { name: string }).name);
  check.close();
  fs.rmSync(dir, { recursive: true, force: true });
  expect(tables).not.toContain('door_catalog');
  expect(tables).toContain('door_installs');
});
```

- [ ] **Step 5: STOP. Get explicit approval, back up, then run it on live**

```bash
# only after a human says go
ssh root@bbs.uprough.net 'docker exec amiexpress-bbs sh -lc "sqlite3 /app/data/db/amiexpress.db \".backup /tmp/pre-drop.db\"" && docker cp amiexpress-bbs:/tmp/pre-drop.db /root/backups/amiexpress-pre-catalog-drop-$(date +%Y%m%d-%H%M%S).db'
```
Then run the backfill (Task 2) if it has not run on live yet, THEN the drop, then confirm the BBS still serves and DOORMAN still shows installed doors.

- [ ] **Step 6: Commit**

```bash
git add dev/scripts/drop-bbs-catalog-tables.ts web/backend/tests/doors/drop-bbs-catalog-tables.test.ts
git commit -m "feat(bbs): drop the local catalog tables, the door server owns them now"
```

---

## Phase 2 done when

- `/api/door-repo/*` on the BBS returns byte-identical responses to the door server for every per-archive endpoint, verified from off-host.
- The DoorRepo C door browses and installs through the BBS host without any config change.
- `door_installs` holds one row per door this node installed, and DOORMAN's "installed" markers still render correctly.
- `grep -rn "door_catalog" web/backend/src Doors --include='*.ts'` returns nothing outside deleted modules.
- The BBS's database no longer carries `door_catalog` / `door_catalog_files`, and a pre-drop backup exists on the host.

Phase 3 (the admin API, DOORMAN's owner mode over HTTP, and the corpus tooling's move) gets its own plan.
