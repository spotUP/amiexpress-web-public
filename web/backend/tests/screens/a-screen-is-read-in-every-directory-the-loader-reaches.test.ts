/**
 * A screen is not one file in one directory - it is every file the loader can
 * reach for SOME caller.
 *
 * `screenSearchLocations` gives a conference screen `Conf<n>` and then
 * `Conf<n>/Screens`, and `findSecurityScreen` runs per CALLER: it walks that
 * caller's own level down in fives inside one directory, and only when that
 * directory answers nothing does the loader move to the next. So a conference
 * holding `bull20.txt` alone answers nobody below level 20, and the `BULL.TXT`
 * in `Conf<n>/Screens` is what every one of those callers is shown.
 *
 * The index used to stop at the first directory that answered a level-255
 * caller and claim variants only there, which declared the rest dead: on this
 * board that was every conference's `Screens/` directory, offered to artists
 * as art nothing reads. The sysop: "either the claim is wrong and they are
 * used or they should not be included in the gallery".
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildScreenIndex } from '../../src/screens/screen-index.service';

let root: string;

const write = (rel: string, body: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
};
const readersOf = (index: ReturnType<typeof buildScreenIndex>, rel: string) =>
  index.files[rel]?.readBy ?? [];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-fallthrough-'));
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), 'NCONFS=1\nNAME.1=Amiga\nLOCATION.1=BBS:Conf1/\n');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('the conference Screens copy is read by the callers the numbered one turns away', () => {
  // A sysop gets Conf1/bull20.txt. A level-10 caller finds nothing in Conf1
  // and is shown Conf1/Screens/BULL.TXT.
  write('Conf1/bull20.txt', 'the bulletin for staff\r\n');
  write('Conf1/Screens/BULL.TXT', 'the bulletin for everybody else\r\n');

  const index = buildScreenIndex(root);

  const readers = readersOf(index, path.join('Conf1', 'Screens', 'BULL.TXT'));
  expect(readers.map(r => r.screen)).toContain('CONF_BULL');
  expect(index.unused.map(f => f.relPath)).not.toContain(path.join('Conf1', 'Screens', 'BULL.TXT'));
});

test('and it says which callers it serves - the ones below the numbered variant', () => {
  write('Conf1/bull20.txt', 'staff\r\n');
  write('Conf1/Screens/BULL.TXT', 'everybody else\r\n');

  const index = buildScreenIndex(root);

  expect(readersOf(index, path.join('Conf1', 'Screens', 'BULL.TXT'))[0].serves).toBe('below 20');
  // The one a sysop is shown is still the resolved file, not a fallback.
  expect(readersOf(index, path.join('Conf1', 'bull20.txt'))[0].via).toBe('resolved');
});

test('a directory with an unnumbered file answers every caller, so nothing behind it is read', () => {
  // Conf1/BULL.TXT serves level 5 and level 255 alike: the loader never
  // reaches Conf1/Screens, and a file there is genuinely dead.
  write('Conf1/BULL.TXT', 'one bulletin for everyone\r\n');
  write('Conf1/Screens/BULL5.TXT', 'a file the loader can never reach\r\n');

  const index = buildScreenIndex(root);

  expect(readersOf(index, path.join('Conf1', 'Screens', 'BULL5.TXT'))).toEqual([]);
  expect(index.unused.map(f => f.relPath)).toContain(path.join('Conf1', 'Screens', 'BULL5.TXT'));
});

test('the same fall-through applies to the board\'s own screens', () => {
  // MAILSCAN is a global screen: the board root first, then Screens/.
  write('MailScan20.txt', 'scanning, for staff\r\n');
  write('Screens/MailScan.txt', 'scanning\r\n');

  const index = buildScreenIndex(root);

  expect(readersOf(index, path.join('Screens', 'MailScan.txt')).map(r => r.screen)).toContain('MAILSCAN');
});
