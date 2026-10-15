/**
 * The pause after LOGON survives the `~SP`s inside it.
 *
 * express.e shows LOGON and then pauses before the bulletins (login-post's
 * `pauseAfterLogon`). The live LOGON is `~CC_gl ~SP / uprough ~SP / quicknew`:
 * its first `~SP` puts up a prompt of its own, and the pause after the screen
 * was treated as already paid by it. quicknew - the last piece - was drawn and
 * wiped by BULL's clear in the same breath: "there is no pause after
 * quicknew" (the sysop, 2026-09-24). NODE_BULL had the same debt
 * (`the-last-segment-is-readable.test.ts`); LOGON now books it the same way.
 *
 * Driven through the real loader, real files, the real post-LOGON pause and
 * the real keypress entry point.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { handleCommand } from '../../src/handlers/command.handler';
import { displayScreen } from '../../src/handlers/screen.handler';
import { pauseAfterLogon } from '../../src/services/login-post.service';
import { config } from '../../src/config';

interface Emit { event: string; data: string }

function aBoard(logon: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trailing-pause-'));
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Node1', 'LOGON.TXT'), logon, 'latin1');
  // BULL clears, which is what made the lost pause visible.
  fs.writeFileSync(path.join(root, 'Screens', 'BULL.TXT'), '\x0cBULLETIN\r\n', 'latin1');
  return root;
}

function aCaller() {
  const emits: Emit[] = [];
  const socket = {
    id: `trailing-pause-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) =>
      emits.push({ event, data: typeof data === 'string' ? data : '' }),
    on: () => {},
  } as any;
  const session = {
    nodeId: 1,
    state: BBSState.LOGGEDON,
    currentConf: 1,
    relConfNum: 1,
    ansiEnabled: true,
    user: { username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X' },
    tempData: {},
  } as any;
  return { socket, session, emits };
}

const wire = (emits: Emit[]) => emits.map((e) => e.data).join('');

/** login-post's order: show LOGON, hand the caller to the flow, then its pause. */
async function logOn(socket: any, session: any) {
  const shown = await displayScreen(socket, session, 'LOGON', false);
  session.subState = LoggedOnSubState.DISPLAY_BULL;
  if (shown) pauseAfterLogon(socket, session);
}

describe('a LOGON screen split by ~SP', () => {
  const originalRoot = config.get('dataDir');
  afterEach(() => config.set('dataDir', originalRoot));

  it('stops on its last piece instead of letting BULL clear it', async () => {
    config.set('dataDir', aBoard('~ LOGO\r\n~SP\r\nQUICKNEW\r\n'));
    const { socket, session, emits } = aCaller();

    await logOn(socket, session);
    await handleCommand(socket, session, '\r'); // past LOGO

    expect(wire(emits)).toContain('QUICKNEW');
    expect(wire(emits)).not.toContain('BULLETIN');
    expect(session.paginatedScreen).toBeTruthy();
  });

  it('moves on to BULL once that pause is answered, one key per pause', async () => {
    config.set('dataDir', aBoard('~ LOGO\r\n~SP\r\nQUICKNEW\r\n'));
    const { socket, session, emits } = aCaller();

    await logOn(socket, session);
    await handleCommand(socket, session, '\r');
    await handleCommand(socket, session, '\r');

    expect(wire(emits)).toContain('BULLETIN');
  });

  it('pauses once after an unsplit LOGON, as it always did', async () => {
    // The round trip: a LOGON with no `~SP` gets the one pause after it and
    // nothing more.
    config.set('dataDir', aBoard('~ LOGO ONLY\r\n'));
    const { socket, session, emits } = aCaller();

    await logOn(socket, session);
    expect(session.paginatedScreen).toBeTruthy();
    expect(session.flowPauseAfterSegments).toBeFalsy();
    await handleCommand(socket, session, '\r');

    expect(wire(emits)).toContain('BULLETIN');
  });
});
