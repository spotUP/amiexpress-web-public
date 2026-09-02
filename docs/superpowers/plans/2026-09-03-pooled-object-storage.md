# Pooled Object Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A board's file areas can live across several S3-compatible buckets - free tiers and paid volumes together - with local disk acting only as a cache, so callers, the admin and 68K doors all keep seeing ordinary files.

**Architecture:** A new `web/backend/src/storage/` subsystem: one `StorageBackend` interface with an S3 adapter, a `VolumeSet` of configured drives with quotas and budgets, a `Placement` policy that fills free volumes before paid ones, and a `FileCache` that materialises objects onto local disk. The cache sits ABOVE `amigafs` - the transfer handlers `await` it, and `DosLibrary.Open` blocks on the emulator's existing deasync pump - because `amigafs` is synchronous with 51 consumers and a fetch inside it would stall the web event loop.

**Tech Stack:** TypeScript (strict, no `any`), Node >= 18.8, jest + ts-jest, better-sqlite3, `@aws-sdk/client-s3` (new dependency, `web/backend`), `deasync` (already present), React + the config-app design system.

**Spec:** `docs/superpowers/specs/2026-09-03-pooled-object-storage-design.md`

## Global Constraints

- **The pool is authoritative; local disk is a cache.** One copy per file. The cache may never delete the only copy of anything.
- **`amigafs` is not modified.** No network I/O inside `web/backend/src/utils/amigafs.ts`. The cache is called by the two entry points that already know whether they are async.
- **Secrets never in `Drives.info`.** Key material lives in `Storage/<volume>.key`, `0600`, written the way `web/backend/src/doors/door-launch-token.ts:44-52` writes `DoorRepo.token` (including its tolerance for filesystems without POSIX modes). `BBS_STORAGE_<n>_SECRET` overrides it. The API never returns a secret.
- **Tooltype flags store their negative** (`DRIVE.n.NOCACHE`, never `DRIVE.n.CACHE`): a tooltype absent on every existing board must read as the safe default.
- **`Drives.info` stays AmiExpress-readable.** `DRIVE.n` keeps meaning "a drive", numbered from 1 with no gaps; sub-keys are additive.
- **Default off.** A board with no `s3://` drive constructs no S3 client, touches no cache, and behaves exactly as today. Every task must keep that true.
- **TypeScript strict, no `any`.** Exported types for everything crossing a module boundary.
- **No emojis anywhere.** BBS output uses ASCII tokens (`[OK]`, `[ERROR]`); the admin uses lucide-react icons.
- **Tests live under `web/backend/tests/**` so the normal glob runs them.** Verify with `npm test -- <path>` from `web/backend`. A suite outside the glob is decoration.
- **The config-app uses design system components only** (`components/ui/*`) - no raw Tailwind palette classes, no hand-rolled tables or dialogs; `design-system-usage.test.ts` enforces it.
- **Never `git add -A`.** Commit the named files only.

---

### Task 1: Volume configuration - parse the drives, resolve the secrets

**Files:**
- Create: `web/backend/src/storage/volume-config.ts`
- Create: `web/backend/tests/storage/volume-config.test.ts`

**Interfaces:**
- Consumes: `readTooltypeMap(filePath: string): Map<string, string>` from `web/backend/src/utils/info-file.util.ts:885`.
- Produces:
  ```ts
  export type VolumeClass = 'FREE' | 'PAID';
  export type EgressPosture = 'FREE' | 'METERED' | '3X';

  export interface StorageVolume {
    driveNumber: number;          // DRIVE.n, 1-based
    kind: 'local' | 's3';
    path: string;                 // local: the directory. s3: the bucket name.
    endpoint?: string;
    region?: string;
    quotaBytes?: number;          // undefined = unbounded (a local disk)
    egress: EgressPosture;
    volumeClass: VolumeClass;
    retentionDays?: number;
    keyId?: string;
  }

  export function parseVolumes(bbsRoot: string): StorageVolume[];
  export function parseQuota(text: string): number;          // '10G' -> 10737418240
  export function readVolumeSecret(bbsRoot: string, driveNumber: number): string | null;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// web/backend/tests/storage/volume-config.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseVolumes, parseQuota, readVolumeSecret } from '../../src/storage/volume-config';

function boardWith(drivesInfoTooltypes: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'volcfg-'));
  // parseInfoFile reads a real .info; the util's writer is what makes one.
  const { applyTooltypes } = require('../../src/utils/info-file.util');
  applyTooltypes(
    path.join(root, 'Drives.info'),
    drivesInfoTooltypes.map((line) => {
      const eq = line.indexOf('=');
      return [line.slice(0, eq), line.slice(eq + 1)] as const;
    })
  );
  return root;
}

describe('parseQuota', () => {
  it('reads the suffixes a sysop actually types', () => {
    expect(parseQuota('10G')).toBe(10 * 1024 ** 3);
    expect(parseQuota('2T')).toBe(2 * 1024 ** 4);
    expect(parseQuota('512M')).toBe(512 * 1024 ** 2);
    expect(parseQuota('1024')).toBe(1024);
  });

  it('rejects nonsense rather than guessing', () => {
    expect(() => parseQuota('lots')).toThrow(/quota/i);
  });
});

describe('parseVolumes', () => {
  it('reads a plain local board exactly as before', () => {
    const root = boardWith(['DRIVE.1=BBS:Files']);
    const vols = parseVolumes(root);
    expect(vols).toHaveLength(1);
    expect(vols[0].kind).toBe('local');
    expect(vols[0].path).toBe('BBS:Files');
    expect(vols[0].quotaBytes).toBeUndefined();
  });

  it('reads an s3 drive with its sub-keys', () => {
    const root = boardWith([
      'DRIVE.1=BBS:Files',
      'DRIVE.2=s3://uprough-cold',
      'DRIVE.2.ENDPOINT=https://s3.eu-central-003.backblazeb2.com',
      'DRIVE.2.REGION=eu-central-003',
      'DRIVE.2.QUOTA=10G',
      'DRIVE.2.EGRESS=3X',
      'DRIVE.2.CLASS=FREE',
      'DRIVE.2.KEYID=00512abc',
    ]);
    const vols = parseVolumes(root);
    expect(vols).toHaveLength(2);
    expect(vols[1]).toMatchObject({
      driveNumber: 2,
      kind: 's3',
      path: 'uprough-cold',
      endpoint: 'https://s3.eu-central-003.backblazeb2.com',
      quotaBytes: 10 * 1024 ** 3,
      egress: '3X',
      volumeClass: 'FREE',
      keyId: '00512abc',
    });
  });

  it('defaults an s3 drive to PAID and METERED, because assuming free is the expensive mistake', () => {
    const root = boardWith(['DRIVE.1=s3://somebucket']);
    const [vol] = parseVolumes(root);
    expect(vol.volumeClass).toBe('PAID');
    expect(vol.egress).toBe('METERED');
  });

  it('stops at the first gap, the way express.e freeDiskSpace does', () => {
    const root = boardWith(['DRIVE.1=BBS:Files', 'DRIVE.3=s3://orphan']);
    expect(parseVolumes(root)).toHaveLength(1);
  });

  it('returns no volumes when Drives.info is absent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'volcfg-empty-'));
    expect(parseVolumes(root)).toEqual([]);
  });
});

describe('readVolumeSecret', () => {
  it('prefers the environment over the key file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'volsec-'));
    fs.mkdirSync(path.join(root, 'Storage'));
    fs.writeFileSync(path.join(root, 'Storage', '2.key'), 'from-file\n');
    process.env.BBS_STORAGE_2_SECRET = 'from-env';
    try {
      expect(readVolumeSecret(root, 2)).toBe('from-env');
    } finally {
      delete process.env.BBS_STORAGE_2_SECRET;
    }
  });

  it('reads the key file, trimming the newline', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'volsec2-'));
    fs.mkdirSync(path.join(root, 'Storage'));
    fs.writeFileSync(path.join(root, 'Storage', '2.key'), 'sekrit\n', { mode: 0o600 });
    expect(readVolumeSecret(root, 2)).toBe('sekrit');
  });

  it('returns null when there is no secret anywhere', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'volsec3-'));
    expect(readVolumeSecret(root, 2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `web/backend`: `npm test -- tests/storage/volume-config.test.ts`
Expected: FAIL - "Cannot find module '../../src/storage/volume-config'".

- [ ] **Step 3: Write minimal implementation**

```ts
// web/backend/src/storage/volume-config.ts
/**
 * The drives a board stores files on, read from Drives.info.
 *
 * DRIVE.n keeps the meaning express.e:17400-17424 gave it - a place with a
 * capacity - and the sub-keys are additive, so a real AmiExpress binary still
 * reads this file. The SECRET is deliberately not here: Drives.info sits under
 * the board root where every door can read it and every backup carries it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { readTooltypeMap } from '../utils/info-file.util';

export type VolumeClass = 'FREE' | 'PAID';
export type EgressPosture = 'FREE' | 'METERED' | '3X';

export interface StorageVolume {
  driveNumber: number;
  kind: 'local' | 's3';
  path: string;
  endpoint?: string;
  region?: string;
  quotaBytes?: number;
  egress: EgressPosture;
  volumeClass: VolumeClass;
  retentionDays?: number;
  keyId?: string;
}

const UNITS: Record<string, number> = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };

export function parseQuota(text: string): number {
  const match = /^(\d+)([KMGT])?$/i.exec(text.trim());
  if (!match) throw new Error(`Unreadable quota "${text}" - expected a number with an optional K, M, G or T suffix`);
  const scale = match[2] ? UNITS[match[2].toUpperCase()] : 1;
  return Number(match[1]) * scale;
}

export function parseVolumes(bbsRoot: string): StorageVolume[] {
  const drivesInfo = path.join(bbsRoot, 'Drives.info');
  if (!fs.existsSync(drivesInfo)) return [];

  const tools = readTooltypeMap(drivesInfo);
  const volumes: StorageVolume[] = [];

  for (let n = 1; n <= 50; n++) {
    const target = tools.get(`DRIVE.${n}`);
    if (!target) break; // A gap ends the list, exactly as freeDiskSpace() does.

    const isS3 = target.toLowerCase().startsWith('s3://');
    const quota = tools.get(`DRIVE.${n}.QUOTA`);
    const egress = tools.get(`DRIVE.${n}.EGRESS`)?.toUpperCase();
    const cls = tools.get(`DRIVE.${n}.CLASS`)?.toUpperCase();
    const retention = tools.get(`DRIVE.${n}.RETENTION`);

    volumes.push({
      driveNumber: n,
      kind: isS3 ? 's3' : 'local',
      path: isS3 ? target.slice('s3://'.length) : target,
      endpoint: tools.get(`DRIVE.${n}.ENDPOINT`),
      region: tools.get(`DRIVE.${n}.REGION`),
      quotaBytes: quota ? parseQuota(quota) : undefined,
      // An unmarked bucket is assumed to cost money and meter egress: guessing
      // "free" is the guess that shows up on an invoice.
      egress: egress === 'FREE' || egress === '3X' ? egress : 'METERED',
      volumeClass: cls === 'FREE' ? 'FREE' : 'PAID',
      retentionDays: retention ? Number(/^\d+/.exec(retention)?.[0] ?? '0') || undefined : undefined,
      keyId: tools.get(`DRIVE.${n}.KEYID`),
    });
  }

  return volumes;
}

export function readVolumeSecret(bbsRoot: string, driveNumber: number): string | null {
  const fromEnv = process.env[`BBS_STORAGE_${driveNumber}_SECRET`];
  if (fromEnv) return fromEnv;

  const keyPath = path.join(bbsRoot, 'Storage', `${driveNumber}.key`);
  if (!fs.existsSync(keyPath)) return null;
  return fs.readFileSync(keyPath, 'utf8').trim() || null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/volume-config.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/storage/volume-config.ts web/backend/tests/storage/volume-config.test.ts
git commit -m "feat(storage): read the drives, and keep the secret out of Drives.info"
```

---

### Task 2: The StorageBackend interface, a fake, and the local passthrough

**Files:**
- Create: `web/backend/src/storage/storage-backend.ts`
- Create: `web/backend/src/storage/local-backend.ts`
- Create: `web/backend/tests/storage/fake-backend.ts` (the shared test double, not a suite)
- Create: `web/backend/tests/storage/local-backend.test.ts`

**Interfaces:**
- Consumes: `StorageVolume` from Task 1.
- Produces:
  ```ts
  export interface ObjectHead { key: string; size: number; mtime: Date; }

  export interface StorageBackend {
    readonly driveNumber: number;
    head(key: string): Promise<ObjectHead | null>;
    get(key: string): Promise<Buffer>;
    put(key: string, body: Buffer): Promise<void>;
    delete(key: string): Promise<void>;
    list(prefix: string): Promise<ObjectHead[]>;
  }

  export class StorageUnavailableError extends Error {
    constructor(public readonly driveNumber: number, message: string);
  }
  export class StorageQuotaError extends Error { }
  ```
  `FakeBackend` (tests only) adds: `constructor(opts: { driveNumber: number; quotaBytes?: number; requestBudget?: number })`, counters `gets`, `puts`, `heads`, `lists`, `requests`, `egressBytes`, and fault switches `down: boolean`, `rateLimited: boolean`, `gone: boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// web/backend/tests/storage/local-backend.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalBackend } from '../../src/storage/local-backend';
import { StorageQuotaError } from '../../src/storage/storage-backend';
import { FakeBackend } from './fake-backend';

describe('LocalBackend', () => {
  it('round-trips an object through a real directory', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localback-'));
    const backend = new LocalBackend(1, root);

    await backend.put('Files/DEMO.LHA', Buffer.from('payload'));
    expect((await backend.get('Files/DEMO.LHA')).toString()).toBe('payload');

    const head = await backend.head('Files/DEMO.LHA');
    expect(head?.size).toBe(7);

    expect((await backend.list('Files/')).map((o) => o.key)).toEqual(['Files/DEMO.LHA']);

    await backend.delete('Files/DEMO.LHA');
    expect(await backend.head('Files/DEMO.LHA')).toBeNull();
  });

  it('answers head with null rather than throwing for a missing object', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localback2-'));
    expect(await new LocalBackend(1, root).head('nope')).toBeNull();
  });
});

describe('FakeBackend', () => {
  it('counts every call, so a test can prove a fetch happened once', async () => {
    const fake = new FakeBackend({ driveNumber: 2 });
    await fake.put('a', Buffer.from('x'));
    await fake.get('a');
    await fake.get('a');
    expect(fake.puts).toBe(1);
    expect(fake.gets).toBe(2);
    expect(fake.requests).toBe(3);
  });

  it('refuses a put past its quota', async () => {
    const fake = new FakeBackend({ driveNumber: 2, quotaBytes: 4 });
    await expect(fake.put('a', Buffer.alloc(5))).rejects.toBeInstanceOf(StorageQuotaError);
  });

  it('fails every call while down', async () => {
    const fake = new FakeBackend({ driveNumber: 2 });
    await fake.put('a', Buffer.from('x'));
    fake.down = true;
    await expect(fake.get('a')).rejects.toThrow(/unavailable/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/local-backend.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// web/backend/src/storage/storage-backend.ts
/**
 * What every storage volume can do, and nothing more.
 *
 * Five calls, because five is what the board needs and every extra one is
 * another thing an adapter for the next provider has to get right.
 */
