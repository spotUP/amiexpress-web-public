/**
 * NOTHING THE BOARD DRAWS REACHES A PETSCII CALLER AS A QUESTION MARK.
 *
 * The sysop's ask, in his words, after 80-column PETSCII started working:
 * "the only caveat is that we need to map ? characters to working petscii
 * characters". This is that, measured against the board's own art rather
 * than against a list of characters somebody thought of.
 *
 * It sweeps every screen, bulletin, conference screen and door design the
 * repository ships through the REAL path a PETSCII caller's screen takes -
 * `readAmigaTextFileWithTransforms`, which auto-detects CP437 against
 * Latin-1 (the same bytes are different glyphs under the two, so a sweep
 * that skipped this step would be measuring the wrong character set), and
 * then `asciiToPetsciiByte` per code point, the function the transducer
 * calls - and fails if any code point has no glyph in EITHER charset bank.
 *
 * When this suite was written the sweep found four: U+25A0 BLACK SQUARE
 * and U+2219 BULLET OPERATOR (57 and 51 uses, in the arcade doors' own
 * backgrounds), U+2556 (Screens/Logon24hrs.txt) - the visible half of the
 * eighteen mixed single/double box characters missing as a class, see
 * sdk/tests/petscii/mixed-box-drawing-reaches-c64.test.ts - and one C1
 * control byte, which is not a glyph and is exempted below by name.
 *
 * A new screen that uses a character the C64 cannot print fails HERE, at
 * the moment it is added, rather than on a caller's screen.
 */
import * as fs from 'fs';
import * as path from 'path';
import { asciiToPetsciiByte } from '@amiexpress/bbs-door-sdk/petscii';
import { readAmigaTextFileWithTransforms } from '../../src/utils/amiga-text-decode.util';
import { loadFiller } from '../../../../board/Doors/magazine/filler';
import { conferenceDir, conferenceNumbers } from '../../src/conferences/conference-paths';

const BOARD = path.resolve(__dirname, '../../../..');
const QUESTION = 0x3f;

/**
 * Where the board keeps art it puts on a caller's screen.
 *
 * The conferences are resolved through `conferenceDir`, never built as
 * `Conf<n>`: a conference's directory is whatever its LOCATION tooltype
 * says, and this board has fourteen of them. A hardcoded Conf1..Conf5
 * would have swept a third of the conference art and reported the rest
 * as clean.
 */
function artDirs(): string[] {
  const fixed = ['Screens', 'Bulletins', 'Doors'].map((d) => path.join(BOARD, d));
  const conferences = conferenceNumbers(BOARD).map((n) => conferenceDir(BOARD, n));
  return [...fixed, ...conferences];
}

/**
 * C1 controls are not glyphs. One byte of one door design decodes to
 * U+0092 under Latin-1 detection; no PETSCII mapping is the right answer
 * for a control code, and inventing one would put a character on the
 * screen where the art has none.
 */
const isC1Control = (cp: number): boolean => cp >= 0x80 && cp <= 0x9f;

/** An Amiga executable's hunk magic - code bytes are not art. */
const isExecutable = (buf: Buffer): boolean => buf.length >= 4 && buf.readUInt32BE(0) === 0x000003f3;

/**
 * The magazine's clipart fill is chosen per caller: a PETSCII caller gets only
 * the pieces that map (`loadFiller(..., true)`), the rest are never sent to a
 * C64. So the pieces that do not map are not "art the board puts on a C64
 * screen"; the product's own filter decides, not a copy of it here.
 */
const MAGAZINE_ART = path.join(BOARD, 'board', 'Doors', 'magazine', 'art');
const sentToPetscii = new Set(loadFiller({ shippedDir: MAGAZINE_ART }, true).map((p) => p.file));
const isFillNeverSentToPetscii = (file: string): boolean =>
  path.dirname(file) === path.join(MAGAZINE_ART, 'fill') && !sentToPetscii.has(path.basename(file));

function artFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
        walk(p, depth + 1);
        continue;
      }
      if (!/\.(txt|ans|asc|scr)$/i.test(e.name)) continue;
      if (/\.backup|FILE_ID/i.test(e.name)) continue;
      if (isFillNeverSentToPetscii(p)) continue;
      out.push(p);
    }
  };
  for (const dir of artDirs()) walk(dir, 0);
  return out;
}

interface Loss {
  codePoint: number;
  char: string;
  uses: number;
  files: string[];
}

function sweep(): { scanned: number; glyphs: number; losses: Loss[] } {
  const lost = new Map<number, { uses: number; files: Set<string> }>();
  let scanned = 0;
  let glyphs = 0;

  for (const file of artFiles()) {
    if (isExecutable(fs.readFileSync(file))) continue;
    let text: string;
    try {
      text = readAmigaTextFileWithTransforms(file).text;
    } catch (e) {
      // Loud. A sweep that swallowed its reads would report "nothing is
      // lost" while reading nothing at all.
      throw new Error(`could not read ${path.relative(BOARD, file)}: ${e instanceof Error ? e.message : String(e)}`);
    }
    scanned += 1;
    // Escape sequences are plumbing the transducer parses, not glyphs.
    const drawn = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b[()][A-B0]/g, '');
    for (const ch of drawn) {
      const cp = ch.codePointAt(0) as number;
      if (cp === QUESTION || (cp < 0x20 && cp !== 0x09) || isC1Control(cp)) continue;
      glyphs += 1;
      const bank0 = asciiToPetsciiByte(cp, 0);
      const bank1 = asciiToPetsciiByte(cp, 1);
      const gone = bank0.byte === QUESTION && !bank0.needsReverse && bank1.byte === QUESTION && !bank1.needsReverse;
      if (!gone) continue;
      const e = lost.get(cp) ?? { uses: 0, files: new Set<string>() };
      e.uses += 1;
      e.files.add(path.relative(BOARD, file));
      lost.set(cp, e);
    }
  }

  return {
    scanned,
    glyphs,
    losses: [...lost.entries()]
      .map(([codePoint, e]) => ({ codePoint, char: String.fromCodePoint(codePoint), uses: e.uses, files: [...e.files] }))
      .sort((a, b) => b.uses - a.uses),
  };
}

describe("the board's own art, through the encoder a PETSCII caller reads it with", () => {
  const result = sweep();

  it('actually read the art - a sweep of nothing proves nothing', () => {
    expect(result.scanned).toBeGreaterThan(100);
    expect(result.glyphs).toBeGreaterThan(100000);
  });

  it('has no character the C64 cannot print in either charset bank', () => {
    const report = result.losses
      .map((l) => `U+${l.codePoint.toString(16).toUpperCase().padStart(4, '0')} ${JSON.stringify(l.char)} ${l.uses}x in ${l.files.slice(0, 3).join(', ')}`)
      .join('\n');
    expect(report).toBe('');
  });
});
