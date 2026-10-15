/**
 * Live board write guard.
 *
 * WHY THIS EXISTS
 * ---------------
 * This repository IS the sysop's live board. `Conf1/`, the `NodeN/` dirs, `Access/`,
 * `user.data` and the rest sit at the repo root, and every path helper in
 * `src/` falls back to that root when `BBS_ROOT` / `BBS_DATA_DIR` are unset:
 *
 *   src/config.ts:102          dataDir: process.env.BBS_DATA_DIR || path.resolve(__dirname, '../../..')
 *   src/services/MessageIndexManager.ts:125
 *   src/services/MessageFileManager.ts:19   ... and ~50 more call sites
 *
 * So a test that constructs a real repository or handler without setting the
 * environment first does not fail - it quietly posts into the sysop's mail.
 * That is not hypothetical: 373 body files under `Conf1/MsgBase` currently
 * contain the string `Test body text\n`, written across at least eight
 * separate test runs between 2026-05-03 and 2026-09-06, and message 318 (a
 * genuine ConfTop report) was destroyed that way.
 *
 * WHAT IT DOES
 * ------------
 * Two layers, because either one alone leaks.
 *
 *  1. ENVIRONMENT. If `BBS_ROOT` / `BBS_DATA_DIR` are unset, they are pointed
 *     at a per-worker temp board, so the ~50 `|| repoRoot` fallbacks resolve
 *     somewhere harmless instead of at the live data. If they are SET and
 *     point inside this checkout, setup throws: that is a deliberate mistake
 *     and it should be loud.
 *
 *  2. FILESYSTEM. Layer 1 only covers code that consults the environment.
 *     Plenty does not - `path.resolve(process.cwd(), '../..')`,
 *     `path.join(__dirname, '../../../..')`, a bare relative path in a test.
 *     So every destructive `fs` entry point is wrapped and throws when the
 *     resolved target lands inside a protected board directory of THIS
 *     checkout. Reads are untouched: `bulletin-reflow-drive` legitimately
 *     reads `Bulletins/bull8.txt` from the real tree and must keep working.
 *
 * There is deliberately no bypass environment variable. A test that needs a
 * board writes to a temp one.
 */
/*
 * `require`, deliberately, NOT `import * as fs`.
 *
 * Under @swc/jest an `import * as fs` is compiled to
 * `_interop_require_wildcard(require('fs'))`, which hands back a COPY of the
 * module's properties, not the module. Patching that copy patches nothing:
 * the first version of this guard did exactly that, ran green on its own
 * marker, and let a test delete the live `Conf1/MsgBase/HeaderFile`. The
 * guard must hold the real module object, and it must not create an interop
 * snapshot of its own before installing - a snapshot taken pre-patch could be
 * handed to later modules if the interop cache is shared.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs: typeof import('fs') = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path: typeof import('path') = require('path');

/*
 * The run-scoped scratch directory this worker is allowed to use, and the
 * `TMPDIR` redirect that keeps every OTHER `os.tmpdir()` caller in the suite
 * inside it. `require`, like the modules above, so this file stays loadable
 * before the test framework is up.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { testBoardDir, useRunDirAsTmp } = require('./temp-run-dir') as typeof import('./temp-run-dir');

/** `web/backend/tests` -> the checkout root that holds the live board. */
export const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * First-segment names under REPO_ROOT that hold irreplaceable board state.
 *
 * Only the top segment is matched, so a test writing to
 * `web/backend/tests/fixtures/Conf1/...` is untouched - that is a fixture,
 * not the board.
 */
const PROTECTED_EXACT = new Set([
  'Access',
  'AmiXnet',
  'Bulletins',
  'Commands',
  'Conf.DB',
  'Doors',
  'Libs',
  'S',
  'Screens',
  'Storage',
  'System',
  'Utils',
  'user.data',
  'User.data',
  'user.keys',
  'User.keys',
  'user.misc',
  'User.misc',
]);
/**
 * `Conf7`, `Node3`, and every top-level icon file - `ConfConfig.info`,
 * `ComputerList.info`, `bbsConfig.info`, `Node17.info`. The icons ARE the
 * board's configuration; a test that rewrites one has reconfigured the live
 * BBS. Only the FIRST path segment is matched, so a fixture at
 * `tests/fixtures/Conf1.info` is untouched.
 */
const PROTECTED_PATTERNS = [/^Conf\d+$/, /^Node\d+$/, /^[^/\\]+\.info$/];

/**
 * `path.resolve` collapses `..` but does not follow symlinks, and the seeded
 * temp board deliberately contains one (`Doors` -> the checkout's 719 MB
 * `Doors`). Without this a write to `<tempboard>/Doors/x` would look local and
 * land in the live tree. realpath the deepest ancestor that exists, then
 * rejoin the tail - realpath throws on a path that is not there yet, which is
 * the normal case for a file about to be created.
 */
