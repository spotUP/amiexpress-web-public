/**
 * Closing a DocModal closes it once, and does not call itself.
 *
 * `closeModal()` ended by emitting 'close', and the widget listened to its
 * own 'close' to call `closeModal()`. So closing recursed until the stack
 * died - `RangeError: Maximum call stack size exceeded` - thrown out of the
 * emit, swallowed by EventEmitter, printed where nobody looked. Every caller
 * who opened a bulletin in CARDLOBBY and pressed a close key hit it, and the
 * door's own suite was green the whole time.
 *
 * Found by the listener-error guard in dev/scripts/run-door-suites.ts on its
 * first full run, which is the argument for that guard in one sentence.
 *
 * 'close' is an ANNOUNCEMENT. A widget must not act on its own announcement.
 */

import { DocModal } from '../../engines/ui/blessed/widgets/doc-modal';
import { Screen } from '../../engines/ui/blessed/core/screen';
import { listenerErrorCount, resetListenerErrorCount } from '../../engines/ui/blessed/core/events';

describe('a modal closes once', () => {
  let screen: any;
  let spy: jest.SpyInstance;

  beforeEach(() => {
    resetListenerErrorCount();
    spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    screen = new Screen({ title: 'doc-modal', responsive: true, width: 80, height: 25 } as any);
  });
  afterEach(() => {
    spy.mockRestore();
    screen?.destroy();
  });

  const make = (onClose?: () => void): any => new DocModal({
    parent: screen, content: 'a bulletin', onClose,
  } as any);

  it('does not recurse into itself when it closes', () => {
    const modal = make();
    modal.display();

    modal._close();

    // The recursion surfaced as a swallowed RangeError, so count them: the
    // engine keeps closing quietly either way, and the count is the only
    // thing that tells the two apart.
    expect(listenerErrorCount()).toBe(0);
  });

  it('tells the caller once, however many times it is asked to close', () => {
    let told = 0;
    const modal = make(() => { told++; });
    modal.display();

    modal._close();
    modal._close();
    modal._close();

    // Closing used to run the whole routine again - releasing a focus trap
    // that was already released, and calling the consumer back a second
    // time for one close.
    expect(told).toBe(1);
    expect(listenerErrorCount()).toBe(0);
  });

  it('announces the close to anyone listening, exactly once', () => {
    const modal = make();
    let announced = 0;
    modal.on('close', () => { announced++; });
    modal.display();

    modal._close();

    expect(announced).toBe(1);
  });

  it('closes again after being reopened', () => {
    let told = 0;
    const modal = make(() => { told++; });

    modal.display();
    modal._close();
    modal.display();
    modal._close();

    // The idempotence flag must not outlive the modal it guarded: a reused
    // modal that refuses to shut the second time is worse than the bug.
    expect(told).toBe(2);
    expect(listenerErrorCount()).toBe(0);
  });
});
