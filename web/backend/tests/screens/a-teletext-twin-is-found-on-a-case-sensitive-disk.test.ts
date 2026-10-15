/**
 * The logon screen includes `BBS:screens/uprough.txt`; the live volume is
 * case-sensitive and the directory is `Screens/`. Its `.ttx` twin was looked
 * for in `screens/`, which does not exist there, so a teletext caller got the
 * ANSI logo (sysop, 2026-10-05, screenshot of the Up Rough art at 40
 * columns). This Mac's disk answers for either spelling, so the file layer is
 * made to answer as live's does: a directory exists only under its own name.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** A directory path whose every segment is spelled as the disk spells it. */
function exactlySpelled(dir: string): boolean {
  const parts = path.resolve(dir).split(path.sep).filter(Boolean);
  let at: string = path.sep;
  for (const part of parts) {
    let names: string[];
    try { names = fs.readdirSync(at); } catch { return false; }
    if (!names.includes(part)) return false;
    at = path.join(at, part);
  }
  return true;
}

jest.mock('../../src/utils/amigafs', () => {
  const actual = jest.requireActual('../../src/utils/amigafs');
  return {
    ...actual,
    findCaseInsensitive: (dir: string, name: string) =>
      (exactlySpelled(dir) ? actual.findCaseInsensitive(dir, name) : null),
    // Live's answer: the walk, never this disk's "it exists" shortcut.
    resolvePath: (target: string) => {
      let at: string = path.sep;
      for (const part of path.resolve(target).split(path.sep).filter(Boolean)) {
        let names: string[];
        try { names = fs.readdirSync(at); } catch { return null; }
        const match = names.find((n) => n.toLowerCase() === part.toLowerCase());
        if (!match) return null;
        at = path.join(at, match);
      }
      return at;
    },
  };
});

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});

import { loadScreenFile } from '../../src/handlers/screen.handler';
import { config } from '../../src/config';

test('a teletext caller gets the .ttx twin of a file named with its directory in the wrong case', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'named-case-'));
  fs.mkdirSync(path.join(root, 'Screens'));
  fs.writeFileSync(path.join(root, 'Screens', 'uprough.txt'), '\x1b[0;31mUP ROUGH IN ANSI\r\n', 'latin1');
  fs.writeFileSync(path.join(root, 'Screens', 'uprough.ttx'), '\x1b[0;33mUP ROUGH IN TELETEXT\n', 'latin1');

  const saved = config.get('dataDir');
  config.set('dataDir', root);
  try {
    // As the logon screen names it: through the BBS: assign.
    const result = await loadScreenFile('BBS:screens/uprough.txt', 1, 1,
      { nodeId: 1, texttvMode: true, screenWidth: 40, screenHeight: 25, user: { secLevel: 255 }, currentConf: 1 } as any);

    expect(String(result?.content)).toContain('UP ROUGH IN TELETEXT');
  } finally {
    config.set('dataDir', saved);
  }
});
