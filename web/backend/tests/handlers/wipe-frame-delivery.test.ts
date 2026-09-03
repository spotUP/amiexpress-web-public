/**
 * How a wipe frame reaches the wire.
 *
 * The sysop's report was "the anims dont look buggy now but they flicker a
 * lot". Two mechanisms were measured (ledger:
 * .superpowers/sdd/2026-09-03-screen-wipes/progress.md):
 *
 * 1. Every frame opened with `\x1b[2J` and repainted the whole screen. The
 *    board's terminal queues what it receives and drains it at up to 23 KB/s
 *    (packages/terminal/src/utils/modem-emulator.ts caps even "MAX" at
 *    230400 bps). Nothing is reordered - that queue is strict FIFO and a
 *    text token finishes before the next escape - but a 2.5-10 KB repaint
 *    needs 110-430 ms to arrive for a frame that wants 40, so frame N+1's
 *    clear lands late, in a paint of its own, with its repaint still queued
 *    behind it: a blank screen between every pair of frames.
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

/** What the play loop wraps every frame in (screen.handler.ts:2489-2493). */
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

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
    // The named-wipe fixture, not the board's `~WX`: a random wipe would
    // sometimes be the 3-frame checkerboard and this pin wants an animation.
    const { payloads, frames } = await playMenu(radarPath);

    expect(frames.length).toBeGreaterThan(5);

    // The animation is exactly one write per frame, in order, each carrying
    // that frame whole: not split by a throttle, not merged with its
    // neighbour by an output buffer. Compared as WHOLE payloads - a
    // containment check would be ambiguous, since two frames can end on the
    // same painted run.
    const animationWrites = payloads.filter(p => p.startsWith(HIDE_CURSOR));
    expect(animationWrites).toHaveLength(frames.length);

    for (let i = 0; i < frames.length; i++) {
      const tail = i === frames.length - 1 ? '\x1b[0m' + SHOW_CURSOR : '';
      expect(`frame ${i}: ${animationWrites[i] === HIDE_CURSOR + frames[i].content + tail}`)
        .toBe(`frame ${i}: true`);
    }
  });

  it('no wipe frame clears the screen after the first', async () => {
    const { payloads } = await playMenu();

    const animationWrites = payloads.filter(p => p.startsWith(HIDE_CURSOR));
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
