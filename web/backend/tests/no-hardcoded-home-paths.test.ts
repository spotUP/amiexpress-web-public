/**
 * No absolute path from someone's laptop in code that runs on the board.
 *
 * The RIP browser opened '~/Code/amiexpress-web/RIPgraphics' - the
 * board is a Linux container with no /Users at all, so every user got
 * "Directory not found" while the graphics sat on the volume. Three more were
 * fallbacks that only look harmless: the BBS: assign, and the two emulator
 * debug logs, all of which would write or read nothing at all the moment
 * BBS_DATA_DIR was absent.
 *
 * Comments may name a reference machine - they are documentation, not paths -
 * and dev-only scripts are not on the board. Everything else resolves from the
 * environment or from its own location.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../src');

/** Each entry needs a reason, not just a line. */
const ALLOWED = new Map<string, string>([
  // Tried last, after DOOR_ARCHIVES_ROOT and after the server's own Archives
  // directory, and named DEV_. The door archives are a sibling repo, outside
  // this one, so there is no location-relative answer.
  ['doors/door-catalog.service.ts', 'DEV_ARCHIVES_ROOT_DEFAULT, tried after env and after the server path'],
  // A browser shim: os.homedir() has to return something when a door's client
  // bundle asks, and nothing opens what it returns.
  ['doors/client-door-bundler.ts', 'stubs os.homedir() for the browser bundle'],
]);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    // scripts/ are developer tools, run by hand, never by the board.
    if (entry.isDirectory()) return entry.name === 'scripts' ? [] : sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('absolute paths in backend source', () => {
  const offenders: string[] = [];

  for (const file of sourceFiles(SRC)) {
    const relative = path.relative(SRC, file);
    if (ALLOWED.has(relative)) continue;
    const code = fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    if (/['"`]\/Users\//.test(code) || /['"`]\/home\/[a-z]/.test(code)) offenders.push(relative);
  }

  it('names nobody\'s home directory', () => {
    expect(offenders).toEqual([]);
  });

  it('keeps every allowed exception pointing at a file that still exists', () => {
    const missing = [...ALLOWED.keys()].filter(rel => !fs.existsSync(path.join(SRC, rel)));

    expect(missing).toEqual([]);
  });
});