export interface ObjectHead {
  key: string;
  size: number;
  mtime: Date;
}

export interface StorageBackend {
  readonly driveNumber: number;
  head(key: string): Promise<ObjectHead | null>;
  get(key: string): Promise<Buffer>;
  put(key: string, body: Buffer): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<ObjectHead[]>;
}

/**
 * The volume is there but cannot answer right now - down, rate-limited, out of
 * requests. NEVER to be turned into "file not found" by a caller: a sysop who
 * is shown "not found" deletes the catalog row for a file that was fine.
 */
export class StorageUnavailableError extends Error {
  constructor(public readonly driveNumber: number, message: string) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export class StorageQuotaError extends Error {
  constructor(public readonly driveNumber: number, message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}
```

```ts
// web/backend/src/storage/local-backend.ts
import * as fs from 'fs';
import * as path from 'path';
import type { ObjectHead, StorageBackend } from './storage-backend';

/** A drive that is just a directory - what every board has today. */
export class LocalBackend implements StorageBackend {
  constructor(public readonly driveNumber: number, private readonly root: string) {}

  private full(key: string): string {
    return path.join(this.root, key);
  }

  async head(key: string): Promise<ObjectHead | null> {
    const full = this.full(key);
    if (!fs.existsSync(full)) return null;
    const st = fs.statSync(full);
    return { key, size: st.size, mtime: st.mtime };
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFileSync(this.full(key));
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.full(key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }

  async delete(key: string): Promise<void> {
    const full = this.full(key);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }

  async list(prefix: string): Promise<ObjectHead[]> {
    const dir = path.join(this.root, path.dirname(prefix === '' ? '.' : prefix));
    if (!fs.existsSync(dir)) return [];
    const out: ObjectHead[] = [];
    for (const name of fs.readdirSync(dir)) {
      const key = path.join(path.dirname(prefix), name).replace(/\\/g, '/');
      if (!key.startsWith(prefix)) continue;
      const st = fs.statSync(path.join(this.root, key));
      if (st.isFile()) out.push({ key, size: st.size, mtime: st.mtime });
    }
    return out;
  }
}
```

```ts
// web/backend/tests/storage/fake-backend.ts
import type { ObjectHead, StorageBackend } from '../../src/storage/storage-backend';
import { StorageQuotaError, StorageUnavailableError } from '../../src/storage/storage-backend';

/**
 * The backend every storage test runs against - no network, and it models the
 * things that actually break: a quota, a monthly request budget, egress, and a
 * volume that is down, throttled or gone for good.
 */
export class FakeBackend implements StorageBackend {
  readonly driveNumber: number;
  private readonly objects = new Map<string, Buffer>();
  private readonly quotaBytes?: number;
  private readonly requestBudget?: number;

  gets = 0;
  puts = 0;
  heads = 0;
  lists = 0;
  requests = 0;
  egressBytes = 0;

  down = false;
  rateLimited = false;
  gone = false;

  constructor(opts: { driveNumber: number; quotaBytes?: number; requestBudget?: number }) {
    this.driveNumber = opts.driveNumber;
    this.quotaBytes = opts.quotaBytes;
    this.requestBudget = opts.requestBudget;
  }

  get usedBytes(): number {
    let total = 0;
    for (const body of this.objects.values()) total += body.length;
    return total;
  }

  private charge(): void {
    if (this.gone) throw new StorageUnavailableError(this.driveNumber, 'volume is gone');
    if (this.down) throw new StorageUnavailableError(this.driveNumber, 'volume is unavailable');
    if (this.rateLimited) throw new StorageUnavailableError(this.driveNumber, 'volume is rate limited');
    this.requests++;
    if (this.requestBudget !== undefined && this.requests > this.requestBudget) {
      throw new StorageUnavailableError(this.driveNumber, 'request budget exhausted');
    }
  }

  async head(key: string): Promise<ObjectHead | null> {
    this.charge();
    this.heads++;
    const body = this.objects.get(key);
    return body ? { key, size: body.length, mtime: new Date(0) } : null;
  }

  async get(key: string): Promise<Buffer> {
    this.charge();
    this.gets++;
    const body = this.objects.get(key);
    if (!body) throw new Error(`no such object: ${key}`);
    this.egressBytes += body.length;
    return body;
  }

  async put(key: string, body: Buffer): Promise<void> {
    this.charge();
    if (this.quotaBytes !== undefined && this.usedBytes + body.length > this.quotaBytes) {
      throw new StorageQuotaError(this.driveNumber, 'quota exceeded');
    }
    this.puts++;
    this.objects.set(key, Buffer.from(body));
  }

  async delete(key: string): Promise<void> {
    this.charge();
    this.objects.delete(key);
  }

  async list(prefix: string): Promise<ObjectHead[]> {
    this.charge();
    this.lists++;
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, body]) => ({ key, size: body.length, mtime: new Date(0) }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/local-backend.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/storage/storage-backend.ts web/backend/src/storage/local-backend.ts web/backend/tests/storage/fake-backend.ts web/backend/tests/storage/local-backend.test.ts
git commit -m "feat(storage): the backend interface, a local passthrough and the fake every test runs on"
```

---

### Task 3: The S3 adapter

**Files:**
- Create: `web/backend/src/storage/s3-backend.ts`
- Create: `web/backend/tests/storage/s3-backend.test.ts`
- Modify: `web/backend/package.json` (add `@aws-sdk/client-s3`)

**Interfaces:**
- Consumes: `StorageBackend`, `ObjectHead`, `StorageUnavailableError` (Task 2); `StorageVolume` (Task 1).
- Produces:
  ```ts
  export interface S3ClientLike {
    send(command: unknown): Promise<unknown>;
  }
  export function createS3Backend(volume: StorageVolume, secret: string): S3Backend;
  export class S3Backend implements StorageBackend {
    constructor(driveNumber: number, bucket: string, client: S3ClientLike);
  }
  ```
  The client is injected so tests never touch the network; `createS3Backend` is the only place an `S3Client` is constructed.

- [ ] **Step 1: Write the failing test**

```ts
// web/backend/tests/storage/s3-backend.test.ts
import { S3Backend } from '../../src/storage/s3-backend';
import { StorageUnavailableError } from '../../src/storage/storage-backend';

interface SentCommand { name: string; input: Record<string, unknown>; }

function clientReturning(handler: (cmd: SentCommand) => unknown) {
  const sent: SentCommand[] = [];
  return {
    sent,
    client: {
      async send(command: unknown): Promise<unknown> {
        const cmd = { name: command!.constructor.name, input: (command as { input: Record<string, unknown> }).input };
        sent.push(cmd);
        return handler(cmd);
      },
    },
  };
}

describe('S3Backend', () => {
  it('puts an object into the configured bucket under the given key', async () => {
    const { client, sent } = clientReturning(() => ({}));
    await new S3Backend(2, 'uprough-cold', client).put('Files/DEMO.LHA', Buffer.from('x'));
    expect(sent[0].name).toBe('PutObjectCommand');
    expect(sent[0].input).toMatchObject({ Bucket: 'uprough-cold', Key: 'Files/DEMO.LHA' });
  });

  it('reads a body back as a Buffer', async () => {
    const { client } = clientReturning(() => ({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    }));
    const body = await new S3Backend(2, 'b', client).get('k');
    expect([...body]).toEqual([1, 2, 3]);
  });

  it('turns a missing object into null on head, not an exception', async () => {
    const { client } = clientReturning(() => {
      const err = new Error('NotFound') as Error & { name: string };
      err.name = 'NotFound';
      throw err;
    });
    expect(await new S3Backend(2, 'b', client).head('k')).toBeNull();
  });

  it('reports a throttled or unreachable volume as unavailable, never as missing', async () => {
    const { client } = clientReturning(() => {
      const err = new Error('SlowDown') as Error & { name: string };
      err.name = 'SlowDown';
      throw err;
    });
    await expect(new S3Backend(2, 'b', client).get('k')).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it('pages a listing until the bucket stops truncating it', async () => {
    let call = 0;
    const { client } = clientReturning(() => {
      call++;
      return call === 1
        ? { Contents: [{ Key: 'a', Size: 1, LastModified: new Date(0) }], IsTruncated: true, NextContinuationToken: 't' }
        : { Contents: [{ Key: 'b', Size: 2, LastModified: new Date(0) }], IsTruncated: false };
    });
    const heads = await new S3Backend(2, 'b', client).list('');
    expect(heads.map((h) => h.key)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/s3-backend.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Install the dependency and write the implementation**

```bash
cd web/backend && npm install @aws-sdk/client-s3 --save
```

```ts
// web/backend/src/storage/s3-backend.ts
/**
 * One adapter for every S3-compatible provider.
 *
 * Cloudflare R2, Backblaze B2, Storj, Scaleway, Oracle, Filebase, iDrive e2,
 * Wasabi, Hetzner and MinIO differ only in an endpoint and a region, so the
 * board needs no per-provider code. The client is injected because a test that
 * needs the network is a test nobody runs.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { StorageVolume } from './volume-config';
import type { ObjectHead, StorageBackend } from './storage-backend';
import { StorageUnavailableError } from './storage-backend';

export interface S3ClientLike {
  send(command: unknown): Promise<unknown>;
}

/** Errors that mean "ask again later", not "it is not there". */
const TRANSIENT = new Set([
  'SlowDown',
  'ThrottlingException',
  'RequestTimeout',
  'ServiceUnavailable',
  'InternalError',
  'TimeoutError',
  'NetworkingError',
]);

const MISSING = new Set(['NotFound', 'NoSuchKey']);

export class S3Backend implements StorageBackend {
  constructor(
    public readonly driveNumber: number,
    private readonly bucket: string,
    private readonly client: S3ClientLike
  ) {}

  private rethrow(error: unknown): never {
    const name = (error as { name?: string })?.name ?? '';
    if (TRANSIENT.has(name)) {
      throw new StorageUnavailableError(this.driveNumber, `drive ${this.driveNumber}: ${name}`);
    }
    throw error;
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const out = (await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      )) as { ContentLength?: number; LastModified?: Date };
      return { key, size: out.ContentLength ?? 0, mtime: out.LastModified ?? new Date(0) };
    } catch (error) {
      if (MISSING.has((error as { name?: string })?.name ?? '')) return null;
      this.rethrow(error);
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const out = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      )) as { Body?: { transformToByteArray(): Promise<Uint8Array> } };
      if (!out.Body) throw new Error(`empty body for ${key}`);
      return Buffer.from(await out.Body.transformToByteArray());
    } catch (error) {
      this.rethrow(error);
    }
  }

  async put(key: string, body: Buffer): Promise<void> {
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body }));
    } catch (error) {
      this.rethrow(error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      this.rethrow(error);
    }
  }

  async list(prefix: string): Promise<ObjectHead[]> {
    const out: ObjectHead[] = [];
    let token: string | undefined;
    try {
      do {
        const page = (await this.client.send(
          new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token })
        )) as {
          Contents?: Array<{ Key?: string; Size?: number; LastModified?: Date }>;
          IsTruncated?: boolean;
          NextContinuationToken?: string;
        };
        for (const item of page.Contents ?? []) {
          if (!item.Key) continue;
          out.push({ key: item.Key, size: item.Size ?? 0, mtime: item.LastModified ?? new Date(0) });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    } catch (error) {
      this.rethrow(error);
    }
    return out;
  }
}

export function createS3Backend(volume: StorageVolume, secret: string): S3Backend {
  if (!volume.keyId) throw new Error(`DRIVE.${volume.driveNumber} has no KEYID`);
  const client = new S3Client({
    endpoint: volume.endpoint,
    region: volume.region ?? 'auto',
    forcePathStyle: true, // MinIO and several free tiers require it; AWS tolerates it.
    credentials: { accessKeyId: volume.keyId, secretAccessKey: secret },
  });
  return new S3Backend(volume.driveNumber, volume.path, client as unknown as S3ClientLike);
}
```

**Size ceiling, stated rather than discovered:** a single `PutObjectCommand`
carries up to 5 GB, which is far above any file a BBS area holds. `put` throws a
plain `Error` naming the limit above that rather than silently truncating;
multipart is in the optional section at the end of this plan, not here.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/s3-backend.test.ts`
Expected: PASS, 5 tests. Then `npx tsc --noEmit` in `web/backend`: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/storage/s3-backend.ts web/backend/tests/storage/s3-backend.test.ts web/backend/package.json web/backend/package-lock.json
git commit -m "feat(storage): one S3 adapter for every provider in the pool"
```

---

### Task 4: The volume set and placement

**Files:**
- Create: `web/backend/src/storage/volume-set.ts`
- Create: `web/backend/tests/storage/placement.test.ts`

**Interfaces:**
- Consumes: `StorageVolume`, `parseVolumes`, `readVolumeSecret` (Task 1); `StorageBackend`, `StorageQuotaError` (Task 2); `createS3Backend` (Task 3).
- Produces:
  ```ts
  export interface VolumeState {
    volume: StorageVolume;
    backend: StorageBackend;
    usedBytes: number;
    requestsThisMonth: number;
    requestBudget?: number;
    egressBytesThisMonth: number;
    degraded: boolean;
  }

  export class VolumeSet {
    static fromBoard(bbsRoot: string): VolumeSet;
    constructor(states: VolumeState[]);
    readonly states: readonly VolumeState[];
    byNumber(driveNumber: number): VolumeState | undefined;
    freeBytes(): number;                       // pool total, for the upload gate
    place(sizeBytes: number, prefer?: VolumeClass): VolumeState;  // throws StorageQuotaError
    markDegraded(driveNumber: number, degraded: boolean): void;
  }
  ```

- [ ] **Step 1: Write the failing test**

```ts
// web/backend/tests/storage/placement.test.ts
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { StorageQuotaError } from '../../src/storage/storage-backend';
import { FakeBackend } from './fake-backend';
import type { StorageVolume, VolumeClass } from '../../src/storage/volume-config';

function state(
  driveNumber: number,
  opts: { quota: number; used?: number; cls?: VolumeClass; egress?: StorageVolume['egress']; degraded?: boolean; requests?: number }
): VolumeState {
  return {
    volume: {
      driveNumber,
      kind: 's3',
      path: `bucket${driveNumber}`,
      quotaBytes: opts.quota,
      egress: opts.egress ?? 'METERED',
      volumeClass: opts.cls ?? 'FREE',
    },
    backend: new FakeBackend({ driveNumber }),
    usedBytes: opts.used ?? 0,
    requestsThisMonth: opts.requests ?? 0,
    egressBytesThisMonth: 0,
    degraded: opts.degraded ?? false,
  };
}

describe('VolumeSet.freeBytes', () => {
  it('sums the pool, which is what freeDiskSpace() always meant', () => {
    const set = new VolumeSet([state(1, { quota: 100, used: 40 }), state(2, { quota: 50, used: 0 })]);
    expect(set.freeBytes()).toBe(110);
  });

  it('does not count a degraded volume as room', () => {
    const set = new VolumeSet([state(1, { quota: 100, used: 0, degraded: true }), state(2, { quota: 50 })]);
    expect(set.freeBytes()).toBe(50);
  });
});

describe('VolumeSet.place', () => {
  it('fills free volumes before paid ones', () => {
    const set = new VolumeSet([state(1, { quota: 100, cls: 'PAID' }), state(2, { quota: 100, cls: 'FREE' })]);
    expect(set.place(10).volume.driveNumber).toBe(2);
  });

  it('skips a volume without room for this file', () => {
    const set = new VolumeSet([state(1, { quota: 100, used: 95, cls: 'FREE' }), state(2, { quota: 100, cls: 'FREE' })]);
    expect(set.place(10).volume.driveNumber).toBe(2);
  });

  it('breaks a tie towards free egress', () => {
    const set = new VolumeSet([
      state(1, { quota: 100, cls: 'FREE', egress: 'METERED' }),
      state(2, { quota: 100, cls: 'FREE', egress: 'FREE' }),
    ]);
    expect(set.place(10).volume.driveNumber).toBe(2);
  });

  it('honours an area that prefers a paid volume', () => {
    const set = new VolumeSet([state(1, { quota: 100, cls: 'FREE' }), state(2, { quota: 100, cls: 'PAID' })]);
    expect(set.place(10, 'PAID').volume.driveNumber).toBe(2);
  });

  it('skips a volume that has spent its monthly request budget', () => {
    const set = new VolumeSet([
      state(1, { quota: 100, cls: 'FREE', requests: 50_000 }),
      state(2, { quota: 100, cls: 'PAID' }),
    ]);
    set.setRequestBudget(1, 50_000);
    expect(set.place(10).volume.driveNumber).toBe(2);
  });

  it('skips a degraded volume', () => {
    const set = new VolumeSet([state(1, { quota: 100, cls: 'FREE', degraded: true }), state(2, { quota: 100, cls: 'PAID' })]);
    expect(set.place(10).volume.driveNumber).toBe(2);
  });

  it('refuses when no volume has room, so the caller is told before the transfer starts', () => {
    const set = new VolumeSet([state(1, { quota: 10, used: 10 })]);
    expect(() => set.place(5)).toThrow(StorageQuotaError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/placement.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// web/backend/src/storage/volume-set.ts
/**
 * The drives, and which one a new object goes on.
 *
 * The pool's free space is the sum across volumes - the number
 * express.e:17400-17424 freeDiskSpace() produced from DRIVE.1..n, made real
 * again. Free tiers fill before paid ones so a sysop's money is spent last.
 */
import type { StorageVolume, VolumeClass } from './volume-config';
import { parseVolumes, readVolumeSecret } from './volume-config';
import type { StorageBackend } from './storage-backend';
import { StorageQuotaError } from './storage-backend';
import { LocalBackend } from './local-backend';
import { createS3Backend } from './s3-backend';

export interface VolumeState {
  volume: StorageVolume;
  backend: StorageBackend;
  usedBytes: number;
  requestsThisMonth: number;
  /** Undefined means the provider publishes no monthly request cap. */
  requestBudget?: number;
  egressBytesThisMonth: number;
  degraded: boolean;
}

export class VolumeSet {
  constructor(public readonly states: readonly VolumeState[]) {}

  static fromBoard(bbsRoot: string): VolumeSet {
    const states: VolumeState[] = [];
    for (const volume of parseVolumes(bbsRoot)) {
      if (volume.kind === 'local') {
        states.push(VolumeSet.blank(volume, new LocalBackend(volume.driveNumber, volume.path)));
        continue;
      }
      const secret = readVolumeSecret(bbsRoot, volume.driveNumber);
      if (!secret) {
        // A bucket with no key is a configuration mistake, not a reason to
        // refuse to boot: the board runs, the volume shows degraded.
        console.warn(`[storage] DRIVE.${volume.driveNumber} has no secret; volume disabled`);
        continue;
      }
      states.push(VolumeSet.blank(volume, createS3Backend(volume, secret)));
    }
    return new VolumeSet(states);
  }

  private static blank(volume: StorageVolume, backend: StorageBackend): VolumeState {
    return { volume, backend, usedBytes: 0, requestsThisMonth: 0, egressBytesThisMonth: 0, degraded: false };
  }

  byNumber(driveNumber: number): VolumeState | undefined {
    return this.states.find((s) => s.volume.driveNumber === driveNumber);
  }

  /**
   * Oracle's free tier allows 50,000 requests a MONTH, which binds long before
   * its 10 GB does. A volume at its ceiling is not a place to put a new file.
   */
  setRequestBudget(driveNumber: number, budget: number): void {
    const state = this.byNumber(driveNumber);
    if (state) state.requestBudget = budget;
  }

  private outOfRequests(state: VolumeState): boolean {
    return state.requestBudget !== undefined && state.requestsThisMonth >= state.requestBudget;
  }

  markDegraded(driveNumber: number, degraded: boolean): void {
    const state = this.byNumber(driveNumber);
    if (state) state.degraded = degraded;
  }

  private roomOn(state: VolumeState): number {
    if (state.degraded || this.outOfRequests(state)) return 0;
    if (state.volume.quotaBytes === undefined) return Number.MAX_SAFE_INTEGER;
    return Math.max(0, state.volume.quotaBytes - state.usedBytes);
  }

  freeBytes(): number {
    return this.states.reduce((total, state) => {
      const room = this.roomOn(state);
      return total + (room === Number.MAX_SAFE_INTEGER ? 0 : room);
    }, 0);
  }

  place(sizeBytes: number, prefer?: VolumeClass): VolumeState {
    const candidates = this.states.filter((s) => this.roomOn(s) >= sizeBytes);
    if (candidates.length === 0) {
      throw new StorageQuotaError(0, 'no volume in the pool has room for this file');
    }

    const rank = (s: VolumeState): number => {
      const classRank = prefer
        ? s.volume.volumeClass === prefer ? 0 : 1
        : s.volume.volumeClass === 'FREE' ? 0 : 1;
      const egressRank = s.volume.egress === 'FREE' ? 0 : s.volume.egress === '3X' ? 1 : 2;
      return classRank * 10 + egressRank;
    };

    return [...candidates].sort((a, b) => rank(a) - rank(b) || a.volume.driveNumber - b.volume.driveNumber)[0];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/placement.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/storage/volume-set.ts web/backend/tests/storage/placement.test.ts
git commit -m "feat(storage): pool the drives, and spend the free ones first"
```

---

### Task 5: Catalog columns - which volume holds which object

**Files:**
- Modify: `web/backend/src/database.ts` (migration beside the existing `PRAGMA table_info` block at `:365-390`; `file_entries` schema at `:999`)
- Modify: `web/backend/src/database/types.ts:115` (`FileArea`), and `FileEntry` below it
- Create: `web/backend/tests/database/storage-columns.test.ts`

**Interfaces:**
- Produces: `FileEntry.storageVolume?: number`, `FileEntry.objectKey?: string`, `FileArea.storageVolume?: number`, `FileArea.volumeClassPref?: 'FREE' | 'PAID'`. A row with no `storageVolume` is local - which is every row on every existing board. Also on the file repository:
  ```ts
  recordLocation(filename: string, areaId: number, driveNumber: number, objectKey: string): void;
  entriesOnVolume(driveNumber: number): FileEntry[];   // the admin's "what is on this volume"
  ```

- [ ] **Step 1: Write the failing test**

```ts
// web/backend/tests/database/storage-columns.test.ts
import Database from 'better-sqlite3';
import { Database as BbsDatabase } from '../../src/database';

describe('storage columns', () => {
  it('adds storage_volume and object_key to file_entries, defaulting to local', () => {
    const db = new BbsDatabase(':memory:');
    const cols = (db.raw().prepare('PRAGMA table_info(file_entries)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('storage_volume');
    expect(cols).toContain('object_key');

    db.raw()
      .prepare("INSERT INTO file_areas (name, description, path, conferenceid) VALUES ('A', '', '/tmp', 1)")
      .run();
    db.raw()
      .prepare("INSERT INTO file_entries (filename, size, uploader, areaid) VALUES ('DEMO.LHA', 1, 'sysop', 1)")
      .run();
    const row = db.raw().prepare('SELECT storage_volume, object_key FROM file_entries').get() as {
      storage_volume: number | null;
      object_key: string | null;
    };
    expect(row.storage_volume).toBeNull();
    expect(row.object_key).toBeNull();
  });

  it('adds storage_volume and volume_class_pref to file_areas', () => {
    const db = new BbsDatabase(':memory:');
    const cols = (db.raw().prepare('PRAGMA table_info(file_areas)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('storage_volume');
    expect(cols).toContain('volume_class_pref');
  });
});
```

If `Database` exposes no `raw()`, use the existing accessor this repo already uses in `web/backend/tests/database/*.test.ts` - read one of those suites first and follow it rather than adding an accessor.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/database/storage-columns.test.ts`
Expected: FAIL - "expected [...] to contain storage_volume".

- [ ] **Step 3: Write minimal implementation**

In `database.ts`, beside the existing column migrations (the `PRAGMA table_info(users)` block at `:365`), add the same idiom for the two file tables:

```ts
      // Which volume holds a file, and under what key. NULL means local disk,
      // which is every row on every board that has not configured a bucket.
      const fileEntryCols = (this.db.prepare('PRAGMA table_info(file_entries)').all() as any[]).map((c) => c.name);
      if (!fileEntryCols.includes('storage_volume')) {
        this.db.exec('ALTER TABLE file_entries ADD COLUMN storage_volume INTEGER');
console.log('✓ Added storage_volume column to file_entries');
      }
      if (!fileEntryCols.includes('object_key')) {
        this.db.exec('ALTER TABLE file_entries ADD COLUMN object_key TEXT');
console.log('✓ Added object_key column to file_entries');
      }

      const fileAreaCols = (this.db.prepare('PRAGMA table_info(file_areas)').all() as any[]).map((c) => c.name);
      if (!fileAreaCols.includes('storage_volume')) {
        this.db.exec('ALTER TABLE file_areas ADD COLUMN storage_volume INTEGER');
console.log('✓ Added storage_volume column to file_areas');
      }
      if (!fileAreaCols.includes('volume_class_pref')) {
        this.db.exec('ALTER TABLE file_areas ADD COLUMN volume_class_pref TEXT');
console.log('✓ Added volume_class_pref column to file_areas');
      }
```

Add the same four columns to the `CREATE TABLE` statements at `:982` and `:999` so a fresh database has them without a migration, and extend the two interfaces in `types.ts`:

```ts
export interface FileArea {
  // ... existing fields ...
  /** The drive this area's files live on. Undefined means local disk. */
  storageVolume?: number;
  /** Which class of volume new files here prefer. */
  volumeClassPref?: 'FREE' | 'PAID';
}

export interface FileEntry {
  // ... existing fields ...
  /** The drive holding this object; undefined means local disk. */
  storageVolume?: number;
  /** The object key on that drive. */
  objectKey?: string;
}
```

Map both in whichever row mapper builds these objects (follow `mapDriveRow` at `config-repository.ts:1389` for the naming style).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/database/storage-columns.test.ts` then the whole database folder: `npm test -- tests/database`
Expected: PASS, and no existing database suite regresses.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/database.ts web/backend/src/database/types.ts web/backend/tests/database/storage-columns.test.ts
git commit -m "feat(storage): the catalog records which volume holds a file"
```

---

### Task 6: The name index - case-insensitive lookup without a listing per call

**Files:**
- Create: `web/backend/src/storage/name-index.ts`
- Create: `web/backend/tests/storage/name-index.test.ts`

**Interfaces:**
- Consumes: `StorageBackend` (Task 2).
- Produces:
  ```ts
  export class NameIndex {
    constructor(private backend: StorageBackend, private prefix: string);
    resolve(name: string): Promise<string | null>;   // 'file.lha' -> 'Files/FILE.LHA'
    note(key: string): void;                         // after a put
    forget(key: string): void;                       // after a delete
    refresh(): Promise<void>;
  }
  ```

**Why this exists:** `amigafs.resolvePath` finds `FILE.LHA` when the caller typed `file.lha` by listing the directory. S3 is case-sensitive and a bucket cannot be walked per lookup - Oracle's free tier allows 50,000 requests a month, which one busy evening of listings would spend. The index lists once and is maintained on write.

- [ ] **Step 1: Write the failing test**

```ts
// web/backend/tests/storage/name-index.test.ts
import { NameIndex } from '../../src/storage/name-index';
import { FakeBackend } from './fake-backend';

describe('NameIndex', () => {
  it('resolves the caller spelling to the real key', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/FILE.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');
    expect(await index.resolve('file.lha')).toBe('Files/FILE.LHA');
  });

  it('lists once, however many lookups follow', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/A.LHA', Buffer.from('x'));
    await backend.put('Files/B.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');
    await index.resolve('a.lha');
    await index.resolve('b.lha');
    await index.resolve('a.lha');
    expect(backend.lists).toBe(1);
  });

  it('knows about a new object without re-listing', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    const index = new NameIndex(backend, 'Files/');
    await index.resolve('anything');   // primes the index
    await backend.put('Files/NEW.LHA', Buffer.from('x'));
    index.note('Files/NEW.LHA');
    expect(await index.resolve('new.lha')).toBe('Files/NEW.LHA');
    expect(backend.lists).toBe(1);
  });

  it('forgets a deleted object', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/OLD.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');
    expect(await index.resolve('old.lha')).toBe('Files/OLD.LHA');
    index.forget('Files/OLD.LHA');
    expect(await index.resolve('old.lha')).toBeNull();
  });

  it('answers null for a name nobody uploaded', async () => {
    const index = new NameIndex(new FakeBackend({ driveNumber: 2 }), 'Files/');
    expect(await index.resolve('ghost.lha')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/name-index.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// web/backend/src/storage/name-index.ts
/**
 * The board is case-insensitive and S3 is not.
 *
 * amigafs.resolvePath answers "the caller typed file.lha, the disk says
 * FILE.LHA" by listing the directory. A bucket cannot be listed per lookup -
 * Oracle's free tier allows 50,000 requests a MONTH - so each remote area
 * keeps this index instead: one listing, then maintained on every write.
 */
import * as path from 'path';
import type { StorageBackend } from './storage-backend';

export class NameIndex {
  private byLowerName = new Map<string, string>();
  private primed = false;

  constructor(private readonly backend: StorageBackend, private readonly prefix: string) {}

  async refresh(): Promise<void> {
    this.byLowerName.clear();
    for (const head of await this.backend.list(this.prefix)) {
      this.byLowerName.set(path.basename(head.key).toLowerCase(), head.key);
    }
    this.primed = true;
  }

  async resolve(name: string): Promise<string | null> {
    if (!this.primed) await this.refresh();
    return this.byLowerName.get(path.basename(name).toLowerCase()) ?? null;
  }

  note(key: string): void {
    this.byLowerName.set(path.basename(key).toLowerCase(), key);
  }

  forget(key: string): void {
    this.byLowerName.delete(path.basename(key).toLowerCase());
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/name-index.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/storage/name-index.ts web/backend/tests/storage/name-index.test.ts
git commit -m "feat(storage): resolve a caller's spelling without a listing per lookup"
```

---

### Task 7: The cache - materialise, pin what is dirty, survive a restart

**Files:**
- Create: `web/backend/src/storage/file-cache.ts`
- Create: `web/backend/tests/storage/file-cache.test.ts`

**Interfaces:**
- Consumes: `VolumeSet`, `VolumeState` (Task 4); `StorageUnavailableError` (Task 2).
- Produces:
  ```ts
  export interface CachedFile { localPath: string; driveNumber: number; key: string; }

  export class FileCache {
    constructor(opts: { cacheDir: string; volumes: VolumeSet; maxBytes: number });
    ensureLocal(driveNumber: number, key: string): Promise<string>;
    ensureLocalSync(driveNumber: number, key: string): string;
    writeBack(driveNumber: number, key: string, localPath: string): Promise<void>;
    writeBackSync(driveNumber: number, key: string, localPath: string): void;   // emulator thread only
    markDirty(driveNumber: number, key: string, localPath: string): void;
    flushPending(): Promise<void>;      // called at boot
    evictTo(maxBytes: number): void;
    isDirty(driveNumber: number, key: string): boolean;
  }
  ```
  `ensureLocalSync` blocks with `deasync.loopWhile` and is legal ONLY on the emulator thread - the same rule `BsdSocketLibrary.recv()` follows at `BsdSocketLibrary.ts:717`.

- [ ] **Step 1: Write the failing test**

```ts
// web/backend/tests/storage/file-cache.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileCache } from '../../src/storage/file-cache';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { StorageUnavailableError } from '../../src/storage/storage-backend';
import { FakeBackend } from './fake-backend';

function setup(): { cache: FileCache; backend: FakeBackend; dir: string; volumes: VolumeSet } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filecache-'));
  const backend = new FakeBackend({ driveNumber: 2 });
  const state: VolumeState = {
    volume: { driveNumber: 2, kind: 's3', path: 'b', egress: 'FREE', volumeClass: 'FREE', quotaBytes: 1024 },
    backend,
    usedBytes: 0,
    requestsThisMonth: 0,
    egressBytesThisMonth: 0,
    degraded: false,
  };
  const volumes = new VolumeSet([state]);
  return { cache: new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 }), backend, dir, volumes };
}

describe('FileCache.ensureLocal', () => {
  it('fetches once and serves the second read from disk', async () => {
    const { cache, backend } = setup();
    await backend.put('Files/DEMO.LHA', Buffer.from('payload'));

    const first = await cache.ensureLocal(2, 'Files/DEMO.LHA');
    expect(fs.readFileSync(first, 'utf8')).toBe('payload');
    await cache.ensureLocal(2, 'Files/DEMO.LHA');

    expect(backend.gets).toBe(1);
  });

  it('reports a down volume as unavailable, not as a missing file', async () => {
    const { cache, backend } = setup();
    await backend.put('Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;
    await expect(cache.ensureLocal(2, 'Files/DEMO.LHA')).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it('marks the volume degraded, so placement stops choosing it and the admin can show it', async () => {
    const { cache, backend, volumes } = setup();
    await backend.put('Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;
    await expect(cache.ensureLocal(2, 'Files/DEMO.LHA')).rejects.toThrow();
    expect(volumes.byNumber(2)?.degraded).toBe(true);
  });

  it('clears the degraded mark once the volume answers again', async () => {
    const { cache, backend, volumes } = setup();
    await backend.put('Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;
    await expect(cache.ensureLocal(2, 'Files/DEMO.LHA')).rejects.toThrow();
    backend.down = false;
    await cache.ensureLocal(2, 'Files/DEMO.LHA');
    expect(volumes.byNumber(2)?.degraded).toBe(false);
  });
});

describe('FileCache write-back', () => {
  it('uploads what a writer left behind', async () => {
    const { cache, backend, dir } = setup();
    const local = path.join(dir, 'staged.bin');
    fs.writeFileSync(local, 'written-by-a-door');

    await cache.writeBack(2, 'Files/DOOR.DAT', local);

    expect((await backend.get('Files/DOOR.DAT')).toString()).toBe('written-by-a-door');
    expect(cache.isDirty(2, 'Files/DOOR.DAT')).toBe(false);
  });

  it('keeps the local copy and stays dirty when the upload fails', async () => {
    const { cache, backend, dir } = setup();
    const local = path.join(dir, 'staged2.bin');
    fs.writeFileSync(local, 'precious');
    backend.down = true;

    await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toBeInstanceOf(StorageUnavailableError);

    expect(fs.existsSync(local)).toBe(true);
    expect(cache.isDirty(2, 'Files/DOOR.DAT')).toBe(true);
  });

  it('replays pending uploads at boot', async () => {
    const { cache, backend, dir, volumes } = setup();
    const local = path.join(dir, 'staged3.bin');
    fs.writeFileSync(local, 'survives-a-crash');
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/LATE.DAT', local)).rejects.toThrow();

    // A new process, same cache directory and same journal.
    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    backend.down = false;
    await reborn.flushPending();

    expect((await backend.get('Files/LATE.DAT')).toString()).toBe('survives-a-crash');
  });
});

describe('FileCache.evictTo', () => {
  it('evicts clean files but never a dirty one', async () => {
    const { cache, backend, dir } = setup();
    await backend.put('Files/CLEAN.LHA', Buffer.alloc(400, 1));
    const clean = await cache.ensureLocal(2, 'Files/CLEAN.LHA');

    const dirty = path.join(dir, 'dirty.bin');
    fs.writeFileSync(dirty, Buffer.alloc(400, 2));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DIRTY.DAT', dirty)).rejects.toThrow();

    cache.evictTo(0);

    expect(fs.existsSync(clean)).toBe(false);
    expect(fs.existsSync(dirty)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/file-cache.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// web/backend/src/storage/file-cache.ts
/**
 * Local disk as a cache in front of the pool.
 *
 * The rule the whole design rests on: the cache may never delete the only copy
 * of anything. A file whose upload has not succeeded is DIRTY, is pinned
 * against eviction, and is recorded in a journal so a crash mid-upload resumes
 * instead of losing the write.
 */
import * as deasync from 'deasync';
import * as fs from 'fs';
import * as path from 'path';
import type { VolumeSet } from './volume-set';
import { StorageUnavailableError } from './storage-backend';

interface PendingEntry { driveNumber: number; key: string; localPath: string; }

export class FileCache {
  private readonly cacheDir: string;
  private readonly volumes: VolumeSet;
  private maxBytes: number;
  private readonly dirty = new Map<string, PendingEntry>();

  constructor(opts: { cacheDir: string; volumes: VolumeSet; maxBytes: number }) {
    this.cacheDir = opts.cacheDir;
    this.volumes = opts.volumes;
    this.maxBytes = opts.maxBytes;
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.loadJournal();
  }

  private get journalPath(): string {
    return path.join(this.cacheDir, '.pending.json');
  }

  private loadJournal(): void {
    if (!fs.existsSync(this.journalPath)) return;
    try {
      const entries = JSON.parse(fs.readFileSync(this.journalPath, 'utf8')) as PendingEntry[];
      for (const entry of entries) this.dirty.set(this.id(entry.driveNumber, entry.key), entry);
    } catch {
      // A corrupt journal must not stop the board; the files are still on disk
      // and a sysop can re-upload them from the admin.
    }
  }

  private saveJournal(): void {
    fs.writeFileSync(this.journalPath, JSON.stringify([...this.dirty.values()], null, 2));
  }

  private id(driveNumber: number, key: string): string {
    return `${driveNumber}:${key}`;
  }

  localPathFor(driveNumber: number, key: string): string {
    return path.join(this.cacheDir, String(driveNumber), key);
  }

  isDirty(driveNumber: number, key: string): boolean {
    return this.dirty.has(this.id(driveNumber, key));
  }

  async ensureLocal(driveNumber: number, key: string): Promise<string> {
    const local = this.localPathFor(driveNumber, key);
    if (fs.existsSync(local)) return local;

    const state = this.volumes.byNumber(driveNumber);
    if (!state) throw new StorageUnavailableError(driveNumber, `DRIVE.${driveNumber} is not configured`);

    let body: Buffer;
    try {
      body = await state.backend.get(key);
    } catch (error) {
      // A volume that cannot answer is degraded: placement stops choosing it
      // and the admin shows why. The catalog row is untouched - this is not a
      // missing file, and nothing downstream may treat it as one.
      if (error instanceof StorageUnavailableError) this.volumes.markDegraded(driveNumber, true);
      throw error;
    }
    this.volumes.markDegraded(driveNumber, false);

    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, body);
    state.requestsThisMonth++;
    state.egressBytesThisMonth += body.length;
    return local;
  }

  /** writeBack for the emulator thread, blocking the way ensureLocalSync does. */
  writeBackSync(driveNumber: number, key: string, localPath: string): void {
    let failure: unknown;
    let done = false;

    this.writeBack(driveNumber, key, localPath).then(
      () => { done = true; },
      (error) => { failure = error; done = true; }
    );

    deasync.loopWhile(() => !done);
    if (failure) throw failure;
  }

  /**
   * The emulator's version. It blocks with deasync exactly the way
   * BsdSocketLibrary.recv() does (BsdSocketLibrary.ts:717) and is legal ONLY on
   * the emulator thread - calling it from an Express handler stalls the board.
   */
  ensureLocalSync(driveNumber: number, key: string): string {
    let result: string | undefined;
    let failure: unknown;
    let done = false;

    this.ensureLocal(driveNumber, key).then(
      (value) => { result = value; done = true; },
      (error) => { failure = error; done = true; }
    );

    deasync.loopWhile(() => !done);
    if (failure) throw failure;
    return result as string;
  }

  markDirty(driveNumber: number, key: string, localPath: string): void {
    this.dirty.set(this.id(driveNumber, key), { driveNumber, key, localPath });
    this.saveJournal();
  }

  async writeBack(driveNumber: number, key: string, localPath: string): Promise<void> {
    this.markDirty(driveNumber, key, localPath);

    const state = this.volumes.byNumber(driveNumber);
    if (!state) throw new StorageUnavailableError(driveNumber, `DRIVE.${driveNumber} is not configured`);

    const body = fs.readFileSync(localPath);
    try {
      await state.backend.put(key, body);
    } catch (error) {
      if (error instanceof StorageUnavailableError) this.volumes.markDegraded(driveNumber, true);
      throw error;   // the entry stays dirty and the local copy stays on disk
    }
    this.volumes.markDegraded(driveNumber, false);

    state.usedBytes += body.length;
    state.requestsThisMonth++;
    this.dirty.delete(this.id(driveNumber, key));
    this.saveJournal();
  }

  async flushPending(): Promise<void> {
    for (const entry of [...this.dirty.values()]) {
      if (!fs.existsSync(entry.localPath)) {
        this.dirty.delete(this.id(entry.driveNumber, entry.key));
        continue;
      }
      try {
        await this.writeBack(entry.driveNumber, entry.key, entry.localPath);
      } catch {
        // Still unavailable. It stays pending; the next boot tries again.
      }
    }
    this.saveJournal();
  }

  evictTo(maxBytes: number): void {
    const files: Array<{ full: string; size: number; atime: number; dirty: boolean }> = [];

    const walk = (dir: string): void => {
      if (!fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) { walk(full); continue; }
        if (full === this.journalPath) continue;
        const dirty = [...this.dirty.values()].some((entry) => path.resolve(entry.localPath) === path.resolve(full));
        files.push({ full, size: st.size, atime: st.atimeMs, dirty });
      }
    };
    walk(this.cacheDir);

    let total = files.reduce((sum, f) => sum + f.size, 0);
    for (const file of files.filter((f) => !f.dirty).sort((a, b) => a.atime - b.atime)) {
      if (total <= maxBytes) break;
      fs.unlinkSync(file.full);
      total -= file.size;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/file-cache.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/storage/file-cache.ts web/backend/tests/storage/file-cache.test.ts
git commit -m "feat(storage): a cache that pins what it has not uploaded yet"
```

---

### Task 8: Downloads read through the cache

**Files:**
- Modify: `web/backend/src/handlers/transfer/batch-download.handler.ts:262-300` (`resolveFile`)
- Create: `web/backend/src/storage/remote-areas.ts`
- Create: `web/backend/tests/storage/download-through-cache.test.ts`

**Interfaces:**
- Consumes: `FileCache` (Task 7), `FileEntry.storageVolume`/`objectKey` (Task 5), `NameIndex` (Task 6).
- Produces:
  ```ts
  // remote-areas.ts
  export interface RemoteLocation { driveNumber: number; key: string; }
  export function remoteLocationFor(entry: { storageVolume?: number; objectKey?: string }): RemoteLocation | null;
  export function isRemoteArea(area: { storageVolume?: number }): boolean;
  /** 'Conf1/Files/' - the object key prefix for an area, from its conference and path. */
  export function objectPrefixFor(area: { conferenceId: number; path: string }): string;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// web/backend/tests/storage/download-through-cache.test.ts
import { resolveFile } from '../../src/handlers/transfer/batch-download.handler';
import { StorageUnavailableError } from '../../src/storage/storage-backend';

/**
 * Read the existing suite tests/batch-download-restricted.test.ts first and
 * follow its harness for building a session and a conference; this suite adds
 * only the remote-area case.
 */
describe('resolveFile on a remote area', () => {
  it('materialises the object and hands back a real local path', async () => {
    const { cache, backend, area } = await remoteAreaFixture();      // helper below
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    const found = await resolveFile('demo.lha', area.conferenceId, { cache });

    expect(found).not.toBeNull();
    expect(require('fs').readFileSync(found!.fullPath, 'utf8')).toBe('payload');
    expect(backend.gets).toBe(1);
  });

  it('fetches once for two downloads of the same file', async () => {
    const { cache, backend, area } = await remoteAreaFixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    await resolveFile('demo.lha', area.conferenceId, { cache });
    await resolveFile('demo.lha', area.conferenceId, { cache });

    expect(backend.gets).toBe(1);
  });

  it('surfaces a down volume as unavailable rather than as a missing file', async () => {
    const { cache, backend, area } = await remoteAreaFixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;

    await expect(resolveFile('demo.lha', area.conferenceId, { cache })).rejects.toBeInstanceOf(
      StorageUnavailableError
    );
  });
});
```

Write `remoteAreaFixture()` at the top of the suite: a temp board root, a `FakeBackend` on drive 2, a `VolumeSet` holding it, a `FileCache` over a temp directory, and a `file_areas` row whose `storage_volume` is 2.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/download-through-cache.test.ts`
Expected: FAIL - `resolveFile` is not exported / takes no cache.

- [ ] **Step 3: Write minimal implementation**

Export `resolveFile` and give it an optional storage context. The local path is untouched; a remote area takes the new branch:

```ts
// batch-download.handler.ts
import { remoteLocationFor } from '../../storage/remote-areas';
import type { FileCache } from '../../storage/file-cache';

export interface StorageContext { cache: FileCache; }

export async function resolveFile(
  filename: string,
  confNum: number,
  storage?: StorageContext
): Promise<ResolvedFile | null> {
  const entry = lookupCatalogEntry(filename, confNum);   // existing catalog lookup
  const remote = entry ? remoteLocationFor(entry) : null;

  if (remote && storage) {
    // A fetch failure is NOT a missing file. Letting it fall through to the
    // local search below would tell the caller "not found" about a file that
    // is fine, which is how a sysop deletes a good catalog row.
    const localPath = await storage.cache.ensureLocal(remote.driveNumber, remote.key);
    const stats = fs.statSync(localPath);
    return { name: path.basename(remote.key), size: stats.size, confNum, dirNum: 1, fullPath: localPath };
  }

  // ... existing local search over Files/ and Upload/, unchanged ...
}
```

```ts
// web/backend/src/storage/remote-areas.ts
export interface RemoteLocation { driveNumber: number; key: string; }

export function remoteLocationFor(entry: { storageVolume?: number; objectKey?: string }): RemoteLocation | null {
  if (entry.storageVolume === undefined || !entry.objectKey) return null;
  return { driveNumber: entry.storageVolume, key: entry.objectKey };
}

export function isRemoteArea(area: { storageVolume?: number }): boolean {
  return area.storageVolume !== undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/download-through-cache.test.ts tests/batch-download-restricted.test.ts`
Expected: PASS - the new suite green AND the existing download suite unchanged.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/handlers/transfer/batch-download.handler.ts web/backend/src/storage/remote-areas.ts web/backend/tests/storage/download-through-cache.test.ts
git commit -m "feat(storage): a download materialises its object first"
```

---

### Task 9: Uploads land in the pool, and the free-space gate counts it

**Files:**
- Modify: `web/backend/src/handlers/file/file-maintenance.handler.ts:655-670` (the move into the area)
- Modify: `web/backend/src/handlers/file/file.handler.ts:764-790` (the free-space line and the 2 MB floor)
- Create: `web/backend/tests/storage/upload-into-pool.test.ts`

**Interfaces:**
- Consumes: `VolumeSet.place`, `VolumeSet.freeBytes` (Task 4); `FileCache.writeBack` (Task 7); `NameIndex.note` (Task 6).
- Produces: the catalog row written by an upload carries `storageVolume` and `objectKey`.

- [ ] **Step 1: Write the failing test**

```ts
// web/backend/tests/storage/upload-into-pool.test.ts
describe('an upload into a remote area', () => {
  it('puts the object, records the volume, and removes the playpen copy', async () => {
    const { backend, playpenFile, area, moveIntoArea, catalog } = await uploadFixture();

    await moveIntoArea(playpenFile, 'DEMO.LHA', area);

    expect((await backend.get('Conf1/Files/DEMO.LHA')).toString()).toBe('payload');
    expect(require('fs').existsSync(playpenFile)).toBe(false);
    expect(catalog.rowFor('DEMO.LHA')).toMatchObject({ storage_volume: 2, object_key: 'Conf1/Files/DEMO.LHA' });
  });

  it('keeps the playpen copy when the volume refuses the put', async () => {
    const { backend, playpenFile, area, moveIntoArea } = await uploadFixture();
    backend.down = true;

    await expect(moveIntoArea(playpenFile, 'DEMO.LHA', area)).rejects.toThrow();

    expect(require('fs').existsSync(playpenFile)).toBe(true);
  });
});

describe('the free-space figure', () => {
  it('reports the pool total, not the local disk', () => {
    const volumes = twoVolumes({ quota: 10 * 1024 ** 3 }, { quota: 5 * 1024 ** 3 });
    expect(poolFreeBytes(volumes)).toBe(15 * 1024 ** 3);
  });

  it('still refuses an upload below the 2 MB playpen floor', async () => {
    const { socket, session } = await uploadSessionWithFreeBytes(1024);   // one KB
    await startUpload(session, socket);
    expect(socket.written()).toContain('Not enough free space for uploading!');
  });
});
```

Build `uploadFixture()` and `uploadSessionWithFreeBytes()` on the harness in `web/backend/tests/diz-extraction-flow.test.ts`, which already drives an upload end to end - read it before writing this suite.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/upload-into-pool.test.ts`
Expected: FAIL - the move has no remote branch.

- [ ] **Step 3: Write minimal implementation**

```ts
// file-maintenance.handler.ts - the move into the area
const destBase = await this.getUploadBase(confNum);
if (!destBase) return;

if (isRemoteArea(area)) {
  // Zmodem always writes into the local playpen: a truncated temp file is
  // recoverable and a truncated object is not. Only the finished file goes up.
  const target = this.volumes.place(fs.statSync(srcPath).size, area.volumeClassPref);
  const key = `${objectPrefixFor(area)}${filename}`;
  await this.cache.writeBack(target.volume.driveNumber, key, srcPath);
  this.nameIndexFor(area).note(key);
  this.catalog.recordLocation(filename, area.id, target.volume.driveNumber, key);
  await fsp.unlink(srcPath);        // only after the put succeeded
  return;
}

// ... existing local rename path, unchanged ...
```

```ts
// file.handler.ts - the free-space line and the floor
// express.e:19012-19014 formatSpaceValue(tFShi,tFSlo): the total across every
// configured drive. With a pool that is once again a real sum rather than a
// stat of one disk - freeDiskSpace() by its original meaning.
const freeBytes = volumes.states.length > 0 ? volumes.freeBytes() : readFreeBytes(ulPath);
const spaceStr = formatSpaceBytes(freeBytes);
```

Leave the 2 MB floor exactly where it is; it now reads the pool figure.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/upload-into-pool.test.ts tests/diz-extraction-flow.test.ts`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/handlers/file/file-maintenance.handler.ts web/backend/src/handlers/file/file.handler.ts web/backend/tests/storage/upload-into-pool.test.ts
git commit -m "feat(storage): an upload lands in the pool, and free space means the pool"
```

---

### Task 10: Doors read and write remote files

**Files:**
- Modify: `web/backend/src/amiga-emulation/api/DosLibrary.ts:690-725` (Open) and `:855-885` (Close)
- Create: `web/backend/tests/storage/door-remote-file.test.ts`

**Interfaces:**
- Consumes: `FileCache.ensureLocalSync`, `FileCache.writeBack` (Task 7); `remoteLocationFor` (Task 8).
- Produces: nothing new. `DosLibrary` gains an optional storage context on its constructor; a door with no remote area behaves exactly as today.

- [ ] **Step 1: Write the failing test**

```ts
// web/backend/tests/storage/door-remote-file.test.ts
/**
 * Follow the emulator harness in tests/amiga-emulation/*.test.ts for building a
 * DosLibrary over a FakeEmulator; this suite adds the remote-file cases.
 */
describe('a door opening a file that lives in the pool', () => {
  it('reads the bytes the bucket holds', async () => {
    const { dos, backend, fake } = await doorFixture();
    await backend.put('Conf1/Files/DOOR.DAT', Buffer.from('from-the-bucket'));

    const handle = openFile(dos, fake, 'BBS:Conf1/Files/DOOR.DAT', MODE_OLDFILE);
    expect(readAll(dos, fake, handle)).toBe('from-the-bucket');
    expect(backend.gets).toBe(1);
  });

  it('uploads what the door wrote when the handle closes', async () => {
    const { dos, backend, fake } = await doorFixture();
    await backend.put('Conf1/Files/DOOR.DAT', Buffer.from('old'));

    const handle = openFile(dos, fake, 'BBS:Conf1/Files/DOOR.DAT', MODE_NEWFILE);
    writeAll(dos, fake, handle, 'new-contents');
    closeFile(dos, fake, handle);

    expect((await backend.get('Conf1/Files/DOOR.DAT')).toString()).toBe('new-contents');
  });

  it('lets the door read back what it just wrote', async () => {
    const { dos, backend, fake } = await doorFixture();
    const write = openFile(dos, fake, 'BBS:Conf1/Files/NEW.DAT', MODE_NEWFILE);
    writeAll(dos, fake, write, 'round-trip');
    closeFile(dos, fake, write);

    const read = openFile(dos, fake, 'BBS:Conf1/Files/NEW.DAT', MODE_OLDFILE);
    expect(readAll(dos, fake, read)).toBe('round-trip');
  });

  it('leaves a local door file completely alone', async () => {
    const { dos, backend, fake, localFile } = await doorFixture();
    const handle = openFile(dos, fake, localFile.amigaPath, MODE_OLDFILE);
    expect(readAll(dos, fake, handle)).toBe(localFile.contents);
    expect(backend.gets).toBe(0);
    expect(backend.puts).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/door-remote-file.test.ts`
Expected: FAIL - the door reads nothing, because nothing materialises the object.

- [ ] **Step 3: Write minimal implementation**

```ts
// DosLibrary.ts, in Open() right after `const realPath = this.pathResolver.resolve(filename);`
const remote = this.storage?.locate(realPath);
if (remote) {
  // Blocking here is correct: this is the emulator thread, and it is exactly
  // how BsdSocketLibrary.recv() waits (BsdSocketLibrary.ts:717). The web
  // event loop is a different thread of control and is not held.
  this.storage.cache.ensureLocalSync(remote.driveNumber, remote.key);
}
// ... existing amigafs.readFileSync(realPath) at :718, unchanged ...
```

```ts
// DosLibrary.ts, in Close() right after the existing amigafs.writeFileSync at :866
const remote = this.storage?.locate(fileHandle.realPath);
if (remote) {
  // Write-back on close: the door expects that reopening the file shows what
  // it wrote, so the put must finish before Close() returns.
  this.storage.cache.writeBackSync(remote.driveNumber, remote.key, fileHandle.realPath);
}
```

Add `writeBackSync` to `FileCache` next to `ensureLocalSync`, using the same `deasync.loopWhile` shape, and give `DosLibrary` an optional `storage?: { cache: FileCache; locate(realPath: string): RemoteLocation | null }` constructor argument that defaults to undefined.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/door-remote-file.test.ts tests/amiga-emulation`
Expected: PASS, and no existing emulator suite regresses.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/amiga-emulation/api/DosLibrary.ts web/backend/src/storage/file-cache.ts web/backend/tests/storage/door-remote-file.test.ts
git commit -m "feat(storage): a door sees a pool file as an ordinary file"
```

---

### Task 11: Drive Setup becomes the storage page

**Files:**
- Modify: `web/backend/src/services/config-services/drive-config.service.ts`
- Modify: `web/backend/src/api/config-routes.ts:1100-1160`
- Modify: `web/config-app/src/pages/DrivesPage.tsx`
- Create: `web/backend/tests/api/storage-volumes-routes.test.ts`
- Create: `web/config-app/src/pages/__tests__/DrivesPage.storage.test.tsx`

**Interfaces:**
- Consumes: `parseVolumes`, `readVolumeSecret` (Task 1); `VolumeSet` (Task 4).
- Produces:
  - `GET /api/config/drives` returns `DriveConfig & { kind, quotaBytes, usedBytes, volumeClass, egress, retentionDays, keyId, degraded }`. **Never a secret.**
  - `POST /api/config/drives/:n/secret` writes `Storage/<n>.key` at `0600`.
  - `POST /api/config/drives/:n/test` performs one `list` and reports reachable or not.
  - `GET /api/config/drives/:n/contents` lists the catalog rows whose `storage_volume` is `n` - the report that stands in for a second copy.

- [ ] **Step 1: Write the failing test**

```ts
// web/backend/tests/api/storage-volumes-routes.test.ts
describe('GET /api/config/drives', () => {
  it('reports quota, usage and class for an s3 drive', async () => {
    const { agent } = await adminFixtureWithVolumes();
    const res = await agent.get('/api/config/drives');
    expect(res.body.data[1]).toMatchObject({ kind: 's3', volumeClass: 'FREE', quotaBytes: 10 * 1024 ** 3 });
  });

  it('never returns a secret, in any field', async () => {
    const { agent } = await adminFixtureWithVolumes();
    const res = await agent.get('/api/config/drives');
    expect(JSON.stringify(res.body)).not.toContain('sekrit');
  });
});

describe('POST /api/config/drives/:n/secret', () => {
  it('writes the key file with 0600 and nothing into Drives.info', async () => {
    const { agent, boardRoot } = await adminFixtureWithVolumes();
    await agent.post('/api/config/drives/2/secret').send({ secret: 'brand-new' }).expect(200);

    const keyPath = require('path').join(boardRoot, 'Storage', '2.key');
    expect(require('fs').readFileSync(keyPath, 'utf8').trim()).toBe('brand-new');
    expect(require('fs').statSync(keyPath).mode & 0o777).toBe(0o600);
    expect(require('fs').readFileSync(require('path').join(boardRoot, 'Drives.info'), 'latin1')).not.toContain('brand-new');
  });
});

describe('GET /api/config/drives/:n/contents', () => {
  it('lists what would be lost if this volume disappeared', async () => {
    const { agent } = await adminFixtureWithVolumes();
    const res = await agent.get('/api/config/drives/2/contents');
    expect(res.body.data.map((r: { filename: string }) => r.filename)).toContain('DEMO.LHA');
  });
});
```

```tsx
// web/config-app/src/pages/__tests__/DrivesPage.storage.test.tsx
describe('DrivesPage', () => {
  it('shows quota use and the volume class for an s3 drive', async () => {
    renderWithProviders(<DrivesPage />, { drives: [s3Drive({ usedBytes: 5 * 1024 ** 3, quotaBytes: 10 * 1024 ** 3 })] });
    expect(await screen.findByText(/5.0 GB of 10.0 GB/)).toBeInTheDocument();
    expect(screen.getByText('FREE')).toBeInTheDocument();
  });

  it('warns before deleting from a volume with a minimum retention', async () => {
    renderWithProviders(<DrivesPage />, { drives: [s3Drive({ retentionDays: 90 })] });
    await userEvent.click(await screen.findByRole('button', { name: /contents/i }));
    expect(screen.getByText(/still billed for 90 days/i)).toBeInTheDocument();
  });

  it('never renders a secret field with a value', async () => {
    renderWithProviders(<DrivesPage />, { drives: [s3Drive({})] });
    const secret = await screen.findByLabelText(/secret key/i);
    expect(secret).toHaveValue('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `web/backend`: `npm test -- tests/api/storage-volumes-routes.test.ts`
Run from `web/config-app`: `npm test -- DrivesPage.storage`
Expected: both FAIL - routes and fields do not exist.

- [ ] **Step 3: Write minimal implementation**

Extend `DriveConfigService.getAllDrives()` to build its rows from `parseVolumes(bbsRoot)` rather than from raw tooltypes, and add `writeSecret`, `testVolume` and `contentsOf`. Add the four routes beside the existing drive routes in `config-routes.ts`. In `DrivesPage.tsx`, extend the existing `DataTable` columns with kind, class, used-against-quota, egress, retention and a degraded badge; add a contents modal using the existing `Modal` component; make the secret input write-only (`value=""`, submitted only when non-empty). Design system components only - no raw palette classes, no hand-rolled table.

Write the secret exactly the way `door-launch-token.ts:44-52` does:

```ts
fs.mkdirSync(path.dirname(keyPath), { recursive: true });
fs.writeFileSync(keyPath, `${secret}\n`, { encoding: 'utf8', mode: 0o600 });
try {
  fs.chmodSync(keyPath, 0o600);
} catch {
  // A filesystem without POSIX modes cannot narrow this. The board still runs.
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `web/backend`: `npm test -- tests/api/storage-volumes-routes.test.ts tests/services`
Run from `web/config-app`: `npm test -- DrivesPage` and `npm test -- design-system-usage`
Expected: PASS, including the design-system guard.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/services/config-services/drive-config.service.ts web/backend/src/api/config-routes.ts web/config-app/src/pages/DrivesPage.tsx web/backend/tests/api/storage-volumes-routes.test.ts web/config-app/src/pages/__tests__/DrivesPage.storage.test.tsx
git commit -m "feat(storage): Drive Setup configures the pool it was always about"
```

---

### Task 12: Wire the subsystem into the board, and the sysop documentation

**Files:**
- Modify: `web/backend/src/index.ts` (construct `VolumeSet` and `FileCache` at boot, call `flushPending()`)
- Modify: `Documentation/2-Sysops/CONFIGURATION.md` (a storage section)
- Create: `web/backend/tests/storage/boot-wiring.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `getStorage(): { volumes: VolumeSet; cache: FileCache } | null` - null on a board with no configured pool, which is what every handler branches on.

- [ ] **Step 1: Write the failing test**

```ts
// web/backend/tests/storage/boot-wiring.test.ts
describe('storage at boot', () => {
  it('is null on a board with no s3 drive, so nothing changes for it', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=BBS:Files']);
    expect(await initStorage(root)).toBeNull();
  });

  it('builds the pool and replays pending uploads when a bucket is configured', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=BBS:Files', 'DRIVE.2=s3://b', 'DRIVE.2.KEYID=k']);
    writeSecret(root, 2, 'sekrit');
    const storage = await initStorage(root, { backendFactory: () => fake });
    expect(storage).not.toBeNull();
    expect(fake.puts).toBe(1);      // the journal from a previous run was flushed
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/boot-wiring.test.ts`
Expected: FAIL - `initStorage` does not exist.

- [ ] **Step 3: Write minimal implementation**

Add `initStorage(bbsRoot, opts?)` to `web/backend/src/storage/index.ts`, returning null when `parseVolumes` yields no `s3` volume. Call it once during startup in `index.ts`, `await storage?.cache.flushPending()`, and pass the result to the handlers that take a storage context (Tasks 8, 9, 10).

Then document it for sysops in `Documentation/2-Sysops/CONFIGURATION.md`: the `DRIVE.n` sub-keys with a worked example of a free volume and a paid one, where the secret goes and why it is not in `Drives.info`, what happens when a volume is unreachable, and the blunt warning that one copy means a closed account loses those files.

- [ ] **Step 4: Run the whole backend suite**

Run: `npm test` from `web/backend`, then `npx tsc --noEmit` and `npm run typecheck:tests`.
Expected: all green, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/storage/index.ts web/backend/src/index.ts "Documentation/2-Sysops/CONFIGURATION.md" web/backend/tests/storage/boot-wiring.test.ts
git commit -m "feat(storage): build the pool at boot, and tell sysops how to use it"
```

---

## Optional: MinIO integration suite

Not part of the twelve tasks. A suite under `web/backend/tests/storage/minio.integration.test.ts`, skipped unless `STORAGE_INTEGRATION=1`, that runs the same round-trip against a real MinIO in docker - the one place S3's actual semantics (case sensitivity, listing pagination, overwrite) are exercised. Add it when the twelve are done; the corpus tests are the pattern for an opt-in suite.
