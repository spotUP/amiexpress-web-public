/**
 * How a wipe frame reaches the wire.
 *
 * The sysop's report was "the anims dont look buggy now but they flicker a
 * lot". Two mechanisms were measured (ledger:
 * .superpowers/sdd/2026-09-03-screen-wipes/progress.md):
 *
 * 1. Every frame opened with `\x1b[2J` and repainted the whole screen. On
 *    xterm.js the clear and the repaint do not have to land in the same
 *    render frame, and the board's terminal paces what it receives
 *    (packages/terminal/src/utils/modem-emulator.ts caps even "MAX" at
 *    230400 bps = 23 KB/s, and writes escape sequences AHEAD of the text
 *    still draining), so the clear of frame N+1 fired while frame N was
 *    still painting: a blank screen between every pair of frames.
 * 2. A frame must be ONE write. If the wipe's own chunking were re-cut by
 *    the server-side modem throttle, or merged by the 16 ms AnsiBuffer
 *    (utils/ansi-buffer.util.ts), the animation's timing would be someone
 *    else's. The play loop emits through `socket._directEmit`
 *    (screen.handler.ts:2484) for exactly that reason - this pins it.
 *
 * Harness (socket stub, absolute-path seam, real loadScreenFile) follows
 * tests/handlers/petscii-wipe-off.test.ts.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/utils/screen-wipe.util', () => {
  const actual = jest.requireActual('../../src/utils/screen-wipe.util');
  return {
    ...actual,
    // A spy that still does the real work: the frames it returns are the
    // frames the play loop must put on the wire, one write each.
    getWipeFrames: jest.fn(actual.getWipeFrames),
  };
});

import { displayScreen } from '../../src/handlers/screen.handler';
import { getWipeFrames, WipeFrame } from '../../src/utils/screen-wipe.util';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

let tmpDir: string;
let menuPath: string;
let radarPath: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wipe-delivery-'));
  menuPath = path.join(tmpDir, 'MENU250.TXT');
  fs.copyFileSync(path.join(REPO_ROOT, 'Screens/MENU250.TXT'), menuPath);

  // The same screen with a NAMED wipe: `~WX` is random, and a timing pin
  // needs a known frame count. `~WR` is 25 frames at the builder's 25 ms.
  // Byte surgery, never a text rewrite: the art's high bits must survive.
  const bytes = fs.readFileSync(menuPath);
  expect(bytes.subarray(0, 3).toString('latin1')).toBe('~WX');
  bytes[2] = 'R'.charCodeAt(0);
  radarPath = path.join(tmpDir, 'RADAR.TXT');
  fs.writeFileSync(radarPath, bytes);
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* scratch */ }
});

beforeEach(() => {
  (getWipeFrames as jest.Mock).mockClear();
});

let seq = 0;
async function playMenu(file?: string): Promise<{ payloads: string[]; frames: WipeFrame[]; elapsed: number }> {
  const payloads: string[] = [];
  const socket = {
    id: `wipe-delivery-${seq++}`,
    emit: (event: string, data: any) => {
      if (event === 'ansi-output') payloads.push(String(data));
      return true;
    },
    on: () => {},
  };
  const session: any = { screenWidth: 80, screenHeight: 25, nodeId: 0 };

  const started = Date.now();
  expect(await displayScreen(socket as any, session, file ?? menuPath)).toBe(true);
  const elapsed = Date.now() - started;
  expect(getWipeFrames).toHaveBeenCalledTimes(1);
  const frames = (getWipeFrames as jest.Mock).mock.results[0].value as WipeFrame[];
  return { payloads, frames, elapsed };
}

describe('wipe frame delivery', () => {
  it('a frame is delivered as one write', async () => {
    const { payloads, frames } = await playMenu();

    expect(frames.length).toBeGreaterThan(5);
    // Every frame arrives whole, in exactly one payload: not split by a
    // throttle, not merged with its neighbour by an output buffer.
    for (let i = 0; i < frames.length; i++) {
      const carrying = payloads.filter(p => p.includes(frames[i].content));
      expect(`frame ${i} written ${carrying.length} time(s)`).toBe(`frame ${i} written 1 time(s)`);
    }
    // ...and the animation is exactly that many writes, no more.
    const animationWrites = payloads.filter(p => p.startsWith('\x1b[?25l'));
    expect(animationWrites).toHaveLength(frames.length);
  });

  it('no wipe frame clears the screen after the first', async () => {
    const { payloads } = await playMenu();

    const animationWrites = payloads.filter(p => p.startsWith('\x1b[?25l'));
    expect(animationWrites[0]).toContain('\x1b[2J\x1b[H');
    const clearsLater = animationWrites.slice(1).filter(p => /\x1b\[[23]J/.test(p));
    expect(`frames clearing after the first: ${clearsLater.length}`).toBe('frames clearing after the first: 0');
  });

  it('the animation is not paced by the 50 ms floor the builders never asked for', async () => {
    // `~WR` is 25 frames the builder wants 25 ms apart. The play loop's floor
    // used to be 50 ms, which overrode every builder delay below it and
    // stretched this sweep from 625 ms to 1.25 s of slideshow. The floor is
    // now one 60 Hz tick (16 ms), so the builder's own pacing decides.
    const { frames, elapsed } = await playMenu(radarPath);

    const animation = frames.slice(0, -1);
    const atNewFloor = animation.reduce((total, f) => total + Math.max(16, f.delay), 0);
    const atOldFloor = animation.reduce((total, f) => total + Math.max(50, f.delay), 0);
    expect(atOldFloor).toBeGreaterThan(atNewFloor * 1.5);   // the pin discriminates

    expect(`slept at least the builder's pacing: ${elapsed >= atNewFloor * 0.8}`)
      .toBe(`slept at least the builder's pacing: true`);
    expect(`slept less than the old 50 ms floor: ${elapsed < atOldFloor * 0.9}`)
      .toBe(`slept less than the old 50 ms floor: true`);
  });
});
