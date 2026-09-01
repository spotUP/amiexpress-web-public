/**
 * The 80x25 / responsive switch.
 *
 * Pinning the three things that have to happen together, because every door
 * that got this wrong today got it wrong by doing only some of them: ask the
 * TERMINAL to widen, follow the resize that follows, and put the board's 80
 * columns back on the way out.
 */

import { createTerminalModeSwitch, TERMINAL_MODE_MENU_LABEL } from '../../utils/terminal-mode';

function harness() {
  const calls: string[] = [];
  const listeners: Record<string, Array<() => void>> = {};
  const bbs = {
    enableWideMode: () => calls.push('wide'),
    disableWideMode: () => calls.push('fixed'),
  };
  const keys: Record<string, Array<() => void>> = {};
  const screen = {
    key: (names: string[], fn: () => void) => {
      names.forEach(n => (keys[n] ||= []).push(fn));
    },
    unkey: (names: string[], fn: () => void) => {
      names.forEach(n => { keys[n] = (keys[n] || []).filter(f => f !== fn); });
    },
    press: (name: string) => (keys[name] || []).forEach(f => f()),
    keyCount: (name: string) => (keys[name] || []).length,
    on: (event: string, fn: () => void) => {
      (listeners[event] ||= []).push(fn);
    },
    removeListener: (event: string, fn: () => void) => {
      listeners[event] = (listeners[event] || []).filter(f => f !== fn);
    },
    emit: (event: string) => (listeners[event] || []).forEach(f => f()),
    listenerCount: (event: string) => (listeners[event] || []).length,
  };
  let relayouts = 0;
  const sw = createTerminalModeSwitch({
    bbs, screen, onRelayout: () => { relayouts++; },
  });
  return { sw, calls, screen, relayouts: () => relayouts };
}

describe('terminal mode switch', () => {
  it('asks the terminal to widen as soon as it exists', () => {
    const h = harness();
    expect(h.calls).toEqual(['wide']);
    expect(h.sw.mode()).toBe('wide');
  });

  it('asks for 80 columns back when switched to fixed', () => {
    const h = harness();
    h.sw.toggle();
    expect(h.sw.mode()).toBe('fixed');
    expect(h.calls).toEqual(['wide', 'fixed']);
  });

  it('re-lays out when the mode changes', () => {
    const h = harness();
    h.sw.toggle();
    expect(h.relayouts()).toBe(1);
  });

  it('re-lays out when the terminal itself resizes', () => {
    const h = harness();
    h.screen.emit('resize');
    h.screen.emit('resize');
    expect(h.relayouts()).toBe(2);
  });

  it('does nothing when set to the mode it is already in', () => {
    const h = harness();
    h.sw.set('wide');
    expect(h.calls).toEqual(['wide']);
    expect(h.relayouts()).toBe(0);
  });

  it('restores fixed and stops listening when disposed', () => {
    const h = harness();
    h.sw.dispose();
    expect(h.calls).toEqual(['wide', 'fixed']);
    expect(h.screen.listenerCount('resize')).toBe(0);
  });

  it('ignores a resize that arrives after disposal', () => {
    const h = harness();
    h.sw.dispose();
    h.screen.emit('resize');
    expect(h.relayouts()).toBe(0);
  });

  it('toggles on Alt+Enter, the same key in every door', () => {
    const h = harness();
    expect(h.screen.keyCount('M-enter')).toBe(1);
    h.screen.press('M-enter');
    expect(h.sw.mode()).toBe('fixed');
    h.screen.press('M-enter');
    expect(h.sw.mode()).toBe('wide');
  });

  it('gives the key back when disposed', () => {
    const h = harness();
    h.sw.dispose();
    expect(h.screen.keyCount('M-enter')).toBe(0);
  });

  it('labels itself the same way in every door', () => {
    const h = harness();
    expect(h.sw.menuItem().label).toBe(TERMINAL_MODE_MENU_LABEL);
    h.sw.menuItem().action();
    expect(h.sw.mode()).toBe('fixed');
  });

  it('survives a door whose bbs cannot do wide mode at all', () => {
    const sw = createTerminalModeSwitch({
      bbs: {}, screen: { on() {}, removeListener() {} }, onRelayout: () => {},
    });
    expect(() => sw.toggle()).not.toThrow();
    expect(() => sw.dispose()).not.toThrow();
  });
});

/**
 * The toggle keystroke stops at the switch.
 *
 * "fullscren with alt+enter worked now but it also started the game"
 * (2026-09-02). The screen runs its registered key handlers first and then
 * hands the same keystroke to whatever has focus - and Alt+Enter is Enter
 * to a focused list, so toggling the size in GRANDMASTER's menu also
 * accepted the highlighted item.
 */
describe('terminal mode hotkey', () => {
  it('reports the key as handled so nothing else sees it', () => {
    const bound: Record<string, Array<() => unknown>> = {};
    const screen: any = {
      key: (keys: string[], fn: () => unknown) => {
        for (const k of keys) (bound[k] ||= []).push(fn);
      },
      on: () => {}, removeListener: () => {}, unkey: () => {},
    };
    const sw = createTerminalModeSwitch({
      bbs: { enableWideMode: () => {}, disableWideMode: () => {} },
      screen,
      start: 'fixed',
      onRelayout: () => {},
    });

    const handler = bound['M-enter']?.[0];
    expect(handler).toBeDefined();
    expect(handler!()).toBe(true);
    expect(sw.mode()).toBe('wide');
  });
});
