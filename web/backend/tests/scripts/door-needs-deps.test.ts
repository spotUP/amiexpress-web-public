/**
 * Every door gets the dependencies it declares.
 *
 * WHIP died on the live site with:
 *
 *   Error executing door: Cannot find module 'xml2js'
 *   Require stack: /app/data/bbs/Doors/whip/dist/core/party-calendar.js
 *
 * It declares xml2js and it was never installed. docker-entrypoint.sh decided
 * whether to run npm install like this:
 *
 *   if grep -q '"better-sqlite3"' "$door_dir/package.json"; then ...
 *
 * so a door got its dependencies ONLY if it used better-sqlite3. Everything
 * else received the SDK symlink and nothing more, and node_modules is
 * excluded from the Docker build - so any door with a plain npm dependency
 * failed the moment somebody ran it.
 *
 * This is the decision the entrypoint now calls. Exit 0 means "install".
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'door-needs-deps.sh');

function makeDoor(spec: {
  pkg?: Record<string, unknown> | null;
  nodeModules?: boolean;
  sqliteBinary?: boolean;
  /** Dependency directories that really exist under node_modules. */
  installed?: string[];
}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-'));
  if (spec.pkg !== null && spec.pkg !== undefined) {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(spec.pkg, null, 2));
  }
  if (spec.nodeModules) fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  for (const name of spec.installed ?? []) {
    fs.mkdirSync(path.join(dir, 'node_modules', name), { recursive: true });
  }
  if (spec.sqliteBinary) {
    const p = path.join(dir, 'node_modules', 'better-sqlite3', 'build', 'Release');
    fs.mkdirSync(p, { recursive: true });
    fs.writeFileSync(path.join(p, 'better_sqlite3.node'), 'x');
  }
  return dir;
}

/** True when the script says the door needs `npm install`. */
function needsInstall(dir: string): boolean {
  try {
    execFileSync('bash', [SCRIPT, dir], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

describe('door-needs-deps', () => {
  it('installs for a door that declares dependencies and has none (the WHIP case)', () => {
    const dir = makeDoor({ pkg: { name: 'whip', dependencies: { xml2js: '^0.6.2' } } });

    expect(needsInstall(dir)).toBe(true);
  });

  it('does not reinstall when every declared dependency is present', () => {
    const dir = makeDoor({
      pkg: { name: 'whip', dependencies: { xml2js: '^0.6.2' } },
      installed: ['xml2js'],
    });

    expect(needsInstall(dir)).toBe(false);
  });

  it('installs when node_modules exists but holds only the SDK symlink', () => {
    // Exactly the live state of whip: the entrypoint creates
    // node_modules/@amiexpress itself, so the DIRECTORY is there for every
    // door whether or not anything was installed. Testing for the directory
    // would have called this door installed and left it broken.
    const dir = makeDoor({
      pkg: {
        name: 'whip',
        dependencies: {
          '@amiexpress/bbs-door-sdk': 'file:../../sdk',
          xml2js: '^0.6.2',
          uuid: '^9.0.0',
        },
      },
      installed: ['@amiexpress'],
    });

    expect(needsInstall(dir)).toBe(true);
  });

  it('does not demand an install for a file: dependency, which is symlinked', () => {
    const dir = makeDoor({
      pkg: { name: 'x', dependencies: { '@amiexpress/bbs-door-sdk': 'file:../../sdk' } },
      nodeModules: true,
    });

    expect(needsInstall(dir)).toBe(false);
  });

  it('skips a door that declares no dependencies', () => {
    const dir = makeDoor({ pkg: { name: 'plain' } });

    expect(needsInstall(dir)).toBe(false);
  });

  it('skips a door with an empty dependencies block', () => {
    const dir = makeDoor({ pkg: { name: 'plain', dependencies: {} } });

    expect(needsInstall(dir)).toBe(false);
  });

  it('still installs when a native binary is missing, even with node_modules present', () => {
    // The original reason this existed: a macOS better-sqlite3 build does not
    // run on Linux, so the directory can be there and still be useless.
    const dir = makeDoor({
      pkg: { name: 'livechat', dependencies: { 'better-sqlite3': '^11' } },
      nodeModules: true,
    });

    expect(needsInstall(dir)).toBe(true);
  });

  it('leaves a working native install alone', () => {
    const dir = makeDoor({
      pkg: { name: 'livechat', dependencies: { 'better-sqlite3': '^11' } },
      nodeModules: true,
      sqliteBinary: true,
    });

    expect(needsInstall(dir)).toBe(false);
  });

  it('works with a RELATIVE path, not just an absolute one', () => {
    // The entrypoint passes absolute paths, so this only bit when the script
    // was run by hand - and every other case here uses a temp dir, which is
    // absolute. `sh door-needs-deps.sh Doors/whip` reported no dependencies
    // for a door that declares three.
    const dir = makeDoor({ pkg: { name: 'whip', dependencies: { xml2js: '^0.6.2' } } });
    const relative = path.relative(process.cwd(), dir);

    expect(needsInstall(relative)).toBe(true);
  });

  it('says no for a directory that is not a node door at all', () => {
    const dir = makeDoor({ pkg: null });

    expect(needsInstall(dir)).toBe(false);
  });
});
