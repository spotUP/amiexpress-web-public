/**
 * BYTE PIN: the wipe frames the board actually sends, for the three real
 * screens x all ten wipes.
 *
 * Captured BEFORE `renderGridDelta` became an adapter over the shared run
 * differ (`@amiexpress/bbs-door-sdk/common/run-diff`), so the refactor is
 * provably byte-for-byte. Every frame after the first IS `renderGridDelta`'s
 * output, so a sha256 over the whole frame sequence pins the differ through
 * its real caller (`getWipeFrames`, the public entry point) rather than
 * through a hand-built grid.
 *
 * Three of the ten builders draw random filler (matrix, blocks' shuffle,
 * noise), so `Math.random` is replaced by a seeded generator, re-seeded
 * before each case: the animation is then a pure function of the screen and
 * the wipe, and the frame bytes are reproducible.
 *
 * 2026-10-18: checker and noise hashes moved on purpose (CP437 block glyphs
 * replaced by ISO-8859-1 glyphs; byte counts and frame counts unchanged).
 *
 * Nothing here may be edited to make a refactor pass - a changed hash IS the
 * regression.
 *
 * THE INPUT IS FROZEN, and that is what makes the sentence above true. The
 * pin read the board's LIVE screens, so editing a menu changed every hash
 * with no regression anywhere - which is exactly what happened on
 * 2026-09-07 (Conf1/Menu.txt's blocks wipe went 12,633 -> 14,369 bytes
 * because the art changed). The three screens are copied byte for byte into
 * tests/fixtures/board-screens/ and read from there; the differ is now the
 * only thing that can move a hash.
 *
 * The fixtures are named `screens-menu.txt` / `conf1-menu.txt` rather than
 * after their originals: `Screens/MENU.TXT` and `Conf1/Menu.txt` are one
 * filename on a case-folding disk, and copying both into one directory left
 * two of the three screens identical.
 */
process.env.SKIP_DB_INIT = '1';

import * as crypto from 'crypto';
import * as path from 'path';
import { getWipeFrames, parseWipeMCI, WipeType } from '../../src/utils/screen-wipe.util';
import { addAnsiEscapes } from '../../src/handlers/screen.handler';
import { readAmigaTextFileWithTransforms } from '../../src/utils/amiga-text-decode.util';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

/** Frozen copies of the board's three real menus. See the header. */
const FIXTURES = path.join(__dirname, '..', 'fixtures', 'board-screens');
const REAL_SCREENS = ['screens-menu.txt', 'screens-menu250.txt', 'conf1-menu.txt'];

const WIPES: WipeType[] = [
  'matrix', 'hblinds', 'vblinds', 'spiral', 'checker',
  'radial', 'blocks', 'noise', 'typewriter', 'explode',
];

