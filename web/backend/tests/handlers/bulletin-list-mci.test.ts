/**
 * `~BL.` lists every bulletin the board has, by the name the door shows.
 *
 * The teletext bulletin page was authored with the list typed into it, and
 * a board with twelve bulletins showed three (sysop, 2026-09-14) - the same
 * failure shape as any hand-copied list, and the reason `~CL.` exists for
 * conferences. `~BL.` is its twin: the FILES decide what exists, and
 * `Bulls.CFG`'s `[BullNames_END]` section - what the sysop edits in the
 * Studio - decides what each one is called.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { applyMciPrePasses } from '../../src/handlers/mci-pre-passes';
import { config } from '../../src/config';

/** A board with `count` bulletins at the root, named through the door's config. */
function makeBoard(count: number, named: Record<number, string> = {}): string {
  const board = fs.mkdtempSync(path.join(os.tmpdir(), 'bl-mci-'));
  const dir = path.join(board, 'Bulletins');
  fs.mkdirSync(dir, { recursive: true });
  for (let n = 1; n <= count; n++) {
    fs.writeFileSync(path.join(dir, `bull${n}.txt`), `bulletin ${n}\n`);
  }

  const rows: string[] = ['[Init_END] ===='];
  for (let n = 1; n <= count; n++) {
    // A board that has not named a bulletin writes a bare dash, and the
    // door shows the dash to nobody.
    rows.push(`${(named[n] ?? '-').padEnd(50)} ; bull${n}.txt`);
  }
  rows.push('[BullNames_END]====');
  const doors = path.join(board, 'Doors', 'emp_tools');
  fs.mkdirSync(doors, { recursive: true });
  fs.writeFileSync(path.join(doors, 'Bulls.CFG'), rows.join('\n'));
  return board;
}

function session(): any {
  return { user: { id: 1, username: 'SYSOP', secLevel: 255 }, currentConf: 1, nodeId: 1 };
}

const expand = (text: string, sess: any = session()) =>
  applyMciPrePasses(text, sess, { flavour: 'ansi', inlineMode: false } as any);

describe('~BL. is the board\'s bulletin list', () => {
  const original = config.getConfig().dataDir;
  let board = '';
  afterEach(() => {
    config.set('dataDir', original);
    if (board) fs.rmSync(board, { recursive: true, force: true });
    board = '';
  });

  test('shows every bulletin on disk, not the three somebody typed in', async () => {
    board = makeBoard(12, { 7: 'SVT Text News' });
    config.set('dataDir', board);

    const { text } = await expand('~BL.');

    for (let n = 1; n <= 12; n++) {
      expect(text).toContain(`${String(n).padStart(3)}\x1b[33m)`);
    }
    expect(text).toContain('SVT Text News');
  });

  test('an unnamed bulletin still appears, under its number', async () => {
    board = makeBoard(2);
    config.set('dataDir', board);

    const { text } = await expand('~BL.');

    expect(text).toContain('Bulletin 1');
    expect(text).toContain('Bulletin 2');
  });

  test('a board with no bulletins expands to nothing, not to the token', async () => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'bl-mci-none-'));
    config.set('dataDir', board);

    const { text } = await expand('before\n~BL.\nafter');

    expect(text).not.toContain('~BL.');
    expect(text).toContain('before');
    expect(text).toContain('after');
  });

  test('forty columns clips the title rather than folding the row', async () => {
    board = makeBoard(1, { 1: 'A bulletin title far longer than forty columns can hold' });
    config.set('dataDir', board);
    const narrow = session();
    narrow.texttvMode = true;

    const { text } = await expand('~BL.', narrow);

    expect(text).toContain('A bulletin title far longer t');
    expect(text).not.toContain('forty columns can hold');
  });
});
