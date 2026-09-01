/**
 * A door must not look for its own files under process.cwd().
 *
 * Six doors were found doing it in one day, every one of them broken on the
 * board and working in development, because the backend runs with cwd
 * /app/web/backend (Dockerfile WORKDIR) while a door's files are under
 * /app/data/bbs/Doors/<door>:
 *
 *   BBSLink        credentials from __dirname, which is dist/ in production
 *   BBSLink wall   credentials from cwd + Doors/bbslink/bbslink.cfg
 *   telnet         the telnetdoor.cfg its own menu tells sysops to create
 *   GRANDMASTER    its SQLite database, on the container's ephemeral layer
 *   DOORMAN        the file explorer's root
 *   showcase       the directory its FileManager demo lists
 *
 * Arkanoid and Super Qix had already been bitten and grown private walkers
 * with comments describing the same loss. The answer is the SDK's
 * resolveDoorRoot for a door's own directory, and BBS_DATA_DIR (or DOORMAN's
 * resolveBbsRoot) for the BBS root.
 *
 * This reads source, which is blunt, and blunt is the point: it fails on the
 * pattern before anyone runs the door on the board.
 */

import * as fs from 'fs';
import * as path from 'path';

const DOORS = path.resolve(__dirname, '../../../../Doors');

/**
 * Uses of cwd that are deliberate, each with the reason it is not this bug.
 * A door added here needs a sentence, not just a line.
 */
const ALLOWED = new Map<string, string>([
  // Resolves the BACKEND's modules, and the backend is what cwd points at.
  ['livechat/chat-only-login.ts', 'requires backend modules, which live at cwd'],
  // Prints it. Does not build a path from it.
  ['rip-browser/app.ts', 'logs the working directory as a diagnostic'],
  // A demo listing whatever directory it is in - cosmetic, and the file is
  // 3702 lines against the repo's 2000-line ceiling, so the pre-commit hook
  // refuses any change to it until it is split. It shows the backend's own
  // files on the board rather than the BBS. Open.
  ['neo-blessed-showcase/app.ts', 'demo listing; the file is over the line limit and cannot be touched'],
  ['GWall/index.ts', 'env first, cwd as the last resort; the door is uninstalled'],
  // Reaches the BACKEND's AmigaGuide parser, and the backend is what cwd is.
  ['door-manager/FileExplorerOverlay.ts', 'requires a backend module, which lives at cwd'],
]);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'tests') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

describe('doors and the working directory', () => {
  const offenders: string[] = [];

  for (const file of sourceFiles(DOORS)) {
    const relative = path.relative(DOORS, file);
    const text = fs.readFileSync(file, 'utf8');
    // Comments explain the trap in several doors; only code counts.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    if (!/process\.cwd\(\)/.test(code)) continue;
    if (ALLOWED.has(relative)) continue;
    offenders.push(relative);
  }

  it('does not resolve a door\'s own files from the process working directory', () => {
    expect(offenders).toEqual([]);
  });

  it('keeps every allowed exception pointing at a file that still exists', () => {
    const missing = [...ALLOWED.keys()].filter(rel => !fs.existsSync(path.join(DOORS, rel)));

    expect(missing).toEqual([]);
  });
});
