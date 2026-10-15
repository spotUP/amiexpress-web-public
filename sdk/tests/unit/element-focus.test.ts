/**
 * An explicit focus() call focuses; `focusable` is about the TAB ORDER.
 *
 * Every Element defaults to `focusable: false`, and focus() used to return
 * silently for those - so a door that built a scrollable text window and
 * called focus() on it kept the focus it already had. The window's own
 * key(['escape','q']) handlers never ran, and the dialog could not be closed:
 * CARD LOBBY's profile, achievements and leaderboard windows, reported as
 * "i can't exit them" (2026-09-02). Nothing threw and nothing logged.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { Box } from '../../engines/ui/blessed/widgets/box';

function screenWithBoxes() {
  const screen = new Screen({ smartCSR: false, width: 80, height: 25 } as any);
  const plain = new Box({ parent: screen, top: 0, left: 0, width: 10, height: 3 });
  const tabbable = new Box({ parent: screen, top: 4, left: 0, width: 10, height: 3, focusable: true } as any);
  return { screen, plain, tabbable };
}

describe('Element.focus', () => {
  it('focuses a widget that was not built focusable', () => {
    const { screen, plain } = screenWithBoxes();

    plain.focus();

    expect(screen.getFocused()).toBe(plain);
  });

  it('still refuses a disabled widget', () => {
    const { screen, plain } = screenWithBoxes();
    (plain as any).disabled = true;

    plain.focus();

    expect(screen.getFocused()).not.toBe(plain);
  });

  it('keeps focusable meaning "stop here when tabbing"', () => {
    // The tab ring is built from options.focusable, which is untouched: a
    // plain box can be focused by name but is not stopped at by Tab.
    const { screen, plain, tabbable } = screenWithBoxes();

    const ring = (screen as any)._getFocusable(screen);

    expect(ring).toContain(tabbable);
    expect(ring).not.toContain(plain);
  });
});
