/**
 * dev/scripts/local-mirror-links.sh gives the mirror worktree the shared
 * checkout's node_modules as per-entry symlinks. They vanished once and the
 * mirror's sdk build failed on "Cannot find module 'events'", because nothing
 * recreated them. These run the script against two temporary trees.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.resolve(__dirname, '../../../../dev/scripts/local-mirror-links.sh');

function makeTrees(): { shared: string; mirror: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-links-'));
  const shared = path.join(base, 'shared');
  const mirror = path.join(base, 'mirror');
  for (const dir of ['sdk/node_modules/events', 'sdk/node_modules/@amiexpress', 'web/backend/node_modules/express']) {
    fs.mkdirSync(path.join(shared, dir), { recursive: true });
  }
  fs.mkdirSync(path.join(shared, 'web/backend/node_modules/@amiexpress/bbs-door-sdk'), { recursive: true });
  fs.mkdirSync(path.join(shared, 'web/backend/node_modules/@amiexpress/other'), { recursive: true });
  // A door's own install, the case a caller met first: "Cannot find module
  // '@amiexpress/bbs-door-sdk'" from Doors/telnet-front.
  fs.mkdirSync(path.join(shared, 'Doors/telnet-front/node_modules/@amiexpress/bbs-door-sdk'), { recursive: true });
  fs.mkdirSync(path.join(mirror, 'Doors/telnet-front'), { recursive: true });
  fs.mkdirSync(path.join(mirror, 'sdk'), { recursive: true });
  fs.mkdirSync(path.join(mirror, 'web/backend'), { recursive: true });
  return { shared, mirror };
}

function run(shared: string, mirror: string): string {
  return execFileSync('bash', [SCRIPT, shared, mirror], { encoding: 'utf8' });
}

describe('local-mirror-links.sh', () => {
  it('links every missing entry into the shared checkout, and the own sdk into the mirror', () => {
    const { shared, mirror } = makeTrees();
    run(shared, mirror);
    expect(fs.readlinkSync(path.join(mirror, 'sdk/node_modules/events'))).toBe(path.join(shared, 'sdk/node_modules/events'));
    expect(fs.readlinkSync(path.join(mirror, 'web/backend/node_modules/express'))).toBe(path.join(shared, 'web/backend/node_modules/express'));
    expect(fs.readlinkSync(path.join(mirror, 'web/backend/node_modules/@amiexpress/bbs-door-sdk'))).toBe(path.join(mirror, 'sdk'));
    expect(fs.readlinkSync(path.join(mirror, 'Doors/telnet-front/node_modules/@amiexpress/bbs-door-sdk'))).toBe(path.join(mirror, 'sdk'));
    expect(fs.readlinkSync(path.join(mirror, 'web/backend/node_modules/@amiexpress/other'))).toBe(path.join(shared, 'web/backend/node_modules/@amiexpress/other'));
  });

  it('fills in a partly emptied node_modules and leaves existing entries alone', () => {
    const { shared, mirror } = makeTrees();
    fs.mkdirSync(path.join(mirror, 'web/backend/node_modules/express'), { recursive: true });
    const out = run(shared, mirror);
    expect(fs.lstatSync(path.join(mirror, 'web/backend/node_modules/express')).isSymbolicLink()).toBe(false);
    expect(fs.readlinkSync(path.join(mirror, 'sdk/node_modules/events'))).toBe(path.join(shared, 'sdk/node_modules/events'));
    expect(run(shared, mirror)).toContain('(0 links added)');
    expect(out).not.toContain('(0 links added)');
  });
});
