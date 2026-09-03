/**
 * An ANSI animation screen is paced TWICE, and the slower pacer wins.
 *
 * `displayScreen` detects a cursor-dense screen (`isAnsiAnimation`) and
 * forces 14.4 kbps "regardless of user's modem speed" - but it forced it
 * only on the SERVER throttle. The client's ModemEmulator
 * (packages/terminal/src/utils/modem-emulator.ts) meters exactly the same
 * printable characters, at the CALLER's baud, and it is downstream: it
 * decides what the caller actually sees.
 *
 * Measured on `Screens/flt.txt` (10,963 B, 1,190 printable characters,
 * ledger .superpowers/sdd/2026-09-03-wipe-client-pacing/progress.md):
 *
 *   server-forced 14400 alone ....... 826 ms   (the intent)
 *   + client at 14400 ............... 978 ms
 *   + client at 2400 .............. 5,774 ms   (7x the intent)
 *
 * The fix is the one the door path already uses: tell the client the speed
 * (`modem-speed`, door.handler.ts:2034/2405) and put it back afterwards.
 * NOT the `PRE_PACED` attribute the wipes carry - this sequence is
 * BYTE-paced, and byte pacing is what Socket.IO's transport batching
 * destroys, which is why a client-side pacer exists at all.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

import { displayScreen } from '../../src/handlers/screen.handler';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

let tmpDir: string;
let logoPath: string;
let plainPath: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-speed-'));
  logoPath = path.join(tmpDir, 'FLT.TXT');
  // Byte copy: the logo's high bits are art, never to be re-encoded.
  fs.copyFileSync(path.join(REPO_ROOT, 'Screens/flt.txt'), logoPath);
  plainPath = path.join(tmpDir, 'PLAIN.TXT');
  fs.copyFileSync(path.join(REPO_ROOT, 'Screens/MENU250.TXT'), plainPath);
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* scratch */ }
});

interface Emitted { event: string; data: unknown }

let seq = 0;
/**
 * `enabled` is passed separately from `bps` because they are separate
 * facts: MAX is modem emulation ON at bps 0 (the client's own
 * `enable(0)` -> 230400 soft cap), not modem emulation off.
 */
async function show(file: string, bps: number, enabled = bps > 0): Promise<Emitted[]> {
  const events: Emitted[] = [];
  const socket = {
    id: `anim-speed-${seq++}`,
    emit: (event: string, data: unknown) => {
      events.push({ event, data });
      return true;
    },
    on: () => {},
  };
  const session: any = {
    screenWidth: 80,
    screenHeight: 25,
    nodeId: 0,
    modemEmulationEnabled: enabled,
    modemBps: bps,
  };
  expect(await displayScreen(socket as any, session, file)).toBe(true);
  // restoreModemState waits for the server queue to drain before restoring.
  await new Promise((resolve) => setTimeout(resolve, 60));
  return events;
}

describe('a forced-speed ANSI animation', () => {
  it('tells the client pacer the speed it forced, before any of the screen', async () => {
    const events = await show(logoPath, 2400);

    const speeds = events.filter((e) => e.event === 'modem-speed').map((e) => e.data);
    expect(`forced speed announced: ${speeds[0]}`).toBe('forced speed announced: 14400');

    const firstSpeed = events.findIndex((e) => e.event === 'modem-speed');
    const firstOutput = events.findIndex((e) => e.event === 'ansi-output');
    expect(firstOutput).toBeGreaterThan(-1);
    expect(`speed announced before the screen: ${firstSpeed < firstOutput}`)
      .toBe('speed announced before the screen: true');
  });

  it("puts the caller's own speed back when the animation is over", async () => {
    const events = await show(logoPath, 2400);

    const speeds = events.filter((e) => e.event === 'modem-speed').map((e) => e.data);
    expect(`speed changes: ${JSON.stringify(speeds)}`).toBe('speed changes: [14400,2400]');
  });

  it("puts a MAX caller back to MAX, not to a speed they never chose", async () => {
    // MAX is modem emulation ON at bps 0: the client maps 0 to its
    // MAX_SOFT_CAP_BPS (230400). Restoring "0" is therefore restoring MAX,
    // and the caller must not be left at the animation's forced 14400 -
    // the whole rest of the call would paint at 1.4 KB/s.
    const events = await show(logoPath, 0, true);

    const speeds = events.filter((e) => e.event === 'modem-speed').map((e) => e.data);
    expect(`speed changes: ${JSON.stringify(speeds)}`).toBe('speed changes: [14400,0]');
  });

  it('says nothing about speed for an ordinary screen', async () => {
    const events = await show(plainPath, 2400);

    const speeds = events.filter((e) => e.event === 'modem-speed');
    expect(`speed changes on a plain screen: ${speeds.length}`)
      .toBe('speed changes on a plain screen: 0');
  });
});
