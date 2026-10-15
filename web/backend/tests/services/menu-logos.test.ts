import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { chooseLogos, renderLogoAt, measureLogo } from '../../src/services/menu-catalogue/logos';
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
