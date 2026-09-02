/**
 * CARD LOBBY stays open.
 *
 * Reported 2026-09-02: "cardlobby renders the lobby and exits". run() painted
 * the lobby, called cleanup() and RETURNED - and the promise `door.onStart`
 * awaits is the door's whole lifetime, so the SDK tore the screen down the
 * instant it was drawn and the board's menu came back over it. Every exit
 * path already went through shutdown(); the door simply never waited for one.
 *
 * Driven, not read: the app is started against a stubbed session with a real
 * blessed screen, and the test asserts the promise is still PENDING after the
 * lobby is up. A source check for `new Promise` would pass on a door that
 * resolves it immediately.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** Nothing here may write to the real board. */
process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-test-'));

interface Harness {
  app: any;
  /** Resolves only when the door is really finished. */
  finished: Promise<void>;
  settled: () => boolean;
  calls: string[];
}

async function open(): Promise<Harness> {
  const { CardLobbyApp } = await import('../index');

  const calls: string[] = [];
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => calls.push('wide'),
    disableWideMode: () => calls.push('fixed'),
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, screenHeight: 25, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  };

  const app = new CardLobbyApp(session);

  let settled = false;
  const finished = app.run().then(() => { settled = true; });

  // The loader spends ~600 ms getting to 'Ready!'; a door that tears itself
  // down does it inside that window.
  await new Promise((r) => setTimeout(r, 1500));

  return { app, finished, settled: () => settled, calls };
}

export async function theDoorStaysOpenAfterTheLobbyIsPainted(): Promise<void> {
  const h = await open();
  assert.strictEqual(h.settled(), false,
    'run() resolved while the lobby was on screen - the SDK ends the door when it does');
  await h.app.shutdown();
  await h.finished;
}

export async function shutdownIsWhatEndsIt(): Promise<void> {
  // The other half: holding the door open is only correct if the exit path
  // still lets go. Q, Ctrl+C and a lost socket all reach shutdown().
  const h = await open();
  await h.app.shutdown();
  await h.finished;
  assert.strictEqual(h.settled(), true, 'shutdown() must let run() return');
}

export async function theDoorOpensAtTheSizeTheBoardServes(): Promise<void> {
  // A door looks like the board it opened from until the caller asks for
  // more with Alt+Enter, which is why the switch starts 'fixed'.
  const h = await open();
  assert.deepStrictEqual(h.calls, ['fixed'], 'card-lobby must not open wide');
  await h.app.shutdown();
  await h.finished;
}

export async function leavingHandsTheBoardsColumnsBack(): Promise<void> {
  const h = await open();
  h.app.terminalMode.set('wide');
  await h.app.shutdown();
  await h.finished;
  assert.strictEqual(h.calls[h.calls.length - 1], 'fixed',
    'the last thing the door does is give the board its 80 columns back');
}