function resolveThroughLinks(target: string): string {
  let head = path.resolve(target);
  const tail: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(head), ...tail);
    } catch {
      const parent = path.dirname(head);
      if (parent === head) return path.resolve(target);
      tail.unshift(path.basename(head));
      head = parent;
    }
  }
}

export function isProtectedLivePath(target: string): boolean {
  const resolved = resolveThroughLinks(target);
  const rel = path.relative(REPO_ROOT, resolved);
  // Outside the checkout entirely (temp dirs, /var/folders, ...).
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  const first = rel.split(path.sep)[0];
  if (PROTECTED_EXACT.has(first)) return true;
  return PROTECTED_PATTERNS.some(re => re.test(first));
}

function refuse(fnName: string, target: string): never {
  // The RESOLVED path, so a write that arrived through the temp board's
  // `Doors` symlink names the live directory it was about to land in.
  const rel = path.relative(REPO_ROOT, resolveThroughLinks(target));
  throw new Error(
    `[live-data-guard] fs.${fnName} refused: ${rel}\n` +
      `  That path is the sysop's LIVE board data in this checkout, not a fixture.\n` +
      `  A test must never write there. Point the code under test at a temp board:\n` +
      `      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-'));\n` +
      `      process.env.BBS_ROOT = root; process.env.BBS_DATA_DIR = root;\n` +
      `  (set them BEFORE importing the module under test - several capture the\n` +
      `  value at module load), then build Conf1/MsgBase etc. inside it.\n` +
      `  Guard: web/backend/tests/live-data-guard.ts`,
  );
}

/** Path-ish arguments only; fds, and anything exotic, are passed through. */
function asPath(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString();
  if (value instanceof URL && value.protocol === 'file:') return value.pathname;
  return null;
}

function checkArgs(fnName: string, args: unknown[], positions: number[]): void {
  for (const i of positions) {
    const p = asPath(args[i]);
    if (p !== null && isProtectedLivePath(p)) refuse(fnName, p);
  }
}

/** `open`/`openSync` only matter when the flags ask for write access. */
function opensForWriting(flags: unknown): boolean {
  if (flags === undefined || flags === null) return false; // default 'r'
  if (typeof flags === 'number') return (flags & 0o3) !== 0 || (flags & 0o100) !== 0;
  if (typeof flags !== 'string') return false;
  return /[wa+]/.test(flags);
}

/**
 * Which argument positions carry a DESTINATION path - the thing about to be
 * written. Sources are left alone on purpose: copying a file OUT of the live
 * board is a read, and `seed-shares-node-screens` legitimately does it.
 * `rename` is the exception that names two, because it removes the source as
 * well as creating the destination. `symlink`'s destination is its SECOND
 * argument; the first is the link's contents and need not exist at all.
 */
const WRITE_FNS: Record<string, number[]> = {
  writeFile: [0],
  appendFile: [0],
  mkdir: [0],
  mkdtemp: [0],
  rm: [0],
  rmdir: [0],
  unlink: [0],
  truncate: [0],
  rename: [0, 1],
  copyFile: [1],
  cp: [1],
  link: [1],
  symlink: [1],
  chmod: [0],
  utimes: [0],
  createWriteStream: [0],
};

function installGuard(): void {
  // The real module object, shared by `require('fs')`, `require('node:fs')`
  // and every later `import * as fs` interop copy.
  const target = fs as unknown as Record<string, unknown>;

  for (const [name, positions] of Object.entries(WRITE_FNS)) {
    for (const variant of [name, `${name}Sync`]) {
      const original = target[variant];
      if (typeof original !== 'function') continue;
      const fn = original as (...a: unknown[]) => unknown;
      target[variant] = function guarded(this: unknown, ...args: unknown[]) {
        checkArgs(variant, args, positions);
        return fn.apply(this, args);
      };
    }
  }

  for (const variant of ['open', 'openSync']) {
    const original = target[variant];
    if (typeof original !== 'function') continue;
    const fn = original as (...a: unknown[]) => unknown;
    target[variant] = function guardedOpen(this: unknown, ...args: unknown[]) {
      if (opensForWriting(args[1])) checkArgs(variant, args, [0]);
      return fn.apply(this, args);
    };
  }

  // `require('fs/promises')` and `require('fs').promises` are the same object
  // in Node >= 16, so patching this one covers both import styles.
  const promises = fs.promises as unknown as Record<string, unknown>;
  for (const [name, positions] of Object.entries(WRITE_FNS)) {
    const original = promises[name];
    if (typeof original !== 'function') continue;
    const fn = original as (...a: unknown[]) => unknown;
    promises[name] = function guardedAsync(this: unknown, ...args: unknown[]) {
      try {
        checkArgs(name, args, positions);
      } catch (err) {
        return Promise.reject(err);
      }
      return fn.apply(this, args);
    };
  }
  const originalOpen = promises.open;
  if (typeof originalOpen === 'function') {
    const fn = originalOpen as (...a: unknown[]) => unknown;
    promises.open = function guardedAsyncOpen(this: unknown, ...args: unknown[]) {
      try {
        if (opensForWriting(args[1])) checkArgs('open', args, [0]);
      } catch (err) {
        return Promise.reject(err);
      }
      return fn.apply(this, args);
    };
  }
}

