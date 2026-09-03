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
 * Nothing here may be edited to make a refactor pass - a changed hash IS the
 * regression.
 */
process.env.SKIP_DB_INIT = '1';

import * as crypto from 'crypto';
import * as path from 'path';
import { getWipeFrames, parseWipeMCI, WipeType } from '../../src/utils/screen-wipe.util';
import { addAnsiEscapes } from '../../src/handlers/screen.handler';
import { readAmigaTextFileWithTransforms } from '../../src/utils/amiga-text-decode.util';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

const REAL_SCREENS = ['Screens/MENU.TXT', 'Screens/MENU250.TXT', 'Conf1/Menu.txt'];

const WIPES: WipeType[] = [
  'matrix', 'hblinds', 'vblinds', 'spiral', 'checker',
  'radial', 'blocks', 'noise', 'typewriter', 'explode',
];

/** Same pipeline the fidelity suite feeds getWipeFrames: what screen.handler hands it. */
function parsedScreen(file: string): string {
  const decoded = readAmigaTextFileWithTransforms(path.join(REPO_ROOT, file)).text;
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
  'Screens/MENU.TXT/matrix': { frames: 12, bytes: 37775, sha256: '87d96e4bfd8a8e672876a2c7c204419a309214152f75223f8e14feaa90f7711e' },
  'Screens/MENU.TXT/hblinds': { frames: 9, bytes: 11990, sha256: '5cf1b7bce2d73c42d1a26631a2da535b4a5ab1b7e5748b36a03b95a3f8522fa1' },
  'Screens/MENU.TXT/vblinds': { frames: 18, bytes: 16086, sha256: '08c0a2e8c71123fce61e7dfd726d793c38eede5a81ba063e030e0e0e81a0c2be' },
  'Screens/MENU.TXT/spiral': { frames: 22, bytes: 14326, sha256: '7f8ad163057afd933f9f7c1e90083f172da20be57033146464905e67816ea907' },
  'Screens/MENU.TXT/checker': { frames: 3, bytes: 16046, sha256: '6b377f66e78da4022fbc825486d59a4be8c211c4b7395bf068a1b5e74d890db5' },
  'Screens/MENU.TXT/radial': { frames: 26, bytes: 16844, sha256: '7a296f1667d281c98a51e1e3ab2c58eb78dc74f884fac90e5c0a400f5d18a31a' },
  'Screens/MENU.TXT/blocks': { frames: 17, bytes: 18773, sha256: '056fd8162ae6847af25f92c08f2325dbe01814eff7b195037d263af4a5eb18c2' },
  'Screens/MENU.TXT/noise': { frames: 14, bytes: 37800, sha256: '8ea7946cd8233c12bb99ae5c88a4108e5bed07e2dabede129696c14204ccc0bf' },
  'Screens/MENU.TXT/typewriter': { frames: 13, bytes: 10139, sha256: '1eea4c1dea32aef6e25ed0b7051a76fc18cf5222dcd2b583ade0baad8bb9587f' },
  'Screens/MENU.TXT/explode': { frames: 17, bytes: 18589, sha256: '1199aadf91c64d9c60273553bb031a4f6f75de8948ef95a8e0ec49a92c43c576' },
  'Screens/MENU250.TXT/matrix': { frames: 12, bytes: 34656, sha256: '937e307e1d670b568c0044541cd8eeafa62427c5fa3c8426553a68d90f39e7b6' },
  'Screens/MENU250.TXT/hblinds': { frames: 10, bytes: 8859, sha256: '3ebb336b52cd2e0d819fda4e65a1b29e52f626a7cf2853988ca7f1fe47970c7e' },
  'Screens/MENU250.TXT/vblinds': { frames: 18, bytes: 13110, sha256: '96442187e3108d729e4c6f33aa3b5c7bbcde02b46a880f6de27b5fa1c19d66f7' },
  'Screens/MENU250.TXT/spiral': { frames: 22, bytes: 11020, sha256: 'b4aa5b3b1cee2c8b9db79cb2834db8c47a8230b0dabf947d0e161b1ab195aa7c' },
  'Screens/MENU250.TXT/checker': { frames: 3, bytes: 13249, sha256: '9bf49b8e2a5c4161fca514d7104d0f61f89dd4b9f5183053324292fcefeb4c65' },
  'Screens/MENU250.TXT/radial': { frames: 26, bytes: 13910, sha256: '6d6475d2ceef658e1b3ac97880d9cf18de68604650c560eb1f3ec49d6f69bdca' },
  'Screens/MENU250.TXT/blocks': { frames: 17, bytes: 15656, sha256: '4bf15d61a87fd4ac58736299b47f072c0337232db71f4af9369ee53cbd433662' },
  'Screens/MENU250.TXT/noise': { frames: 14, bytes: 35183, sha256: '1e268f5957b7b5a74ceef2d34032655ddeb8a78ebcea2e883504361380b0ae95' },
  'Screens/MENU250.TXT/typewriter': { frames: 14, bytes: 6979, sha256: '08b846513f71a6a8fbc899d0c0c9df29123c2318720360fb306b262f663a586f' },
  'Screens/MENU250.TXT/explode': { frames: 17, bytes: 15487, sha256: '1d3e80a68211067dc65775df81e15118fdbc8b110258dedb338f062702e00c00' },
  'Conf1/Menu.txt/matrix': { frames: 11, bytes: 30056, sha256: '40b54a07f6b4f796cb640cb284936d554e9c3b0b1f667ac56dd4238dccf2c50e' },
  'Conf1/Menu.txt/hblinds': { frames: 9, bytes: 7460, sha256: '56bbbc064760297c81a9f46e5c837f87ae2442d159fbba37c6655f2fed656bc5' },
  'Conf1/Menu.txt/vblinds': { frames: 18, bytes: 10746, sha256: '344e8ed23ffb36ca6b9a6f324a3090436b899dcdfaab3b385e66ec4f220e182d' },
  'Conf1/Menu.txt/spiral': { frames: 22, bytes: 9904, sha256: '10db8145499c8c1adafabf835abfe3d24bc6f62cf7980b20811df2423cbcaf4d' },
  'Conf1/Menu.txt/checker': { frames: 3, bytes: 11295, sha256: '11ab6df2edc5a3b4a352fc639b5a989c95845899e3411b96fc993e1a0d6a113f' },
  'Conf1/Menu.txt/radial': { frames: 26, bytes: 11749, sha256: '17874a6f4901ed986e3b2a92451ab437725e658a1c8296fcac3c62499d3c862e' },
  'Conf1/Menu.txt/blocks': { frames: 17, bytes: 12633, sha256: '23d53e01aea55091ea28f7c0afa9ab5fb2b47d5dc5debe2cfc2532528510027e' },
  'Conf1/Menu.txt/noise': { frames: 14, bytes: 30868, sha256: '64bbdf07dbdec9952a4219d2388a8c858b90f32190f309ad4723a64b12829492' },
  'Conf1/Menu.txt/typewriter': { frames: 13, bytes: 5755, sha256: '08960449e026ce6583300565040ddf9d1d580194c94ea1d063769e3eeaa66b60' },
  'Conf1/Menu.txt/explode': { frames: 17, bytes: 13090, sha256: 'eacd6ab5cf2f17e4fa9f5359d36c152e5c25d37002ff1162e16c2ae906cb9d8f' },
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
