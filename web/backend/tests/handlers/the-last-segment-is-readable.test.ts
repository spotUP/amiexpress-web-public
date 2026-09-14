/**
 * The last piece of a `~SP`-split screen must be readable.
 *
 * A `~SP` pauses INSIDE a screen (express.e:5455-5461). The display flow
 * pauses AFTER one - `IF (displayScreen(SCREEN_NODE_BULL)) THEN doPause()`
 * (express.e:28557). Two different pauses, and `pauseDisplayFlow` was
 * answering "already paused, nothing owed" the moment it saw the FIRST `~SP`
 * sitting on the session.
 *
 * So every segment but the last got a pause, and the last got the next
 * screen's clear. On this board NODE_BULL is five MultiTop bulletins joined by
 * `~SP`, which made bull5 the one nobody could read - it was drawn and erased
 * in the same breath by ACHIEVETOP. The sysop, 2026-09-14: "the last multitop
 * has no pause".
 *
 * Same shape as the tip door erasing the join listing
 * (`the-tip-does-not-wipe-the-join.test.ts`): something clears the screen
 * before the caller has read what is on it. Different place, same debt spent
 * in the wrong order.
 *
 * Driven through the real loader with real files on disk and the real
 * keypress entry point, because the bug lives in the handover between
 * displayScreen, the segment walker and the flow - a unit test of any one of
 * the three would have passed, and did.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { advanceDisplayFlow, handleCommand } from '../../src/handlers/command.handler';
import { config } from '../../src/config';

interface Emit { event: string; data: string }

/**
 * A board whose node bulletin is three pieces joined by `~SP`, and an
 * achievements screen that CLEARS - which is what made the loss visible.
 */
function aBoardWithASplitBulletin(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'last-segment-'));
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  // The leading `~` is express.e's per-file MCI gate (express.e:6800-6806).
  fs.writeFileSync(
    path.join(root, 'Node1', 'BULL.TXT'),
    '~ FIRST BULLETIN\r\n~SP\r\nSECOND BULLETIN\r\n~SP\r\nTHIRD BULLETIN\r\n',
    'latin1',
  );
  fs.writeFileSync(
    path.join(root, 'Screens', 'AchieveTop.txt'),
    '\x0cACHIEVEMENTS\r\n',
    'latin1',
  );
  return root;
}

function aCaller() {
  const emits: Emit[] = [];
  const socket = {
    // Per-caller id: the output buffer is keyed by socket id, so a shared one
    // flushes this test's bytes into another test's socket.
    id: `last-segment-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) =>
      emits.push({ event, data: typeof data === 'string' ? data : '' }),
    on: () => {},
  } as any;
  const session = {
    nodeId: 1,
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.DISPLAY_NODE_BULL,
    currentConf: 1,
    relConfNum: 1,
    ansiEnabled: true,
    user: { username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X' },
    tempData: {},
  } as any;
  return { socket, session, emits };
}

const wire = (emits: Emit[]) => emits.map((e) => e.data).join('');

describe('a node bulletin split by ~SP', () => {
  const originalRoot = config.get('dataDir');

  beforeEach(() => {
    config.set('dataDir', aBoardWithASplitBulletin());
  });

  afterEach(() => {
    config.set('dataDir', originalRoot);
  });

  /** Walk the flow, answering every pause, and report what reached the wire. */
  async function readThrough(steps: number) {
    const { socket, session, emits } = aCaller();
    await advanceDisplayFlow(socket, session);
    for (let i = 0; i < steps; i++) {
      if (!session.paginatedScreen) break;
      await handleCommand(socket, session, '\r');
    }
    return { socket, session, emits };
  }

  it('holds after the last piece instead of letting the next screen take it', async () => {
    // Two keys: one past FIRST, one past SECOND. THIRD then draws and the
    // flow must stop on it of its own accord.
    const { session, emits } = await readThrough(2);

    // The third bulletin is on screen AND the flow has stopped ON IT.
    //
    // `paginatedScreen` alone is not the assertion: the broken code also
    // leaves a pause on the session - ACHIEVETOP's own, installed after it
    // had already wiped the bulletin. The state is what tells them apart.
    // Stopped here means still DISPLAY_ACHIEVE_BULL, with that screen not
    // yet drawn; run on means the flow is past it, at the conference scan.
    expect(wire(emits)).toContain('THIRD BULLETIN');
    expect(session.paginatedScreen).toBeTruthy();
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_ACHIEVE_BULL);
  });

  it('does not draw the next screen over it', async () => {
    const { emits } = await readThrough(2);

    const stream = wire(emits);
    const third = stream.indexOf('THIRD BULLETIN');
    expect(third).toBeGreaterThanOrEqual(0);
    // Nothing after the last bulletin, so nothing to erase it.
    expect(stream.slice(third)).not.toContain('ACHIEVEMENTS');
  });

  it('still shows the earlier pieces one pause at a time', async () => {
    // The `~SP` pauses themselves are unchanged - this fix adds one at the
    // end, it does not replace the ones along the way.
    const { emits } = await readThrough(1);

    const stream = wire(emits);
    expect(stream).toContain('FIRST BULLETIN');
    expect(stream).toContain('SECOND BULLETIN');
    expect(stream).not.toContain('THIRD BULLETIN');
  });

  it('moves on once that last pause is answered', async () => {
    // The pause is a pause, not a dead end: the flow continues to the next
    // screen when the caller presses a key.
    const { socket, session, emits } = await readThrough(2);

    await handleCommand(socket, session, '\r');

    expect(wire(emits)).toContain('ACHIEVEMENTS');
  });

  it('asks for only one key at the end, not two', async () => {
    // `flowPauseAfterSegments` is cleared when it is spent. A flag left set
    // would stop the flow again on the next screen that paginates.
    const { session } = await readThrough(2);

    expect(session.flowPauseAfterSegments).toBeFalsy();
  });

  it('leaves an unsplit screen with the single pause it always had', async () => {
    // The round trip. A bulletin with no `~SP` never had this debt, and must
    // not acquire one - otherwise every board gains a keypress per screen.
    const root = config.get('dataDir') as string;
    fs.writeFileSync(path.join(root, 'Node1', 'BULL.TXT'), '~ ONE PIECE ONLY\r\n', 'latin1');
    const { socket, session, emits } = aCaller();

    await advanceDisplayFlow(socket, session);
    expect(session.flowPauseAfterSegments).toBeFalsy();

    if (session.paginatedScreen) await handleCommand(socket, session, '\r');

    // One keypress was enough to get past it and on with the flow.
    expect(wire(emits)).toContain('ONE PIECE ONLY');
    expect(session.flowPauseAfterSegments).toBeFalsy();
  });
});
