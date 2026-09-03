/**
 * LIVECHAT gains the theme's CHROME, not only its colours.
 *
 * The door was themed by door-theme.ts alone - every literal colour replaced
 * by the token behind it - which makes it follow a palette and nothing else.
 * The moving parts of a theme come from the SDK's one entry point,
 * attachDoorChrome, and the two things this door can take from it are the
 * glitches (on the chat log) and the width gate that turns them off on a
 * 40-column screen. There is no masthead and no hint footer here: row 0 is
 * the menu bar the door is driven from, and the bottom row is a live status
 * line, not hints.
 *
 * Driven, not read: the door is started with a stubbed session under a theme
 * that asks for glitches, and the timers are counted through the real
 * globals. A test that grepped the source for attachDoorChrome would pass on
 * a door that called it and never stopped it.
 */

import assert from 'assert';
import { createApp } from '../server';
import { themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { isAnyoneTyping, TYPING_STALE_MS } from '../ui/typing-preview';
import type { TypingBuffer } from '../ui/typing-preview';

interface Counted {
  /** Intervals started between the door opening and its cleanup. */
  started: number;
  /** Intervals still running after cleanup. */
  leftOver: number;
}

/** Open the door under `themeId`, close it, and count the timers. */
async function openAndClose(themeId: string): Promise<Counted> {
  const live = new Set<unknown>();
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  let started = 0;

  (globalThis as any).setInterval = (...args: any[]) => {
    const handle = (realSetInterval as any)(...args);
    live.add(handle);
    started++;
    return handle;
  };
  (globalThis as any).clearInterval = (handle: any) => {
    live.delete(handle);
    return (realClearInterval as any)(handle);
  };

  try {
    const handlers = new Map<string, Array<(...a: any[]) => void>>();
    const bbs: any = {
      write: () => {}, writeLine: () => {}, on: () => {},
      getTerminalSize: () => ({ width: 80, height: 25 }),
      enableWideMode: () => {}, disableWideMode: () => {},
      getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
      connectionType: 'web', unicodeCapable: true,
      getTheme: () => themeById(themeId),
    };
    const socket: any = {
      on: (event: string, fn: (...a: any[]) => void) => {
        handlers.set(event, [...(handlers.get(event) ?? []), fn]);
      },
      emit: () => {}, off: () => {}, removeAllListeners: () => {},
    };
    const session: any = {
      bbs, socket, params: [],
      bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, tempData: {}, socket },
      user: { id: 1, name: 'sysop', accessLevel: 255 },
    };

    await createApp(session);
    (handlers.get('disconnect') ?? []).forEach(fn => fn('transport close'));

    return { started, leftOver: live.size };
  } finally {
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    for (const handle of live) realClearInterval(handle as any);
  }
}

/**
 * A theme that asks for glitches gets a timer; classic pays nothing.
 *
 * One timer, not two: the masthead is deliberately absent, so the only
 * moving part this door starts is the glitch runner.
 */
export async function aGlitchingThemeStartsOneMoreTimerThanClassic(): Promise<void> {
  const plain = await openAndClose('classic');
  const glitchy = await openAndClose('uprough-neon');

  assert.strictEqual(glitchy.started, plain.started + 1,
    'a theme with glitches starts exactly one timer this door would not otherwise have');
}

/** Leaving stops it - a timer writing to a destroyed screen kills the session. */
export async function leavingStopsTheChrome(): Promise<void> {
  const plain = await openAndClose('classic');
  const glitchy = await openAndClose('uprough-neon');

  assert.strictEqual(glitchy.leftOver, plain.leftOver,
    'the chrome leaves nothing running that classic does not');
}

/** The glitch asks this before every roll, and it means the WHOLE room. */
export async function typingIsBusyForEveryoneInTheRoom(): Promise<void> {
  const now = 1_000_000;
  const buffers = new Map<number, TypingBuffer>();

  assert.strictEqual(isAnyoneTyping(buffers, now), false,
    'an empty room is not busy');

  buffers.set(7, { username: 'other', buffer: 'hel', lastUpdate: now - 200, color: 'cyan' });
  assert.strictEqual(isAnyoneTyping(buffers, now), true,
    'another node mid-word is busy - its keystrokes rebuild the log content');

  buffers.set(7, {
    username: 'other', buffer: 'hel', color: 'cyan',
    lastUpdate: now - TYPING_STALE_MS - 1,
  });
  assert.strictEqual(isAnyoneTyping(buffers, now), false,
    'a buffer nobody has touched for TYPING_STALE_MS must not silence the chrome for ever');
}
