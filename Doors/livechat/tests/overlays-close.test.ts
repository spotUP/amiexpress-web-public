/**
 * Every overlay in this door closes when its [X] is clicked.
 *
 * CARD LOBBY's reader windows did not: the close button calls
 * Element.close(), which hides the widget and emits 'close', and DocModal
 * ignores its own 'close' - so the caller's onClose never ran and the door
 * sat refusing every later window ("theme is dead", "leaders is dead",
 * sysop 2026-09-14). LiveChat's two overlays are the board's only other
 * `closable: true` widgets and they DO listen to 'close', so they were
 * always going to be fine in principle. This is the proof, because the
 * other half of that bug was not in the widget at all: a widget shown
 * between renders was absent from the mouse hit-test index, so the button
 * could not be clicked in the first place.
 *
 * Driven with a real click at the real button's coordinates.
 *
 * The index half is pinned in the SDK's own suite
 * (sdk/tests/unit/a-modal-shows-its-whole-close-button.test.ts) rather than
 * here: this door runs timers that render on their own, so a test that
 * relies on NOT rendering between show and click passes whether the fix is
 * in or out - it proves nothing where it cannot control the clock.
 */

import assert from 'assert';
import { createApp } from '../server';

async function open(): Promise<any> {
  const handlers = new Map<string, Array<(...a: any[]) => void>>();
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 100, height: 30 }),
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
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, tempData: { chatOnly: true }, socket },
    user: { id: 1, name: 'sysop', accessLevel: 255 },
  };
  return createApp(session);
}

/** Everything under the screen, whatever its depth. */
function everything(node: any): any[] {
  return [node, ...((node.children ?? []).flatMap(everything))];
}

/** The widgets that asked for a close button. */
function closableWidgets(screen: any): any[] {
  return everything(screen).filter((el: any) => el !== screen && el.options?.closable);
}

function click(screen: any, x: number, y: number): void {
  screen.program.emit('mouse', { x, y, action: 'mousedown', button: 'left', shift: false, ctrl: false, meta: false });
  screen.program.emit('mouse', { x, y, action: 'mouseup', button: 'left', shift: false, ctrl: false, meta: false });
}

export async function everyClosableOverlayHidesWhenItsButtonIsClicked(): Promise<void> {
  const app: any = await open();
  try {
    const screen = app.screen;
    const widgets = closableWidgets(screen);
    assert.ok(widgets.length >= 2,
      `the door builds its closable overlays (found ${widgets.length})`);

    for (const widget of widgets) {
      const label = String(widget.options?.label ?? widget.constructor.name).trim();
      widget.show();
      screen.render();

      const button = everything(widget).find((el: any) => el.getContent?.() === '[X]');
      assert.ok(button, `${label} has a close button`);
      const coords = button._getCoords();
      assert.ok(coords, `${label}'s close button has a place on the screen`);

      click(screen, coords.xi + 1, coords.yi);
      await new Promise((r) => setTimeout(r, 50));

      assert.strictEqual(widget.hidden, true,
        `${label} closes when its [X] is clicked`);
    }
  } finally {
    app.state.running = false;
  }
}
