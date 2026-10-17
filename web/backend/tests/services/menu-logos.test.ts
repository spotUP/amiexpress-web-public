import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { chooseLogos, renderLogoAt, measureLogo, writeMenuLogo } from '../../src/services/menu-catalogue/logos';
import { validateMenuConfig } from '../../src/screens/menu-config/menu-config';
import { AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';

const FIX = path.join(__dirname, '../fixtures/menu-logos');
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-logos-'));
  const dir = path.join(root, 'Screens/menus/main/logos');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(FIX)) fs.copyFileSync(path.join(FIX, f), path.join(dir, f));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const caller = (columns: number, secLevel = 10): any => ({ columns, secLevel, displayMode: columns <= 40 ? 'petscii' : 'ansi' });
const cfg = (logos: unknown[]) => validateMenuConfig('MAIN', { logos }).config;

test('fixed, rotate and random pick from the set for the caller\'s width and level', () => {
  // wide.txt is 100 columns: it is only a candidate for a caller of the wide class (120+).
  const c = cfg([{ position: 'header', widthClass: 'wide', levelFloor: 0, rule: 'rotate', files: ['cat.txt', 'wide.txt'] }]);
  const a = chooseLogos(c, 'MAIN', caller(120), root)[0].file;
  const b = chooseLogos(c, 'MAIN', caller(120), root)[0].file;
  expect(new Set([a, b])).toEqual(new Set(['cat.txt', 'wide.txt']));
  expect(chooseLogos(c, 'MAIN', caller(40), root)).toEqual([]);          // no c64 set
  expect(chooseLogos(c, 'MAIN', caller(80), root)).toEqual([]);          // no standard set
});

test('the set with the highest level floor the caller reaches applies', () => {
  const c = cfg([
    { position: 'footer', widthClass: 'standard', levelFloor: 0, rule: 'fixed', files: ['cat.txt'] },
    { position: 'footer', widthClass: 'standard', levelFloor: 200, rule: 'fixed', files: ['cat.txt', 'wide.txt'] },
  ]);
  expect(chooseLogos(c, 'MAIN', caller(80, 10), root)[0].file).toBe('cat.txt');
  expect(chooseLogos(c, 'MAIN', caller(80, 10), root)).toHaveLength(1);
});

test('a side logo is only for the wide class', () => {
  const side = cfg([{ position: 'side', widthClass: 'standard', levelFloor: 0, rule: 'fixed', files: ['cat.txt'] }]);
  expect(chooseLogos(side, 'MAIN', caller(80), root)).toEqual([]);
  const wideSide = cfg([{ position: 'side', widthClass: 'wide', levelFloor: 0, rule: 'fixed', files: ['cat.txt'] }]);
  expect(chooseLogos(wideSide, 'MAIN', caller(132), root)).toHaveLength(1);
});

test('a logo is measured; one wider than the screen is never chosen', () => {
  expect(measureLogo(path.join(root, 'Screens/menus/main/logos/cat.txt'))).toEqual({ rows: 3, cols: 7 });
  const c = cfg([{ position: 'footer', widthClass: 'standard', levelFloor: 0, rule: 'fixed', files: ['wide.txt'] }]);
  expect(chooseLogos(c, 'MAIN', caller(80), root)).toEqual([]);
});

test('an ANSI logo is drawn row by row inside its box', () => {
  const [logo] = chooseLogos(cfg([{ position: 'header', widthClass: 'standard', levelFloor: 0, rule: 'fixed', files: ['cat.txt'] }]), 'MAIN', caller(80), root);
  const out = renderLogoAt(root, 'MAIN', logo, 2, 30, 3, 20)!;
  expect(out).toContain('\x1b[2;30H');
  expect(out).toContain('\x1b[4;30H');
  expect(renderLogoAt(root, 'MAIN', logo, 2, 30, 2, 20)).toBeNull();      // does not fit: not drawn at all
  expect(renderLogoAt(root, 'MAIN', logo, 2, 30, 3, 6)).toBeNull();
});

test('a C64 logo crosses the transducer back into the same screen codes (Decision 29)', () => {
  const [logo] = chooseLogos(cfg([{ position: 'header', widthClass: 'c64', levelFloor: 0, rule: 'fixed', files: ['cat.seq'] }]), 'MAIN', caller(40), root);
  expect(logo).toMatchObject({ rows: 3, cols: 5 });
  const ansi = renderLogoAt(root, 'MAIN', logo, 2, 1, 3, 40)!;
  const petscii = Buffer.from(new AnsiToPetsciiTransducer().transduce(ansi));
  expect(petscii.includes(0xa6)).toBe(true);
  expect(petscii.includes(0xb0)).toBe(true);
  expect(petscii.includes(0x1e)).toBe(true);                              // cat.seq's green ($1E) comes back as the same colour byte
  expect(petscii.includes(0x3f)).toBe(false);                             // no '?': nothing was unmappable
});

test('when a hand-edited config holds two sets for one slot the first draws, as validateMenuConfig keeps the first', () => {
  const base = cfg([]);
  const c = { ...base, logos: [
    { position: 'header' as const, widthClass: 'wide' as const, levelFloor: 0, rule: 'fixed' as const, files: ['cat.txt'], afterSection: 0 },
    { position: 'header' as const, widthClass: 'wide' as const, levelFloor: 0, rule: 'fixed' as const, files: ['wide.txt'], afterSection: 0 },
  ] };
  expect(chooseLogos(c, 'MAIN', caller(120), root)[0].file).toBe('cat.txt');
});

/** What Moebius saves: full 80-column rows with no line break between them, then ^Z and a SAUCE record naming the canvas. */
function moebiusLogo(rows: string[], width: number): Buffer {
  const sauce = Buffer.alloc(128, 0);
  sauce.write('SAUCE00', 0, 'latin1');
  sauce.write('A logo'.padEnd(35), 7, 'latin1');
  sauce[94] = 1; sauce[95] = 1;                              // Character / ANSi
  sauce.writeUInt16LE(width, 96);
  sauce.writeUInt16LE(rows.length, 98);
  sauce.write('IBM VGA', 106, 'latin1');
  return Buffer.concat([Buffer.from(rows.map((r, i) => `\x1b[${31 + i % 7}m${r}`).join('') + '\x1b[0m', 'latin1'), Buffer.from([0x1a]), sauce]);
}

test('an 80x7 Moebius logo (no line breaks, SAUCE record) uploads as 80x7 and draws its rows in place', () => {
  const rows = Array.from({ length: 7 }, (_, i) => `ROW${i}`.padEnd(80, String(i)));
  const saved = writeMenuLogo(root, 'MAIN', 'moebius.ans', moebiusLogo(rows, 80));
  expect(saved).toEqual({ file: 'moebius.ans', rows: 7, cols: 80 });
  const drawn = renderLogoAt(root, 'MAIN', { position: 'header', file: 'moebius.ans', rows: 7, cols: 80, afterSection: 0 }, 1, 1, 7, 80)!;
  const text = drawn.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '|');
  for (const row of rows) expect(text).toContain(row);
  expect(text).not.toContain('SAUCE');
});

test('a logo whose SAUCE canvas is wider than 200 columns is still refused', () => {
  expect(() => writeMenuLogo(root, 'MAIN', 'huge.ans', moebiusLogo(['X'.repeat(240)], 240))).toThrow('An ANSI logo is at most 200 columns wide.');
});
