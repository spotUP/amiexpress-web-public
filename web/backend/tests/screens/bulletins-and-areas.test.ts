/**
 * Bulletins are art too, and nothing in the manager knew they existed.
 *
 * `Bulletins/bull20.txt` is a screen a caller reads; the board even publishes
 * its title in `BullHelp.txt` - "#20 Card Lobby Weekly Leaders" - and nothing
 * was reading it. A designer looking for "the weekly leaders bulletin" had a
 * numbered file and no way in.
 *
 * Message bases and file areas carry no names on this board: `MsgBase.info` and
 * `Dir1.info` hold no tooltypes, so the honest answer is how MANY there are,
 * from NDIRS and the MsgBase directory - not an invented label.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildScreenIndex } from '../../src/screens/screen-index.service';

let root: string;

const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bulletins-'));
  write('ConfConfig.info', 'NCONFS=1\nNAME.1=Amiga Demoscene\nLOCATION.1=BBS:Conf2/\n');
  write('Bulletins/BullHelp.txt', [
    'CARD LOBBY BULLETINS',
    '---------------------',
    '',
    '#20   Card Lobby Weekly Leaders',
    '     Top 10 chip winners from the lobby.',
    '#3    Up Rough News',
    '',
  ].join('\n'));
  write('Bulletins/bull20.txt', 'the leaders\n');
  write('Bulletins/bull3.txt', 'the news\n');
  write('Bulletins/bull9.txt', 'unnamed but real\n');
  write('Conf2/NDIRS', '3');
  fs.mkdirSync(path.join(root, 'Conf2', 'MsgBase'), { recursive: true });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the board bulletins', () => {
  test('are listed, with the titles the board publishes for them', () => {
    const index = buildScreenIndex(root);

    expect(index.bulletins).toEqual(expect.arrayContaining([
      { number: 20, file: 'Bulletins/bull20.txt', title: 'Card Lobby Weekly Leaders' },
      { number: 3, file: 'Bulletins/bull3.txt', title: 'Up Rough News' },
    ]));
  });

  test('a bulletin the help screen does not name is still listed', () => {
    const index = buildScreenIndex(root);

    expect(index.bulletins.find(b => b.number === 9)).toEqual({
      number: 9, file: 'Bulletins/bull9.txt', title: undefined,
    });
  });

  test('a bulletin is not reported as read by nothing', () => {
    const index = buildScreenIndex(root);

    expect(index.unused.map(f => f.relPath)).not.toContain('Bulletins/bull20.txt');
  });
});

describe('what a conference holds', () => {
  test('counts its file areas and message bases, since neither is named here', () => {
    const index = buildScreenIndex(root);

    expect(index.conferences[0]).toMatchObject({
      id: 1,
      name: 'Amiga Demoscene',
      dir: 'Conf2',
      fileAreas: 3,
      messageBases: 1,
    });
  });
});
