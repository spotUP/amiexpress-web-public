/**
 * Bug fix: RepoView's filter-activation keypress leaking into the
 * newly-focused input.
 *
 * Live-reported: pressing 'f' to activate RepoView's filter put a literal
 * "f" into the filter input. Root cause (verified against
 * sdk/engines/ui/blessed/core/screen.ts Screen._handleKey): ONE physical
 * keystroke is dispatched in three synchronous phases against the same
 * event — (1) screen.key()-registered handlers, (2) an emit to whichever
 * element is `_focused` *at that moment*, (3) a final broadcast
 * emit('keypress', ...) to plain screen.on('keypress', ...) listeners.
 * The old activation handler called focusFilter() synchronously from phase
 * (1), which changed `_focused` mid-dispatch — so phase (2) re-delivered
 * the SAME 'f' to the newly-focused text input (which inserted it into its
 * own buffer) and phase (3) saw the mode flag already flipped to true and
 * appended 'f' to the manual filter buffer too.
 *
 * DispatchStub below reproduces that exact three-phase order (not a mock
 * of RepoView — a faithful model of the verified SDK dispatch mechanism)
 * so the mechanism itself is under regression, not just a symptom.
 */
import { KeyBinder } from '../../../../Doors/door-manager/ViewManager';

class DispatchStub {
  focused: { emitKeypress: (ch: string, key: { name: string }) => void } | null = null;
  private keyHandlers = new Map<string, Array<(ch: string, key: { name: string }) => void>>();
  private keypressListeners: Array<(ch: string, key: { name: string }) => void> = [];

  key(keys: string[], handler: (ch: string, key: { name: string }) => void): void {
    for (const k of keys) {
      if (!this.keyHandlers.has(k)) this.keyHandlers.set(k, []);
      this.keyHandlers.get(k)!.push(handler);
    }
  }
  unkey(keys: string[], handler: (ch: string, key: { name: string }) => void): void {
    for (const k of keys) {
      const list = this.keyHandlers.get(k) ?? [];
      this.keyHandlers.set(k, list.filter(h => h !== handler));
    }
  }
  on(event: string, handler: (ch: string, key: { name: string }) => void): void {
    if (event === 'keypress') this.keypressListeners.push(handler);
  }
  off(event: string, handler: (ch: string, key: { name: string }) => void): void {
    if (event === 'keypress') this.keypressListeners = this.keypressListeners.filter(h => h !== handler);
  }

  /** Mirrors Screen._handleKey's real phase order for a single keystroke. */
  press(ch: string, key: { name: string }): void {
    for (const h of this.keyHandlers.get(key.name) ?? []) h(ch, key);
    if (this.focused) this.focused.emitKeypress(ch, key);
    for (const h of this.keypressListeners) h(ch, key);
  }
}

/** Stand-in for the Textbox widget: inserts printable chars when it
 * receives a keypress (its real, unconditional behavior — see
 * sdk/engines/ui/blessed/widgets/textbox.ts _onKeypress/insertChar). */
class TextInputStub {
  value = '';
  emitKeypress(ch: string, _key: { name: string }): void {
    if (ch && ch.length === 1 && ch.charCodeAt(0) >= 32) this.value += ch;
  }
}

const flushNextTick = () => new Promise<void>(resolve => process.nextTick(resolve));

describe('DOORMAN RepoView filter-activation leak', () => {
  it('documents the bug: synchronous focus() mid-dispatch leaks the activating key', () => {
    const screen = new DispatchStub();
    const keys = new KeyBinder(screen as any);
    const input = new TextInputStub();
    let filterActive = false;
    let filterBuf = '';

    keys.setGuard(() => !filterActive);
    // Old (buggy) activation: synchronous mode flip + focus change.
    keys.key(['f'], () => {
      if (filterActive) return;
      filterActive = true;
      screen.focused = input;
    });
    screen.on('keypress', (ch: string) => {
      if (!filterActive) return;
      filterBuf += ch;
    });

    screen.press('f', { name: 'f' });

    expect(input.value).toBe('f');   // leaked into the widget
    expect(filterBuf).toBe('f');     // leaked into the manual filter state too
  });

  it('fix: deferring the mode flip + focus() past the current dispatch stops the leak', async () => {
    const screen = new DispatchStub();
    const keys = new KeyBinder(screen as any);
    const input = new TextInputStub();
    let filterActive = false;
    let filterBuf = '';

    keys.setGuard(() => !filterActive);
    // Fixed activation: same pattern used in RepoView.enter() (app.ts).
    keys.key(['f'], () => {
      if (filterActive) return;
      process.nextTick(() => {
        filterActive = true;
        screen.focused = input;
      });
    });
    screen.on('keypress', (ch: string) => {
      if (!filterActive) return;
      filterBuf += ch;
    });

    screen.press('f', { name: 'f' });

    // Nothing leaked during the activating keystroke's own dispatch.
    expect(input.value).toBe('');
    expect(filterBuf).toBe('');
    expect(filterActive).toBe(false);

    await flushNextTick();

    // Mode is now active, focus has moved, ready for the NEXT keystroke.
    expect(filterActive).toBe(true);
    expect(screen.focused).toBe(input);

    screen.press('x', { name: 'x' });
    expect(input.value).toBe('x');
    expect(filterBuf).toBe('x');
  });
});
