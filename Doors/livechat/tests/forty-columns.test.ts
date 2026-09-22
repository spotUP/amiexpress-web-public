/**
 * LIVECHAT ON A C64.
 *
 * Driven, not read: the door is started with a stub whose `getTerminalSize`
 * answers 40x25, and every widget it paints is measured off the real blessed
 * screen. The layout decision itself is pinned in
 * `web/backend/tests/doors/compact-40/livechat-layout.test.ts`, which drives
 * the pure solver; this is the reachability half - the door built from that
 * solver actually fits the glass.
 *
 * What a forty-column caller must get: the chat with the whole width, no
 * panel hanging off the right edge, and the sidebar DOWN, because at forty
 * the lists own the screen when they are up and a caller who opened LiveChat
 * came to read the chat.
 */

import assert from 'assert';
import { createApp } from '../server';

interface Harness {
  app: any;
  screen: any;
  fire: (event: string, ...args: unknown[]) => void;
}

async function openAt(width: number, height: number): Promise<Harness> {
  const handlers = new Map<string, Array<(...a: any[]) => void>>();
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width, height }),
    enableWideMode: () => {}, disableWideMode: () => {},
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
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, tempData: {}, socket },
    user: { id: 1, name: 'sysop', accessLevel: 255 },
  };

  const app: any = await createApp(session);
  // The SDK applies a widget's initial breakpoint on the next tick, because
  // a widget's children do not exist while its base constructor runs.
  await new Promise(resolve => setImmediate(resolve));
  return {
    app,
    screen: app.screen ?? null,
    fire: (event, ...args) => (handlers.get(event) ?? []).forEach(fn => fn(...args)),
  };
}

/**
 * Every widget the caller can SEE that ends past `cols`, named so a failure
 * says which one.
 *
 * Hidden subtrees are skipped deliberately. A door of this size carries
 * overlays that are built once and shown on a key, and several of them size
 * themselves when they are opened; measuring them while they are down
 * reports geometry nobody is looking at. The overlays the door opens are
 * sized through `ui/fit-width` instead, which is a rule rather than a
 * measurement.
 */
function overflowing(screen: any, cols: number): string[] {
  const out: string[] = [];
  const walk = (el: any, path: string) => {
    for (const child of el.children ?? []) {
      if (child.hidden) continue;
      const pos = child._getCoords?.();
      // Named as loudly as possible: a bare `/Panel/Box ends at 42` costs an
      // hour of grepping, and the content is usually the giveaway.
      const label = child.options?.label ? `(${String(child.options.label).trim()})` : '';
      const content = String(child.content ?? child.options?.content ?? '').replace(/\x1b\[[0-9;]*m/g, '').trim().slice(0, 24);
      const hint = !label && content ? `["${content}"]` : '';
      const name = `${path}/${child.constructor.name}${label}${hint}`;
      if (pos && pos.xl > cols) out.push(`${name} ends at ${pos.xl}`);
      walk(child, name);
    }
  };
  walk(screen, '');
  return out;
}

/** The door's own overlay widths, which are a rule and not a measurement. */
export async function everyOverlayIsSizedFromTheScreen(): Promise<void> {
  const { fitWidth } = await import('../ui/fit-width');

  // A C64 keeps the box inside its screen; the board's own terminal gets
  // exactly the width the door asked for.
  assert.strictEqual(fitWidth({ width: 40 } as any, 48), 38);
  assert.strictEqual(fitWidth({ width: 40 } as any, 50), 38);
  assert.strictEqual(fitWidth({ width: 80 } as any, 48), 48);
  assert.strictEqual(fitWidth({ width: 132 } as any, 50), 50);
}

export async function everyWidgetFitsFortyColumns(): Promise<void> {
  const h = await openAt(40, 25);
  assert.ok(h.screen, 'the harness must be able to reach the screen');
  assert.strictEqual(h.screen.width, 40, 'the door opens at the width the caller has');

  assert.deepStrictEqual(overflowing(h.screen, 40), [],
    'nothing may be laid out past a C64 screen');
  h.fire('disconnect', 'transport close');
}

export async function theChatHasTheWholeWidthAndTheListsAreDown(): Promise<void> {
  const h = await openAt(40, 25);
  const screen: any = h.screen;

  // The sidebar is a DockablePanel with a ' Sidebar ' label; the chat is the
  // panel holding the log. Find them by label rather than by index.
  const panels: any[] = [];
  const walk = (el: any) => {
    for (const child of el.children ?? []) {
      panels.push(child);
      walk(child);
    }
  };
  walk(screen);

  const sidebar = panels.find(p => String(p.options?.label ?? '').trim() === 'Sidebar');
  assert.ok(sidebar, 'the sidebar panel must exist whatever its state');
  assert.strictEqual(sidebar.hidden, true,
    'at forty columns the lists own the screen when up, so a caller lands in the chat');

  h.fire('disconnect', 'transport close');
}

export async function theEightyColumnScreenIsUnchanged(): Promise<void> {
  const h = await openAt(80, 25);
  const screen: any = h.screen;

  const panels: any[] = [];
  const walk = (el: any) => {
    for (const child of el.children ?? []) { panels.push(child); walk(child); }
  };
  walk(screen);

  const sidebar = panels.find(p => String(p.options?.label ?? '').trim() === 'Sidebar');
  assert.ok(sidebar, 'the sidebar panel must exist');
  assert.notStrictEqual(sidebar.hidden, true,
    'an eighty-column caller gets the sidebar he has always had');
  assert.deepStrictEqual(overflowing(screen, 80), [],
    'and nothing hangs off the right of his screen either');

  h.fire('disconnect', 'transport close');
}
