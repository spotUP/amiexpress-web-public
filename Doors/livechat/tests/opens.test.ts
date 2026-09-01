/**
 * LiveChat opens at the size of the caller's terminal, in the BBS too.
 *
 * Reported 2026-09-01: "livechat has issues opening fullscreen responsive
 * mode in the bbs like sprited had". It had exactly SPRITED's bug, in the
 * form the door had written down for itself: responsive is three things -
 * ask the terminal to widen, follow the resize, put the 80 columns back -
 * and this door did the second, did the third only sometimes, and did the
 * FIRST only on the standalone /chat page. Inside the BBS it laid a
 * responsive UI out inside a terminal that had never been asked to grow.
 *
 * Driven, not read: the door is started with a stubbed session, because a
 * test that greps the source for enableWideMode would have passed all along
 * (the call was there, behind `if (chatOnly)`).
 */

import assert from 'assert';
import { createApp } from '../server';

interface Harness {
  app: any;
  calls: string[];
  screen: any;
  fire: (event: string, ...args: unknown[]) => void;
}

async function open(chatOnly: boolean): Promise<Harness> {
  const calls: string[] = [];
  const handlers = new Map<string, Array<(...a: any[]) => void>>();
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => calls.push('wide'),
    disableWideMode: () => calls.push('fixed'),
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = {
    on: (event: string, fn: (...a: any[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
    },
    emit: () => {}, off: () => {}, removeAllListeners: () => {},
  };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, tempData: { chatOnly }, socket },
    user: { id: 1, name: 'sysop', accessLevel: 255 },
  };

  const app: any = await createApp(session);
  return {
    app, calls,
    screen: (app as any).screen ?? null,
    fire: (event, ...args) => (handlers.get(event) ?? []).forEach(fn => fn(...args)),
  };
}

export async function openingInsideTheBbsAsksTheTerminalToWiden(): Promise<void> {
  const h = await open(false);
  assert.deepStrictEqual(h.calls, ['wide'],
    'the door inside the BBS must ask for the caller’s real terminal - it did not, ' +
    'so a responsive layout was drawn in a terminal fixed at 80x25');
  h.app.state.running = false;
}

export async function theStandaloneChatPageStillWidens(): Promise<void> {
  const h = await open(true);
  assert.deepStrictEqual(h.calls, ['wide'], 'the /chat page is unchanged');
  h.app.state.running = false;
}

export async function leavingPutsTheBoardsEightyColumnsBack(): Promise<void> {
  // Through the door's own exit path: a socket disconnect runs cleanup().
  const h = await open(false);
  h.fire('disconnect', 'transport close');
  assert.deepStrictEqual(h.calls, ['wide', 'fixed'],
    'a caller returning to the BBS gets its 80 columns back, standalone page or not');
}

export async function leavingTwiceStillLeavesOnce(): Promise<void> {
  // Two paths call cleanup() - the socket's disconnect handler and run()'s
  // finally - so the switch has to be safe to dispose twice.
  const h = await open(false);
  h.fire('disconnect', 'transport close');
  h.fire('disconnect', 'transport close');
  assert.deepStrictEqual(h.calls, ['wide', 'fixed'],
    'the columns are handed back once, not once per exit path');
}

// Alt+Enter itself is the SDK switch's own contract and is covered by
// sdk/tests/unit/terminal-mode.test.ts; what this door has to get right is
// asking for the room at all, and handing it back.
