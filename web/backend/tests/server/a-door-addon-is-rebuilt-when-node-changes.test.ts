/**
 * GMASTER would not start on live: its better-sqlite3 addon on the doors
 * volume was a Node 20 build, and the image runs Node 24. Door node_modules
 * outlive every deploy, so docker/rebuild-door-natives.sh (run by the
 * entrypoint on every boot) rebuilds a door whose addons were built for
 * another ABI. A fake npm records which doors it was asked to rebuild.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.resolve(__dirname, '../../../../docker/rebuild-door-natives.sh');

function makeDoor(doorsDir: string, name: string, opts: { addon: boolean; stamp?: string }): string {
  const modules = path.join(doorsDir, name, 'node_modules');
  fs.mkdirSync(path.join(modules, 'better-sqlite3/build/Release'), { recursive: true });
  if (opts.addon) fs.writeFileSync(path.join(modules, 'better-sqlite3/build/Release/better_sqlite3.node'), '');
  if (opts.stamp) fs.writeFileSync(path.join(modules, '.amiexpress-node-abi'), `${opts.stamp}\n`);
  return modules;
}

function run(doorsDir: string, fakeNpm: string, abi: string): string {
  return execFileSync('sh', [SCRIPT, doorsDir], {
    encoding: 'utf8',
    env: { ...process.env, NODE_ABI: abi, NPM_BIN: fakeNpm },
  });
}

describe('a door addon is rebuilt when node changes', () => {
  let root: string;
  let doorsDir: string;
  let calls: string;
  let fakeNpm: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-natives-'));
    doorsDir = path.join(root, 'Doors');
    calls = path.join(root, 'calls.log');
    fakeNpm = path.join(root, 'npm');
    fs.writeFileSync(fakeNpm, `#!/bin/sh\necho "$(basename "$PWD") $*" >> "${calls}"\n`);
    fs.chmodSync(fakeNpm, 0o755);
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const rebuilt = (): string[] =>
    fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').map(l => l.split(' ')[0]) : [];

  it('rebuilds a door whose addon was built for an older ABI, and stamps it', () => {
    const modules = makeDoor(doorsDir, 'grandmaster', { addon: true, stamp: '115' });
    const out = run(doorsDir, fakeNpm, '137');

    expect(rebuilt()).toEqual(['grandmaster']);
    expect(fs.readFileSync(path.join(modules, '.amiexpress-node-abi'), 'utf8').trim()).toBe('137');
    expect(out).toContain('[OK] Doors/grandmaster');
  });

  it('rebuilds an addon that has never been stamped', () => {
    makeDoor(doorsDir, 'dopewars', { addon: true });
    run(doorsDir, fakeNpm, '137');
    expect(rebuilt()).toEqual(['dopewars']);
  });

  it('leaves a door alone once its stamp matches, and doors without an addon', () => {
    makeDoor(doorsDir, 'grandmaster', { addon: true, stamp: '137' });
    makeDoor(doorsDir, 'whip', { addon: false });
    run(doorsDir, fakeNpm, '137');
    expect(rebuilt()).toEqual([]);
  });

  it('does not stamp a door whose rebuild failed, so the next boot tries again', () => {
    const modules = makeDoor(doorsDir, 'grandmaster', { addon: true, stamp: '115' });
    fs.writeFileSync(fakeNpm, '#!/bin/sh\nexit 1\n');
    const out = run(doorsDir, fakeNpm, '137');
    expect(out).toContain('[ERROR] Doors/grandmaster');
    expect(fs.readFileSync(path.join(modules, '.amiexpress-node-abi'), 'utf8').trim()).toBe('115');
  });
});
