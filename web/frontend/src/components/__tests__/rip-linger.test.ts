/**
 * "i cant type after the rip image has been shown": the lingering
 * picture's dismiss-key listener must be ONE stable instance that removes
 * ITSELF. The first version armed a per-render ref; removeEventListener
 * then removed a newer copy and the armed one swallowed every keystroke
 * forever. These tests pin the contract on a real EventTarget.
 */
import { describe, it, expect, vi } from 'vitest';
import { armRipLinger } from '@amiexpress/terminal/rip/rip-linger';

function press(target: EventTarget): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: 'a', cancelable: true, bubbles: true });
  target.dispatchEvent(e);
  return e;
}

describe('armRipLinger', () => {
  it('swallows exactly the dismiss key, then lets every later key through', () => {
    const target = new EventTarget() as unknown as Window;
    const onDismiss = vi.fn();
    armRipLinger(target, onDismiss);

    const first = press(target);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(first.defaultPrevented).toBe(true);

    // The regression: the armed listener used to stay installed and
    // swallow this one too.
    const second = press(target);
    expect(second.defaultPrevented).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('disarm() removes the listener without firing onDismiss, and is idempotent', () => {
    const target = new EventTarget() as unknown as Window;
    const onDismiss = vi.fn();
    const linger = armRipLinger(target, onDismiss);

    linger.disarm();
    linger.disarm();

    const e = press(target);
    expect(e.defaultPrevented).toBe(false);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('two arms in a row: dismissing the second does not consult the first', () => {
    const target = new EventTarget() as unknown as Window;
    const firstDismiss = vi.fn();
    const secondDismiss = vi.fn();
    const first = armRipLinger(target, firstDismiss);
    first.disarm();
    armRipLinger(target, secondDismiss);

    press(target);
    expect(secondDismiss).toHaveBeenCalledTimes(1);
    expect(firstDismiss).not.toHaveBeenCalled();
  });
});
