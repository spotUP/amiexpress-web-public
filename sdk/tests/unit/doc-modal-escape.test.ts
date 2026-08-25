/**
 * Closing a document modal.
 *
 * Reported live 2026-08-25: the LiveChat help screen would not close on
 * Escape. The modal binds its close keys and focuses its content area when
 * displayed, so the question is whether the key reaches it - a modal that
 * has lost focus swallows nothing and closes on nothing.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { DocModal } from '../../engines/ui/blessed/widgets/doc-modal';

function makeScreen(): any {
  return new Screen({ title: 'doc-modal', width: 80, height: 24 } as any);
}

function makeModal(screen: any): any {
  return new DocModal({
    parent: screen,
    title: 'Help',
    header: 'HELP',
    content: 'line one\nline two\nline three',
  } as any);
}

/** Press a key the way Screen dispatches it to the focused element. */
function press(element: any, name: string): boolean {
  const key = { name, full: name, shift: false, ctrl: false, meta: false };
  const handled = element.emit(`keypress ${name}`, '', key);
  return handled === true;
}

describe('closing a doc modal', () => {
  let screen: any;

  afterEach(() => screen?.destroy());

  it('focuses itself when displayed, so its keys can be pressed', () => {
    screen = makeScreen();
    const modal = makeModal(screen);

    modal.display();

    const focused = (screen as any)._focused;
    expect(focused === modal || focused?.hasAncestor?.(modal)).toBe(true);
  });

  it('closes on Escape', () => {
    screen = makeScreen();
    const modal = makeModal(screen);
    modal.display();

    press((screen as any)._focused, 'escape');

    expect(modal.hidden).toBe(true);
  });

  it('gives focus back to whatever asked for it', () => {
    screen = makeScreen();
    const modal = makeModal(screen);
    const caller: any = { focused: false, focus() { this.focused = true; } };

    modal.display(caller);
    press((screen as any)._focused, 'escape');

    expect(caller.focused).toBe(true);
  });

  it('is closed by a key even after something else stole focus', () => {
    // The real failure: a menu closing behind the modal pulled focus back to
    // the menu bar, so Escape went there instead. A modal must still be
    // reachable - it traps focus, so the trap has to reassert itself.
    screen = makeScreen();
    const modal = makeModal(screen);
    modal.display();

    // Something outside the modal grabs focus...
    (screen as any).setFocused(null);
    (screen as any)._handleKey('', { name: 'escape', full: 'escape' });

    expect(modal.hidden).toBe(true);
  });
});
