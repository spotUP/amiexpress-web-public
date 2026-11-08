/**
 * The 2026-11-08 image build could not download better-sqlite3's prebuilt
 * binary, and `npm rebuild better-sqlite3` silently compiled it instead. The
 * compiled addon aborted the backend during boot (hooks.cc:142, "Assertion
 * failed: (env) != nullptr"), /health never answered, and the cached layer
 * failed every deploy for 45 minutes. docker/install-prebuilt-better-sqlite3.sh
 * now installs the prebuilt binary only: it retries the download and fails the
 * build rather than compile. A fake prebuild-install stands in for the network.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.resolve(__dirname, '../../../../docker/install-prebuilt-better-sqlite3.sh');

describe('better-sqlite3 is never compiled in the image', () => {
  let root: string;
  let pkg: string;
  let calls: string;
  let fakePrebuild: string;

  /** A fake prebuild-install that fails its first `failures` runs, then writes `files`. */
  function prebuild(failures: number, files: string[]): void {
    const writes = files.map(f => `mkdir -p "$(dirname "build/Release/${f}")" && : > "build/Release/${f}"`).join('\n');
    fs.writeFileSync(
      fakePrebuild,
      `#!/bin/sh\necho run >> "${calls}"\nn=$(wc -l < "${calls}")\n[ "$n" -le ${failures} ] && exit 1\n${writes}\nexit 0\n`,
    );
    fs.chmodSync(fakePrebuild, 0o755);
  }

  function run(tries = 3): { status: number | null; out: string; runs: number } {
    const r = spawnSync('sh', [SCRIPT, root], {
      encoding: 'utf8',
      env: { ...process.env, PREBUILD_BIN: fakePrebuild, PREBUILD_TRIES: String(tries), PREBUILD_RETRY_DELAY: '0' },
    });
    const runs = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').length : 0;
    return { status: r.status, out: `${r.stdout}${r.stderr}`, runs };
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-prebuilt-'));
    pkg = path.join(root, 'node_modules/better-sqlite3');
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, 'package.json'), '{"name":"better-sqlite3"}');
    calls = path.join(root, 'calls.log');
    fakePrebuild = path.join(root, 'prebuild-install');
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('installs the prebuilt binary, retrying a failed download', () => {
    prebuild(2, ['better_sqlite3.node']);
    const r = run(3);
    expect(r.status).toBe(0);
    expect(r.runs).toBe(3);
    expect(fs.existsSync(path.join(pkg, 'build/Release/better_sqlite3.node'))).toBe(true);
    expect(r.out).toContain('[OK] prebuilt binary installed');
  });

  it('fails the build when the download never succeeds, instead of compiling', () => {
    prebuild(99, ['better_sqlite3.node']);
    const r = run(3);
    expect(r.status).not.toBe(0);
    expect(r.runs).toBe(3);
    expect(fs.existsSync(path.join(pkg, 'build'))).toBe(false);
    expect(r.out).toContain('refusing to compile it from source');
  });

  it('rejects a compiled build left in build/Release', () => {
    prebuild(0, ['better_sqlite3.node', 'obj.target/better_sqlite3.node']);
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('holds a compiled build');
  });

  it('never lets an earlier compiled build stand in for the download', () => {
    fs.mkdirSync(path.join(pkg, 'build/Release/obj.target'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'build/Release/better_sqlite3.node'), 'compiled');
    prebuild(99, []);
    const r = run(2);
    expect(r.status).not.toBe(0);
    expect(fs.existsSync(path.join(pkg, 'build/Release/better_sqlite3.node'))).toBe(false);
  });

  it('the image installs better-sqlite3 through this script, not npm rebuild', () => {
    const dockerfile = fs.readFileSync(path.resolve(__dirname, '../../../../Dockerfile'), 'utf8');
    expect(dockerfile).toContain('sh /usr/local/bin/install-prebuilt-better-sqlite3.sh /app/web/backend');
    expect(dockerfile).not.toMatch(/npm rebuild better-sqlite3/);
  });
});
