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
  toggle: () => void;
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
    screen: app.screen ?? null,
    toggle: () => app.terminalMode?.toggle(),
    fire: (event, ...args) => (handlers.get(event) ?? []).forEach(fn => fn(...args)),
  };
}

export async function openingInsideTheBbsStaysAtEightyColumns(): Promise<void> {
  // "livechat opened in responsive mode by default in the bbs it should
  // not" - the room is something the caller asks for with Alt+Enter, the
  // same as GRANDMASTER. What it must NOT do is what it did before any of
  // this: be unable to widen at all.
  const h = await open(false);
  assert.deepStrictEqual(h.calls, ['fixed'],
    'the door opens at the size the board serves');
  h.app.state.running = false;
}

export async function theStandaloneChatPageStillWidens(): Promise<void> {
  // /chat IS the whole browser window; there is no board around it to
  // match, and it has always opened wide.
  const h = await open(true);
  assert.deepStrictEqual(h.calls, ['wide'], 'the /chat page is unchanged');
  h.app.state.running = false;
}

export async function leavingPutsTheBoardsEightyColumnsBack(): Promise<void> {
  // Through the door's own exit path: a socket disconnect runs cleanup().
  const h = await open(true);          // the page that opens wide
  h.fire('disconnect', 'transport close');
  assert.deepStrictEqual(h.calls, ['wide', 'fixed'],
    'a caller returning to the BBS gets its 80 columns back, standalone page or not');
}

export async function leavingTwiceStillLeavesOnce(): Promise<void> {
  // Two paths call cleanup() - the socket's disconnect handler and run()'s
  // finally - so the switch has to be safe to dispose twice.
  const h = await open(true);
  h.fire('disconnect', 'transport close');
  h.fire('disconnect', 'transport close');
  assert.deepStrictEqual(h.calls, ['wide', 'fixed'],
    'the columns are handed back once, not once per exit path');
}

// Alt+Enter itself is the SDK switch's own contract and is covered by
// sdk/tests/unit/terminal-mode.test.ts; what this door has to get right is
// asking for the room at all, and handing it back.

/**
 * Alt+Enter off puts the UI back inside 80 columns.
 *
 * "it did not snap back to 80x25 when i toggled it off" (2026-09-01). The
 * terminal itself does snap - BBSTerminal resizes to 80x25 the moment it
 * hears 'fixed' - so what is left on screen is the door's own widgets,
 * still laid out for the width they were given.
 */
export async function togglingOffPutsEveryWidgetBackInsideEightyColumns(): Promise<void> {
  const h = await open(false);
  const screen: any = h.screen;
  assert.ok(screen, 'the harness must be able to reach the screen');

  // Alt+Enter: the terminal widens and tells the door.
  h.toggle();
  screen.resize(140, 40);

  // Alt+Enter again: BBSTerminal resizes itself to 80x25 and reports it.
  h.toggle();
  screen.resize(80, 25);

  const tooWide: string[] = [];
  const walk = (el: any, path: string) => {
    for (const child of el.children ?? []) {
      const pos = child._getCoords?.();
      const name = `${path}/${child.constructor.name}${child.options?.label ? `(${String(child.options.label).trim()})` : ''}`;
      if (pos && !child.hidden && pos.xl > 80) tooWide.push(`${name} ends at ${pos.xl}`);
      walk(child, name);
    }
  };
  walk(screen, '');

  assert.deepStrictEqual(tooWide, [],
    'nothing may still be laid out for the wide terminal after the toggle back');
  h.fire('disconnect', 'transport close');
}

/**
 * The key has to reach the switch while the message box is reading.
 *
 * LiveChat keeps its input box focused and in readInput() for the whole
 * session, which is where a key binding goes to die: whoever consumes the
 * keystroke first wins.
 */
export async function altEnterWorksWhileTheMessageBoxHasFocus(): Promise<void> {
  const h = await open(false);
  const screen: any = h.screen;
  const before = h.app.terminalMode.mode();

  // The real dispatch, exactly as Program delivers a parsed key.
  screen._handleKey('\r', { name: 'enter', meta: true, full: 'M-enter', ctrl: false, shift: false });

  assert.notStrictEqual(h.app.terminalMode.mode(), before,
    'Alt+Enter must toggle the size even with the message box focused');
  h.fire('disconnect', 'transport close');
}
