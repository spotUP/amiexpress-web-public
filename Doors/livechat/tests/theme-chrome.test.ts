/**
 * LIVECHAT gains the theme's CHROME, not only its colours.
 *
 * The door was themed by door-theme.ts alone - every literal colour replaced
 * by the token behind it - which makes it follow a palette and nothing else.
 * The moving parts of a theme come from the SDK's one entry point,
 * attachDoorChrome, and the two things this door can take from it are the
 * glitches (on the chat log), the animated masthead - which rides the run
 * the menu bar's labels leave, exactly as CARD LOBBY's does - and the width
 * gate that turns both off on a 40-column screen. There is no hint footer:
 * the bottom row is a live status line, not hints.
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
async function openAndClose(themeId: string, width = 80): Promise<Counted> {
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
      getTerminalSize: () => ({ width, height: width === 40 ? 25 : 25 }),
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
 * A theme with a rail and glitches starts the two timers classic does not.
 *
 * Two, not one: the glitch runner AND the masthead. This read `+ 1` while
 * the masthead was deliberately absent - the sysop's walk on the live board
 * found this door the only one without it ("all doors but livechat have the
 * animated masthead"), and the run the menu labels leave is where it goes.
 */
export async function aGlitchingThemeStartsTwoMoreTimersThanClassic(): Promise<void> {
  const plain = await openAndClose('classic');
  const glitchy = await openAndClose('uprough-neon');

  assert.strictEqual(glitchy.started, plain.started + 2,
    'a theme with a rail and glitches starts the glitch runner and the masthead');
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

/**
 * Open the door at `width` and hand back the masthead row and the menu bar.
 *
 * The screen is handed back by createApp for exactly this reason; the
 * masthead row comes with it, because the run it occupies is decided by the
 * menu labels and nothing else on the screen knows where they end.
 */
async function openAt(width: number, themeId = 'uprough-neon'): Promise<{
  app: any; mastheadRow: any; menuBar: any; close: () => void;
}> {
  const handlers = new Map<string, Array<(...a: any[]) => void>>();
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width, height: 25 }),
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

  const app: any = await createApp(session);
  return {
    app,
    mastheadRow: app.mastheadRow,
    menuBar: app.menuBar,
    close: () => (handlers.get('disconnect') ?? []).forEach(fn => fn('transport close')),
  };
}

/** blessed tags are markup; the ROW is what is left when they are gone. */
function plain(text: unknown): string {
  return String(text ?? '').replace(/\{[^}]*\}/g, '');
}

/**
 * The masthead rides the run the menu labels leave, and it moves.
 *
 * Row 0 is the menu bar and every row under it is a panel, so there is no
 * spare row - the same constraint CARD LOBBY has, and the same answer: the
 * bar's own row, from the column after the last label to the right edge.
 * Drawing it as the BAR's content instead would put an animated slash in
 * each one-column gap between the menu words, which reads as damage.
 */
export async function theMenuBarCarriesTheRailToTheRightOfTheMenus(): Promise<void> {
  const { mastheadRow, close } = await openAt(80);
  try {
    assert.ok(mastheadRow, 'the door built no masthead row');
    assert.strictEqual(mastheadRow.hidden, false, 'the masthead is hidden at 80 columns');

    const row = plain(mastheadRow.getContent());
    assert.ok(row.includes('LIVE CHAT'), `no title on the masthead: ${JSON.stringify(row)}`);
    assert.ok(row.includes('/'), `no rail on the masthead: ${JSON.stringify(row)}`);

    // It starts AFTER the menus - never over them.
    const { menusEndColumn } = await import('../ui/menu-bar');
    assert.strictEqual(
      mastheadRow.left,
      menusEndColumn(),
      `the masthead starts at ${mastheadRow.left}, the menus end at ${menusEndColumn()}`
    );
  } finally {
    close();
  }
}

/** ...and it MOVES: the run is redrawn, not printed once. */
export async function theRailSlides(): Promise<void> {
  const { mastheadRow, close } = await openAt(80);
  try {
    const first = plain(mastheadRow.getContent());
    await new Promise<void>((r) => setTimeout(r, 250));
    assert.notStrictEqual(plain(mastheadRow.getContent()), first, 'the rail never moved');
  } finally {
    close();
  }
}

/**
 * At 40 the rail stops and the still mark stays.
 *
 * Four menu labels leave a handful of columns on a C64, which is not a
 * masthead but a clipped word - so the row is hidden and the bar keeps the
 * theme's mark, still, at the right end.
 */
export async function theRailStopsAndTheMarkStaysAtForty(): Promise<void> {
  const { mastheadRow, menuBar, close } = await openAt(40);
  try {
    assert.ok(mastheadRow, 'the door built no masthead row');
    assert.strictEqual(mastheadRow.hidden, true, 'the masthead was drawn at 40 columns');

    // The mark stays, so the bar is still branded on a C64.
    const bar = plain(menuBar.getContent());
    assert.ok(bar.includes('/'), `the still mark is gone at 40: ${JSON.stringify(bar)}`);

    // ...and nothing repaints it, however long anyone waits.
    const before = plain(mastheadRow.getContent());
    await new Promise<void>((r) => setTimeout(r, 250));
    assert.strictEqual(plain(mastheadRow.getContent()), before,
      'something animated the masthead at 40 columns');
  } finally {
    close();
  }
}

/** Closing stops every chrome timer, at both widths. */
export async function closingStopsEveryChromeTimer(): Promise<void> {
  for (const width of [40, 80]) {
    const wide = await openAndClose('uprough-neon', width);
    const plainTheme = await openAndClose('classic', width);
    assert.strictEqual(wide.leftOver, plainTheme.leftOver,
      `the chrome left a timer running at ${width} columns that classic does not`);
  }
}
