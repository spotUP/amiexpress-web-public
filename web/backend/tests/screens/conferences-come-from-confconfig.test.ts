/**
 * The screen index lists the board's CONFERENCES, not its Conf<n> directories.
 *
 * Reported live on 2026-09-02: CONF_JOINMSGBASE showed fourteen conferences on
 * a board that has five, with 6..14 reading Conf6..Conf14 - directories left
 * behind by conferences the sysop deleted. The index was calling readdir and
 * treating every `Conf<n>` directory as a conference, which is the same
 * mistake as building `Conf<n>` from a number: a conference is what
 * ConfConfig.info declares (express.e:31849 walks NAME.i/LOCATION.i for
 * i:=1 TO cmds.numConf), and its directory is whatever LOCATION.n says.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildScreenIndex } from '../../src/screens/screen-index.service';
import { conferenceNumbers } from '../../src/conferences/conference-paths';

let root: string;

function writeConfConfig(entries: { name: string; location: string }[]): void {
  const lines = [`NCONFS=${entries.length}`];
  entries.forEach((entry, i) => {
    lines.push(`NAME.${i + 1}=${entry.name}`);
    lines.push(`LOCATION.${i + 1}=${entry.location}`);
  });
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), lines.join('\n') + '\n');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-scope-'));
  // The live board's shape: fourteen directories, five conferences.
  for (let n = 1; n <= 14; n++) fs.mkdirSync(path.join(root, `Conf${n}`), { recursive: true });
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('which conferences exist', () => {
  test('is what ConfConfig.info declares, not what the disk still holds', () => {
    writeConfConfig([
      { name: 'Amiga Demoscene', location: 'BBS:Conf2/' },
      { name: 'C64 Demoscene', location: 'BBS:Conf3/' },
      { name: 'Console Demoscene', location: 'BBS:Conf5/' },
      { name: 'Requests', location: 'BBS:Conf8/' },
      { name: 'Up Rough Internal', location: 'BBS:Conf12/' },
    ]);

    expect(conferenceNumbers(root)).toEqual([1, 2, 3, 4, 5]);
  });

  test('falls back to the directories when the board has no ConfConfig.info', () => {
    // A board that has never been renumbered looks exactly like its directories,
    // and express.e's own default amounts to the same thing.
    expect(conferenceNumbers(root)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });
});

describe('a conference screen in the index', () => {
  beforeEach(() => {
    writeConfConfig([
      { name: 'Amiga Demoscene', location: 'BBS:Conf2/' },
      { name: 'C64 Demoscene', location: 'BBS:Conf3/' },
      { name: 'Console Demoscene', location: 'BBS:Conf5/' },
      { name: 'Requests', location: 'BBS:Conf8/' },
      { name: 'Up Rough Internal', location: 'BBS:Conf12/' },
    ]);
    fs.writeFileSync(path.join(root, 'Conf12', 'CONF_JOINMSGBASE.txt'), 'joined\n', 'latin1');
  });

  test('has one row per conference the board has', () => {
    const index = buildScreenIndex(root);
    const entry = index.screens.find(s => s.screen === 'CONF_JOINMSGBASE');

    expect(entry?.resolutions.map(r => r.id)).toEqual([1, 2, 3, 4, 5]);
  });

  test('reads each conference where LOCATION.n points, and resolves there', () => {
    const index = buildScreenIndex(root);
    const entry = index.screens.find(s => s.screen === 'CONF_JOINMSGBASE');
    const fifth = entry?.resolutions.find(r => r.id === 5);

    // Conference 5 lives in Conf12/ - that part was right, and stays right.
    expect(fifth?.dir).toBe('Conf12');
    expect(fifth?.file).toBe('Conf12/CONF_JOINMSGBASE.txt');
  });

  test('does not invent a conference out of a leftover directory', () => {
    const index = buildScreenIndex(root);
    const entry = index.screens.find(s => s.screen === 'CONF_JOINMSGBASE');

    expect(entry?.resolutions.some(r => (r.id ?? 0) > 5)).toBe(false);
  });
});
