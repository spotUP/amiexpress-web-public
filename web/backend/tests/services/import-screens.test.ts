/**
 * Screens survive an import, as art and in the right place.
 *
 * Three separate faults, each of which lost art:
 *
 * - the parser read only `<bbs>/Screens/`, so a node's own screens and a
 *   conference's were never imported at all - on a real board that is most of
 *   them - and matched only `.txt` and `.ans`, missing the `.gr`, `.ibm`,
 *   `.seq` and `.rip` variants the loader routes on;
 * - it read them with `readFile(path, 'utf-8')`, which does NOT throw on a
 *   high-bit Amiga byte - it silently substitutes U+FFFD, so the "fallback to
 *   Latin-1" underneath it was unreachable;
 * - the writer flattened everything into `Screens/`, wrote it back as UTF-8,
 *   and addressed `config.get('bbsRoot')`, which is not a key this config has
 *   - so the files landed in `process.cwd()`.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AmigaParserService } from '../../src/services/amiga-parser.service';

/** ESC [ 3 1 m, then three high-bit bytes that only latin1 preserves. */
const ART = Buffer.from([0x1b, 0x5b, 0x33, 0x31, 0x6d, 0xa1, 0xb0, 0xdb, 0x0d, 0x0a]);

let board: string;

beforeEach(() => {
  board = fs.mkdtempSync(path.join(os.tmpdir(), 'import-screens-'));
  for (const dir of ['Screens', 'Node3', 'Node3/Screens', 'Conf2/Screens']) {
    fs.mkdirSync(path.join(board, dir), { recursive: true });
  }

  fs.writeFileSync(path.join(board, 'Screens', 'uprough.txt'), ART);
  fs.writeFileSync(path.join(board, 'Node3', 'LOGON.TXT'), ART);
  fs.writeFileSync(path.join(board, 'Node3', 'Screens', 'BBSTITLE.GR'), ART);
  fs.writeFileSync(path.join(board, 'Conf2', 'Screens', 'Menu.txt'), ART);
  fs.writeFileSync(path.join(board, 'Screens', 'notes.doc'), ART);
});

afterEach(() => fs.rmSync(board, { recursive: true, force: true }));

test('finds screens in every place a board keeps them', async () => {
  const screens = await new AmigaParserService().parseScreens(board);

  expect(screens.map(s => s.relPath).sort()).toEqual([
    path.join('Conf2', 'Screens', 'Menu.txt'),
    path.join('Node3', 'LOGON.TXT'),
    path.join('Node3', 'Screens', 'BBSTITLE.GR'),
    path.join('Screens', 'uprough.txt'),
  ]);
});

test('keeps the high-bit bytes that make it art', async () => {
  const screens = await new AmigaParserService().parseScreens(board);
  const one = screens.find(s => s.name === 'uprough.txt')!;

  // Read as UTF-8 these come back as three U+FFFD and the art is gone.
  expect(one.content.equals(ART)).toBe(true);
});

test('a file that is not a screen is left alone', async () => {
  const screens = await new AmigaParserService().parseScreens(board);

  expect(screens.map(s => s.name)).not.toContain('notes.doc');
});

test('takes the type variants the loader routes on, not just .txt and .ans', async () => {
  const screens = await new AmigaParserService().parseScreens(board);

  expect(screens.map(s => s.name)).toContain('BBSTITLE.GR');
});

test('a board with no screens at all imports none rather than throwing', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'import-empty-'));
  try {
    expect(await new AmigaParserService().parseScreens(empty)).toEqual([]);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test('the same name in two scopes stays two screens', async () => {
  // Flattened into one Screens/ directory, these overwrote each other.
  fs.writeFileSync(path.join(board, 'Conf2', 'Screens', 'LOGON.TXT'), ART);

  const screens = await new AmigaParserService().parseScreens(board);
  const logons = screens.filter(s => s.name.toUpperCase() === 'LOGON.TXT');

  expect(logons).toHaveLength(2);
  expect(new Set(logons.map(s => s.relPath)).size).toBe(2);
});
