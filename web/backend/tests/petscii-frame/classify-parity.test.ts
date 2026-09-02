/**
 * The SDK's frame classifier (sdk/petscii/frame/classify.ts) is a verbatim
 * port of ascii-art.util.ts. Until Phase 3 gives the frame module a package
 * export and the backend re-exports it, this pin is what keeps the two
 * copies identical. The SDK source is imported directly, the same way
 * dev-scripts/jest.config.ts maps @amiexpress/bbs-door-sdk/petscii.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as backend from '../../src/utils/ascii-art.util';
import * as sdk from '../../../../sdk/petscii/frame/classify';

const STRIP = /\x1b\[[0-9;?]*[A-Za-z]/g;
const FIXTURES = path.resolve(__dirname, '../../../../sdk/tests/petscii/frame/fixtures');

const TABLE: string[] = [
  '', '   ', '\t\t', '---', '===', '+-+-+', '_____', '~~~~~',
  ' '.repeat(33) + 'text', ' '.repeat(32) + 'regular text here', '    -|-', '      ***',
  'Welcome to the BBS, please enter your name:',
  'Below are the available AmiExpress commands with brief descriptions.',
  '?   - Show the current conf menu  B   - Bulletins',
  '.------------------------------------..--------------------------------------.',
  '| Handle: Sysop                      || Location: Local Console              |',
  '|__|_____|_____|__| cOLORWALL v1.3 (w) bY sHADOW mAN/aFL `94 |__|_____|_____|__|',
  '      uSeR nAME: Sysop                  dOWNLoADeD tODaY: 0 bYTeS',
  '  ND#/Calls    User/PhoneNumber                Location/Action',
  '-============================================================================-',
  'files   browse a door\'s own files on disk',
  '\x1b[9;3Hfiles       browse', '\x1b[0;37;40mplain coloured text', '\x1b[1;33mBOLD YELLOW\x1b[0m',
  // Reaches the artChars>=8 branch specifically (8 dashes, (letters+digits)/
  // length = 9/17 ~= 0.53): clears punctuationRatio>=0.6 (0.47<0.6) and the
  // dead-by-construction symbolCount>=3&&ratio<0.4 branch (0.53 is not <0.4).
  'a-b-c-d-e-f-g-h-i',
];

function fixtureLines(): string[] {
  if (!fs.existsSync(FIXTURES)) return [];
  return fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.ans')).flatMap((f) =>
    fs.readFileSync(path.join(FIXTURES, f), 'utf8').replace(STRIP, '').split(/\r?\n|\r/));
}

describe('SDK classify.ts equals ascii-art.util.ts', () => {
  const lines = [...TABLE, ...fixtureLines()];
  it('looksLikeAsciiArt agrees on every line', () => {
    for (const l of lines) expect({ l, art: sdk.looksLikeAsciiArt(l) }).toEqual({ l, art: backend.looksLikeAsciiArt(l) });
  });
  it('positionsCursorAbsolutely agrees on every line', () => {
    for (const l of lines) expect({ l, pos: sdk.positionsCursorAbsolutely(l) }).toEqual({ l, pos: backend.positionsCursorAbsolutely(l) });
  });
  // The fixture corpus landed with Task 7. This case is the coverage pin: the
  // two cases above silently degrade to the hand-written TABLE if the captures
  // disappear, so assert the captures are there AND report parity per file, so
  // a disagreement names the door it came from.
  it('covers real door output: every captured fixture agrees line for line', () => {
    const files = fs.existsSync(FIXTURES) ? fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.ans')) : [];
    expect(files.length).toBeGreaterThanOrEqual(8);
    expect(fixtureLines().filter((l) => l.trim().length > 0).length).toBeGreaterThan(100);
    for (const f of files) {
      const lines = fs.readFileSync(path.join(FIXTURES, f), 'utf8').replace(STRIP, '').split(/\r?\n|\r/);
      expect({ f, nonBlank: lines.some((l) => l.trim().length > 0) }).toEqual({ f, nonBlank: true });
      for (const l of lines) {
        expect({ f, l, art: sdk.looksLikeAsciiArt(l) }).toEqual({ f, l, art: backend.looksLikeAsciiArt(l) });
        expect({ f, l, pos: sdk.positionsCursorAbsolutely(l) }).toEqual({ f, l, pos: backend.positionsCursorAbsolutely(l) });
      }
    }
  });
});
