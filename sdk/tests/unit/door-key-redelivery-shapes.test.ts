/**
 * Regression coverage for the "dialog eats the keystroke that opened it"
 * bug class fixed in screen.ts's _handleKey (commit 9bffcab04): a
 * `screen.key()` handler that opens a dialog or moves focus used to have
 * the SAME physical keystroke re-delivered to the newly focused element
 * (read live, after the handler ran), which then reacted to it.
 *
 * Two doors were audited for this shape 2026-09-01 (task-8,
 * .superpowers/sdd/2026-09-01-sprite-studio-2c-menus-windows-tools):
 *
 *  - neo-blessed-showcase/app.ts:3675 -
 *    `screen.key(['escape'], () => { menuList.focus(); screen.render(); })`
 *    List's own `_onKeypress` treats 'escape' as cancel/blur (list.ts:424).
 *    Reverting the _handleKey snapshot (this test file's first case)
 *    reproduces the bug: menuList.focus() is immediately undone by the
 *    same escape being redelivered to the (now current) focus, blurring
 *    it and firing 'cancel' within the same keypress.
 *
 *  - livechat/server.ts:2769 -
 *    `screen.key(['C-c', 'C-q'], () => showConfirm(...))`, where
 *    showConfirm opens the SDK's Question dialog and focuses its Yes
 *    button synchronously. Proven safe even with the OLD (pre-fix)
 *    dispatch, because Question's own key bindings (escape/enter/y/n/tab/
 *    arrows - question.ts:214-263) never include 'C-c' or 'C-q', so
 *    there is no overlap for a redelivered keystroke to hit.
 *
 * Both sites are protected today by the screen.ts fix; this file locks
 * that in against a regression to the pre-fix redelivery targeting.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { List } from '../../engines/ui/blessed/widgets/list';
import { Question } from '../../engines/ui/blessed/widgets/question';
import { Box } from '../../engines/ui/blessed/widgets/box';

function makeScreen(): any {
  return new Screen({ title: 'redelivery-shapes', width: 80, height: 24 } as any);
}

describe('door-shaped screen.key() handlers that move focus or open a dialog', () => {
  let screen: any;

  afterEach(() => {
    screen?.destroy();
  });

  it('neo-blessed-showcase shape: escape->menuList.focus() does not blur the list it just focused', () => {
    // Exact shape of Doors/neo-blessed-showcase/app.ts:3675.
    screen = makeScreen();
    const demoBox = new Box({ parent: screen, top: 0, left: 0, width: 80, height: 20, focusable: true } as any);
    const menuList = new List({
      parent: screen, top: 0, left: 0, width: 80, height: 20,
      interactive: true, items: ['a', 'b', 'c'],
    } as any);

    // A demo widget is focused, as it would be while browsing a demo.
    demoBox.focus();

    screen.key(['escape'], () => { menuList.focus(); screen.render(); });

    let cancelFired = false;
    menuList.on('cancel', () => { cancelFired = true; });

    screen._handleKey('', { name: 'escape', full: 'escape' });

    // menuList must still hold focus after the SAME escape keypress that
    // focused it - not immediately blurred by List's own escape handling.
    expect(screen._focused).toBe(menuList);
    expect(cancelFired).toBe(false);
  });

  it('livechat shape: C-c/C-q -> showConfirm() survives the keystroke that opened it', () => {
    // Exact shape of Doors/livechat/server.ts:2769-2775 via createDialogs's
    // showConfirmDialog (Doors/livechat/overlays/dialogs.ts:57).
    screen = makeScreen();
    const inputBox = new Box({ parent: screen, top: 0, left: 0, width: 80, height: 3, focusable: true } as any);
    inputBox.focus();

    const qd = new Question({
      parent: screen, top: 'center', left: 'center', width: 45, title: ' Confirm ',
      trapFocus: true, overlay: true,
    } as any);

    function showConfirm(text: string, cb: (a: boolean) => void) {
      qd.ask(text, (a: boolean) => {
        cb(a);
        inputBox.focus();
      });
    }

    screen.key(['C-c', 'C-q'], () => {
      showConfirm('Are you sure you want to quit LiveChat?', () => {});
    });

    screen._handleKey('', { name: 'C-c', full: 'C-c', ctrl: true });

    // The dialog must still be showing after the SAME C-c that opened it.
    expect(qd.hidden).toBe(false);

    // And it still answers to its own keys afterwards.
    screen._handleKey('', { name: 'escape', full: 'escape' });
    expect(qd.hidden).toBe(true);
  });
});
