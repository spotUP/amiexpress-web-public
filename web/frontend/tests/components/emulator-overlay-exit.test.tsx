/**
 * The way out of the emulator.
 *
 * The surface is deliberately bare - no strip, no button - so the only way
 * back to the BBS is a key. That key has to be heard INSIDE the frame,
 * because the frame is the whole surface and a focused frame's keys never
 * reach the hosting document.
 *
 * The first version listened only on the host document, on the theory that
 * the caller would click off the machine onto the black around it. There is
 * no black. Every click lands in the frame, focus never comes back, and
 * "esc does nothing" (sysop, 2026-09-17) was the only possible outcome.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { EmulatorOverlay } from '../../../../packages/terminal/src/components/EmulatorOverlay';

function overlay(onClose: () => void) {
  return render(
    <EmulatorOverlay url="/beeb/?model=B-DFS1.2" title="GOMOKU" onClose={onClose} />,
  );
}

/** Let the mount effect attach its listener inside the frame. */
function settle(): void {
  act(() => {
    vi.advanceTimersByTime(100);
  });
}

describe('leaving the emulator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('closes on Shift+Escape from the hosting page', () => {
    const onClose = vi.fn();
    overlay(onClose);
    settle();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Shift+Escape pressed INSIDE the machine', () => {
    /*
     * THE BUG. While the caller is playing, the frame holds the keyboard,
     * and nothing they press reaches the hosting document at all - so a
     * listener only there can never fire.
     */
    const onClose = vi.fn();
    const { container } = overlay(onClose);
    settle();

    const inner = container.querySelector('iframe')?.contentDocument;
    expect(inner, 'the frame is same-origin, so its document is reachable').toBeTruthy();

    act(() => {
      inner!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves a bare Escape to the BBC, where it is a real key', () => {
    // ESCAPE stops a BASIC program and games read it. A surface that
    // swallowed it would make some software unusable.
    const onClose = vi.fn();
    const { container } = overlay(onClose);
    settle();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      container.querySelector('iframe')?.contentDocument
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stops listening once it is gone', () => {
    const onClose = vi.fn();
    const { unmount } = overlay(onClose);
    settle();
    unmount();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('the speed the machine runs at', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  function turboPresses(inner: Document): { count: () => number } {
    let n = 0;
    inner.addEventListener('keydown', (event) => {
      const key = event as KeyboardEvent;
      if (key.altKey && key.code === 'KeyT') n++;
    });
    return { count: () => n };
  }

  /** The emulator's own drive light: <span class="led disc" id="drive0">. */
  function machine() {
    const onClose = vi.fn();
    const { container } = overlay(onClose);
    const inner = container.querySelector('iframe')!.contentDocument!;
    // jsdom leaves an unloaded frame's document completely empty - no body,
    // not even a root element - so give it one before hanging the drive
    // light on it.
    inner.open();
    inner.write('<html><body></body></html>');
    inner.close();
    const light = inner.createElement('span');
    light.className = 'led disc';
    light.id = 'drive0';
    inner.body.appendChild(light);
    const turbo = turboPresses(inner);
    settle();
    return { inner, light, turbo };
  }

  /** One look at the drive lights. */
  const WATCH = 120;
  const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  it('does NOT press turbo before the machine can hear it', () => {
    /*
     * THE BUG THIS EXISTS FOR, and it inverted the whole feature. Turbo is
     * a TOGGLE. The opening press used to go out as soon as the frame
     * loaded - while jsbeeb was still fetching ROMs and had no keyboard -
     * so it was swallowed. The closing press then became the FIRST one the
     * machine ever saw and turned turbo ON just as the game started.
     * Pressing Alt+T by hand "fixed" it because that undid the press.
     */
    const { turbo } = machine();
    tick(2000);
    expect(turbo.count()).toBe(0);
  });

  it('starts once the drive is actually running', () => {
    const { light, turbo } = machine();
    light.classList.add('on');
    tick(500);
    expect(turbo.count()).toBe(1);
  });

  it('is not started by the flicker of mounting the image', () => {
    // One look is not enough; the light has to still be on at the next.
    const { light, turbo } = machine();
    light.classList.add('on');
    tick(WATCH);
    light.classList.remove('on');
    tick(2000);
    expect(turbo.count()).toBe(0);
  });

  it('stays fast while the disc is being read', () => {
    /*
     * DFS reads in bursts with the light out between them, so dropping at
     * the first dark frame would fall back to 2MHz in the middle of a load.
     */
    const { light, turbo } = machine();
    light.classList.add('on');
    tick(2000);
    light.classList.remove('on');
    tick(300);
    light.classList.add('on');
    tick(2000);
    expect(turbo.count()).toBe(1); // still only the switch-on
  });

  it('drops back once the drive settles', () => {
    /*
     * THE BUG THIS EXISTS FOR. A game started by CHAIN runs on its own
     * while the player watches, so waiting for a keystroke left it at
     * fast-as-possible: "they play super fast now".
     */
    const { light, turbo } = machine();
    light.classList.add('on');
    tick(1000);
    light.classList.remove('on');
    tick(1000);
    expect(turbo.count()).toBe(2);
  });

  it('never boosts a machine with no disc at all', () => {
    // Nothing to hurry, and nothing that proves the machine is listening.
    const { turbo } = machine();
    tick(20_000);
    expect(turbo.count()).toBe(0);
  });

  it('still has the timer as a backstop once boosting', () => {
    const { light, turbo } = machine();
    light.classList.add('on');
    tick(500);
    expect(turbo.count()).toBe(1);
    // The light never goes out; the cap ends it anyway.
    tick(12_000);
    expect(turbo.count()).toBe(2);
  });

  it('drops only once, however long the drive stays dark', () => {
    const { light, turbo } = machine();
    light.classList.add('on');
    tick(1000);
    light.classList.remove('on');
    tick(5000);
    expect(turbo.count()).toBe(2);
  });
});