/**
 * The read-only board assets an auto-created temp board is seeded with.
 *
 * Pinning BBS_ROOT at an EMPTY directory does contain the writes, but it also
 * silently changes what the suite READS: `narrow-tables` reads
 * `ComputerList.info`, the PETSCII sequence tests read `Screens/logoff/*.seq`,
 * `conference-rename-reaches-board` reads `ConfConfig.info`. Those reads are
 * harmless and were green before. So the temp board is seeded with a COPY of
 * the board's configuration and screens - reads see the same bytes, writes
 * land on the copy.
 *
 * What is NOT copied is as deliberate as what is. `Conf*` (the message bases -
 * a test must never see, let alone rewrite, real mail), `Node*`, the `user.*`
 * files, and `Doors` (719 MB; nothing reads it that cheaply).
 */
const SEEDED_DIRS = [
  'Screens', 'Access', 'Commands', 'Bulletins', 'Storage', 'S', 'System', 'Utils', 'Libs',
];
const SEEDED_FILES = ['Conf.DB'];
/**
 * Too big to copy for every worker (719 MB), and nothing needs to write it:
 * the door menu tests only read the catalogue. A symlink keeps those reads
 * working; `resolveThroughLinks` is what stops a write from riding it back
 * into the live tree.
 */
const SYMLINKED_DIRS = ['Doors'];

function seedBoard(root: string): void {
  for (const name of fs.readdirSync(REPO_ROOT)) {
    if (!name.endsWith('.info')) continue;
    const from = path.join(REPO_ROOT, name);
    if (!fs.statSync(from).isFile()) continue;
    fs.copyFileSync(from, path.join(root, name));
  }
  for (const name of SEEDED_FILES) {
    const from = path.join(REPO_ROOT, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(root, name));
  }
  for (const dir of SEEDED_DIRS) {
    const from = path.join(REPO_ROOT, dir);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(root, dir), { recursive: true });
  }
  // The node directories carry screens the resolver checks BEFORE `Screens/`
  // (`Node1/Logoff` is the first thing a logoff lookup asks for), so they have
  // to be here or half the screen suite resolves nothing. Their LOGS do not:
  // they are 55 of the 67 MB and no test reads them.
  for (const name of fs.readdirSync(REPO_ROOT)) {
    if (!/^Node\d+$/.test(name)) continue;
    const from = path.join(REPO_ROOT, name);
    if (!fs.statSync(from).isDirectory()) continue;
    fs.cpSync(from, path.join(root, name), {
      recursive: true,
      filter: src => !/(CallersLog|DoorLog|ErrorLog|UDLog|CLogBackup|DLogBackup|\.back$)/.test(src),
    });
  }
  for (const dir of SYMLINKED_DIRS) {
    const from = path.join(REPO_ROOT, dir);
    if (fs.existsSync(from)) fs.symlinkSync(from, path.join(root, dir));
  }
}

/**
 * Layer 1. Runs before the guard is installed so the temp board can be
 * created, and before any module under test captures the value.
 */
function pinBoardEnvironment(): void {
  for (const key of ['BBS_ROOT', 'BBS_DATA_DIR'] as const) {
    const current = process.env[key];
    if (current && isProtectedLivePath(path.join(current, 'Conf1'))) {
      throw new Error(
        `[live-data-guard] ${key}=${current} points at the LIVE board in this checkout.\n` +
          `  Point it at a temp directory instead. Guard: web/backend/tests/live-data-guard.ts`,
      );
    }
  }

  if (process.env.BBS_ROOT && process.env.BBS_DATA_DIR) return;

  // One board per WORKER, not per test file: setupFiles runs for every file,
  // and re-seeding ~39 MB 693 times would cost more than the whole suite.
  //
  // It used to be keyed by pid, straight in `${TMPDIR}`, and nothing ever
  // removed it - seven boards per run, kept for ever, 12 GB by the evening of
  // 2026-09-06. It is now keyed by JEST_WORKER_ID inside this run's own
  // directory (`temp-run-dir.ts`), which bounds it to `maxWorkers` boards and
  // hands the whole set to `globalTeardown` and the startup sweep. A board
  // still belongs to exactly one worker process at a time, so nothing about
  // the isolation changed; and it is still seeded fresh, because the run
  // directory it lives in did not exist a moment ago.
  const scratch = testBoardDir();
  if (!fs.existsSync(scratch)) {
    fs.mkdirSync(scratch, { recursive: true });
    seedBoard(scratch);
  }
  process.env.BBS_ROOT ??= scratch;
  process.env.BBS_DATA_DIR ??= scratch;
}

// Before the board is created, so a fallback board and every test-authored
// `mkdtemp` land in the same run-scoped directory.
useRunDirAsTmp();
pinBoardEnvironment();
installGuard();

