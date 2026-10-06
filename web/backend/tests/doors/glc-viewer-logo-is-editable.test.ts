/**
 * The logo is a file the artists own.
 *
 * The sysop, 2026-09-16: "global last callers should have the logo
 * configurable i think? we need to add it to the admin ansi studio so artists
 * can edit it and it needs a petscii logo".
 *
 * So the five lines above the title bar come from `art/style<N>.ans`, declared
 * as drawable slots in the door's manifest - which is what lists them in the
 * Studio - and a 40-column caller reads the C64 variant the Studio files under
 * `Screens/doors/GLC/`.
 *
 * The case that matters most is the LAST one: a board with no art files and no
 * variants draws exactly what the 68K viewer drew. That is what keeps the
 * parity gate honest now that a logo can be replaced.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { logoFor, originalLogo, artSettingSection } from '../../../../Doors/glc-viewer/src/logo';
import * as art from '../../../../Doors/glc-viewer/src/art.generated';

const DOOR = path.join(__dirname, '../../../../Doors/glc-viewer');

/** A board whose Studio has stored a narrow drawing for one style. */
function boardWithVariant(style: number, lines: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glc-art-'));
  const dir = path.join(root, 'Screens', 'doors', 'GLC');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${artSettingSection(`logo${style}`).toLowerCase()}.c64.ans`),
    lines.join('\r\n') + '\r\n',
    'latin1',
  );
  return root;
}

/** A door folder holding one art file, and nothing else. */
function doorWithArt(name: string, lines: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glc-door-'));
  fs.mkdirSync(path.join(dir, 'art'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'art', name), lines.join('\r\n') + '\r\n', 'latin1');
  return dir;
}

const ask = (over: Partial<Parameters<typeof logoFor>[0]> = {}) => logoFor({
  style: 3, doorDir: DOOR, bbsRoot: null, columns: 80, values: {}, command: 'GLC', ...over,
});

describe('which logo a caller sees', () => {
  it('is the door\'s shipped art file, which is the original\'s drawing', () => {
    // style3.ans is generated from the E source, so this is both "the file is
    // read" and "the file says what the original says".
    expect(ask({ values: { logo3: 'art/style3.ans' } })).toEqual(originalLogo(3));
  });

  it('is what an artist drew, once they have drawn one', () => {
    const drawn = ['\x1b[35mMY LOGO', '\x1b[36mSECOND LINE'];
    const doorDir = doorWithArt('style3.ans', drawn);
    expect(ask({ doorDir, values: { logo3: 'art/style3.ans' } })).toEqual(drawn);
  });

  it('is the C64 variant for a forty-column caller', () => {
    const narrow = ['\x1b[35mFORTY WIDE'];
    const bbsRoot = boardWithVariant(3, narrow);
    expect(ask({ bbsRoot, columns: 40, values: { logo3: 'art/style3.ans' } })).toEqual(narrow);
  });

  it('is NOT the C64 variant for an eighty-column caller', () => {
    // An 80-column PETSCII caller reads the wide art, like the ANSI caller
    // beside him - the board's standing rule for 40 versus 80.
    const bbsRoot = boardWithVariant(3, ['\x1b[35mFORTY WIDE']);
    expect(ask({ bbsRoot, columns: 80, values: { logo3: 'art/style3.ans' } })).toEqual(originalLogo(3));
  });

  it('is the variant for the style being drawn, not another style\'s', () => {
    const bbsRoot = boardWithVariant(1, ['\x1b[35mSTYLE ONE ONLY']);
    // Style 3 asked; only style 1 has a narrow drawing. A narrow caller is
    // never handed the WIDE one, so the answer is the door's own shipped
    // placeholder - and never style 1's variant.
    const drawn = ask({ bbsRoot, columns: 40, values: { logo3: 'art/style3.ans' } });
    expect(drawn.join('\n')).not.toContain('STYLE ONE ONLY');
    expect(drawn.join('')).toContain('\x1b[7m');   // the shipped placeholder, in reverse video
  });

  it('refuses a setting that points outside the door\'s own folder', () => {
    // The value is something an admin types, so it is treated as one.
    expect(ask({ values: { logo3: '../../../etc/passwd' } })).toEqual(originalLogo(3));
    expect(ask({ values: { logo3: '/etc/passwd' } })).toEqual(originalLogo(3));
  });

  it('draws the original when the board has no art at all', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'glc-empty-'));
    expect(ask({ doorDir: empty, values: {} })).toEqual(originalLogo(3));
    expect(ask({ doorDir: empty, style: 2, values: {} })).toEqual(art.LOGO_STYLE_2_4);
  });

  it('ignores a file that is there but empty, rather than drawing nothing', () => {
    const doorDir = doorWithArt('style3.ans', []);
    expect(ask({ doorDir, values: { logo3: 'art/style3.ans' } })).toEqual(originalLogo(3));
  });
});

describe('the shipped art', () => {
  it('is on disk for all four styles', () => {
    for (const n of [1, 2, 3, 4]) {
      expect(fs.existsSync(path.join(DOOR, 'art', `style${n}.ans`))).toBe(true);
    }
  });

  it('is byte-for-byte the drawing the E source carries', () => {
    const read = (n: number) => fs.readFileSync(path.join(DOOR, 'art', `style${n}.ans`), 'latin1')
      .replace(/\r?\n$/, '').split(/\r?\n/);
    expect(read(1)).toEqual([...art.LOGO_STYLE_1_3]);
    expect(read(2)).toEqual([...art.LOGO_STYLE_2_4]);
    expect(read(3)).toEqual([...art.LOGO_STYLE_1_3]);
    expect(read(4)).toEqual([...art.LOGO_STYLE_2_4]);
  });

  it('is declared as a drawable slot, or the Studio would never list it', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DOOR, 'door.settings.json'), 'utf8'));
    const drawable = manifest.settings.filter((s: { art?: boolean }) => s.art);
    expect(drawable.map((s: { key: string }) => s.key)).toEqual(['logo1', 'logo2', 'logo3', 'logo4']);
    for (const slot of drawable) {
      expect(fs.existsSync(path.join(DOOR, slot.default))).toBe(true);
    }
  });
});

/**
 * The first C64 screenshot, 2026-09-16: the 79-column logo wrapped across
 * eight rows of a forty-column screen and pushed the list off the top.
 */
describe('a forty-column caller and the wide drawing', () => {
  it('is given the narrow placeholder rather than one that cannot fit', () => {
    const drawn = ask({ columns: 40, values: { logo3: 'art/style3.ans' } });
    // Never the wide art...
    expect(drawn).not.toEqual(originalLogo(3));
    // ...and never nothing, now that the door ships a C64 drawing of its own.
    expect(drawn.length).toBeGreaterThan(0);
    for (const line of drawn) {
      expect(line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').length).toBeLessThanOrEqual(40);
    }
  });

  it('still gets the narrow one when an artist has drawn it', () => {
    const narrow = ['\x1b[35mFORTY WIDE'];
    const bbsRoot = boardWithVariant(3, narrow);
    expect(ask({ bbsRoot, columns: 40, values: { logo3: 'art/style3.ans' } })).toEqual(narrow);
  });

  it('keeps the wide drawing for everyone above forty', () => {
    expect(ask({ columns: 41, values: { logo3: 'art/style3.ans' } })).toEqual(originalLogo(3));
    expect(ask({ columns: 80, values: { logo3: 'art/style3.ans' } })).toEqual(originalLogo(3));
  });
});

/*
 * A teletext caller is forty columns as well, but reads a teletext page:
 * the C64 placeholder's reverse-video blocks were what he got (sysop,
 * 2026-10-06: "fix teletext versions of them").
 */
describe('a teletext caller', () => {
  it('gets the door\'s teletext placeholder, not the C64 one', () => {
    const drawn = ask({ columns: 40, teletext: true });
    const shipped = fs.readFileSync(path.join(DOOR, 'art', 'style3.ttx.ans'), 'latin1')
      .replace(/\r?\n$/, '').split(/\r?\n/);
    expect(drawn).toEqual(shipped);
    expect(drawn.join('')).toContain('\x1b#3');
    for (const line of drawn) {
      expect(line.replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b#\d|[\x0e\x0f]/g, '').length).toBeLessThanOrEqual(40);
    }
  });

  it('gets an artist\'s teletext drawing over the placeholder', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glc-ttx-'));
    const dir = path.join(root, 'Screens', 'doors', 'GLC');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${artSettingSection('logo3').toLowerCase()}.ttx.ans`), '\x1b[33mTELETEXT LOGO\n', 'latin1');
    expect(ask({ bbsRoot: root, columns: 40, teletext: true })).toEqual(['\x1b[33mTELETEXT LOGO']);
  });

  it('ships a teletext placeholder for every style', () => {
    for (const style of [1, 2, 3, 4]) {
      expect(fs.existsSync(path.join(DOOR, 'art', `style${style}.ttx.ans`))).toBe(true);
    }
  });
});