/** Same pipeline the fidelity suite feeds getWipeFrames: what screen.handler hands it. */
function parsedScreen(file: string): string {
  const decoded = readAmigaTextFileWithTransforms(path.join(FIXTURES, file)).text;
  const stripped = parseWipeMCI(decoded).content;
  const expanded = stripped.replace(/~f\r?\n?/g, '\x1b[2J\x1b[H').replace(/~N/g, 'Sysop');
  return addAnsiEscapes(expanded).replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

/** mulberry32 - a deterministic stand-in for Math.random, so the filler cells are reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 0x5eed;

interface Pin {
  frames: number;
  bytes: number;
  sha256: string;
}

/** screen/wipe -> the exact bytes of every frame, pinned. */
const PINS: Record<string, Pin> = {
  'screens-menu.txt/matrix': { frames: 11, bytes: 34352, sha256: '51a874ca68e9b52fc85b796457b3a0988a17f11ba024571ad69bd3027272a857' },
  'screens-menu.txt/hblinds': { frames: 9, bytes: 12165, sha256: '1bd00386820e31187240424ed2175784fa3c63ae007cbae5d2ea82a3977eec53' },
  'screens-menu.txt/vblinds': { frames: 18, bytes: 15660, sha256: '2323206a0991ba5f85ccff414fd91a2f2e8cd29546935a87e1c9c4cc7bcda068' },
  'screens-menu.txt/spiral': { frames: 22, bytes: 14181, sha256: '34072bd0f116a685137581c38bda35d8917d69741324a3ad68d0e7dc10945931' },
  'screens-menu.txt/checker': { frames: 3, bytes: 15911, sha256: '1516630d6fed57200e9264bcb445962b94aaef5f5e98b937fb70056c0f77be73' },
  'screens-menu.txt/radial': { frames: 26, bytes: 16464, sha256: '7ebb43a0e65373c069ee3d66cf30ea72f08d1956e9d541c1aca9bf97441682e4' },
  'screens-menu.txt/blocks': { frames: 17, bytes: 17884, sha256: '60c28f647b98f14cf4565256ab1a0c39bfa916c87d733347871c0234e7a134b5' },
  'screens-menu.txt/noise': { frames: 14, bytes: 34602, sha256: '7a6a4b8583a6327b7d910232a2b4487143d2b5ab359f8cd60f007370cc4885e6' },
  'screens-menu.txt/typewriter': { frames: 12, bytes: 10520, sha256: '26fcc544fd1f168231baf2fa6fc4afa3de35742372ed15eae4db342743e241c5' },
  'screens-menu.txt/explode': { frames: 17, bytes: 17946, sha256: '27d7b1950194007e33a5e2567975c139ea57d3d121651eeae2579f975169b190' },
  'screens-menu250.txt/matrix': { frames: 12, bytes: 34656, sha256: '937e307e1d670b568c0044541cd8eeafa62427c5fa3c8426553a68d90f39e7b6' },
  'screens-menu250.txt/hblinds': { frames: 10, bytes: 8859, sha256: '3ebb336b52cd2e0d819fda4e65a1b29e52f626a7cf2853988ca7f1fe47970c7e' },
  'screens-menu250.txt/vblinds': { frames: 18, bytes: 13110, sha256: '96442187e3108d729e4c6f33aa3b5c7bbcde02b46a880f6de27b5fa1c19d66f7' },
  'screens-menu250.txt/spiral': { frames: 22, bytes: 11020, sha256: 'b4aa5b3b1cee2c8b9db79cb2834db8c47a8230b0dabf947d0e161b1ab195aa7c' },
  'screens-menu250.txt/checker': { frames: 3, bytes: 13249, sha256: '902bc992c02aa1d7938f321e377d356c8c6059b909090a1a50846581d3e4cf41' },
  'screens-menu250.txt/radial': { frames: 26, bytes: 13910, sha256: '6d6475d2ceef658e1b3ac97880d9cf18de68604650c560eb1f3ec49d6f69bdca' },
  'screens-menu250.txt/blocks': { frames: 17, bytes: 15656, sha256: '4bf15d61a87fd4ac58736299b47f072c0337232db71f4af9369ee53cbd433662' },
  'screens-menu250.txt/noise': { frames: 14, bytes: 35183, sha256: '845de2531e30c68ed4ce951b84f7e6f34c5cbb8f1111f8e3385556e2ced1e04e' },
  'screens-menu250.txt/typewriter': { frames: 14, bytes: 6979, sha256: '08b846513f71a6a8fbc899d0c0c9df29123c2318720360fb306b262f663a586f' },
  'screens-menu250.txt/explode': { frames: 17, bytes: 15487, sha256: '1d3e80a68211067dc65775df81e15118fdbc8b110258dedb338f062702e00c00' },
  'conf1-menu.txt/matrix': { frames: 11, bytes: 31735, sha256: 'a5a023829fd762f5068aa4681440f524476fd906db81f9b9386bc49e1c02b642' },
  'conf1-menu.txt/hblinds': { frames: 9, bytes: 8709, sha256: '8c3444ff1215522b68627ea03f08859218bd0550ac5065056d055de528a50985' },
  'conf1-menu.txt/vblinds': { frames: 18, bytes: 12162, sha256: 'dfaed24ab3705041a30deaac16524b2f75bb5651f78a4802bcd04ebe087eb298' },
  'conf1-menu.txt/spiral': { frames: 22, bytes: 10688, sha256: 'd451cad1a70525f240fa9ccb2cb98f6f82057fe8c64093a498c6f38ca50c8ac4' },
  'conf1-menu.txt/checker': { frames: 3, bytes: 12581, sha256: 'dd468e4d5fa0e1f8621fd4d8cca63b012d60155f5f1230846e8a3711df7f37d5' },
  'conf1-menu.txt/radial': { frames: 26, bytes: 13109, sha256: 'aa27166217dcbfef6afe469bddadacde29ba66da9ccb64365a8a7a7268b1c16d' },
  'conf1-menu.txt/blocks': { frames: 17, bytes: 14369, sha256: 'f234b4604581b45fbd2b3762280f5dc3dbc5ddf087ae7da33cc7e7db19c35a86' },
  'conf1-menu.txt/noise': { frames: 14, bytes: 32386, sha256: '55a68b2c4d0f612c083d6db1e849bbd7165e0f2732eaf4d88457036735771b07' },
  'conf1-menu.txt/typewriter': { frames: 13, bytes: 6981, sha256: 'c3c8d1adaeecb46f59bf9b269ec669449b3f49d1305a5ecf88bdfffcceb1eb7d' },
  'conf1-menu.txt/explode': { frames: 17, bytes: 14303, sha256: '5c4783c753235089df314422a20df7af32fb771eefd003975c7fc101e6d746d1' },
};

const realRandom = Math.random;
const parsedScreens = new Map<string, string>();

beforeAll(() => {
  for (const file of REAL_SCREENS) parsedScreens.set(file, parsedScreen(file));
});

afterAll(() => {
  Math.random = realRandom;
});

function pinFor(file: string, wipe: WipeType): Pin {
  Math.random = seededRandom(SEED);
  const frames = getWipeFrames(wipe, parsedScreens.get(file)!);
  Math.random = realRandom;

  const joined = frames.map((f) => `${f.delay} ${f.content}`).join(' ');
  return {
    frames: frames.length,
    bytes: frames.reduce((n, f) => n + f.content.length, 0),
    sha256: crypto.createHash('sha256').update(joined, 'utf8').digest('hex'),
  };
}

describe('wipe frame byte pin (three real screens x ten wipes)', () => {
  it('sends the same bytes it did before the shared run differ', () => {
    const actual: Record<string, Pin> = {};
    for (const file of REAL_SCREENS) {
      for (const wipe of WIPES) actual[`${file}/${wipe}`] = pinFor(file, wipe);
    }
    expect(actual).toEqual(PINS);
  });
});
