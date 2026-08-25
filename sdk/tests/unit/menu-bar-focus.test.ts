/**
 * Menu bar keyboard reachability.
 *
 * Reported live 2026-08-25, in two parts: "I can't tab to the menus" and
 * "when I tab to the menus I can't exit them". Two separate defects met in
 * the middle - every menu button carried tabIndex -1 so the Tab cycle skipped
 * the bar entirely, and DropdownMenu.close() released the focus trap without
 * giving focus back to anything, so Escape left focus on a hidden dropdown
 * and swallowed every key after it.
 *
 * These tests drive the SDK's own focus machinery rather than asserting on
 * options, so a future refactor that keeps the option but breaks the
 * behaviour still fails.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { MenuBar } from '../../engines/ui/blessed/widgets/menu-bar';
import { DropdownMenu } from '../../engines/ui/blessed/widgets/dropdown-menu';

function makeScreen(): any {
  return new Screen({ title: 'menu-focus', width: 80, height: 24 } as any);
}

function makeMenuBar(screen: any): any {
  return new MenuBar({
    screen,
    items: [
      { label: 'Chat', items: [{ label: 'Help', action: () => undefined }] },
      { label: 'Tools', items: [{ label: 'Emoji', action: () => undefined }] },
      { label: 'View', items: [{ label: 'Sidebar', action: () => undefined }] },
    ],
  } as any);
}

/** The buttons the bar created, in bar order. */
function buttons(menuBar: any): any[] {
  return menuBar.menuButtons;
}

/**
 * The element Screen considers focused. NOT `screen.focused` - that is
 * Element's own boolean "am I focused", which on a Screen is always false.
 */
function focusedElement(screen: any): any {
  return screen._focused;
}

/**
 * Press a key exactly the way Screen._handleKey does: emit `keypress <full>`
 * on the focused element, then the generic event if nothing claimed it.
 * (Element.onKeypress is NOT the live path - it is gated on a `keyable` flag
 * that nothing sets from the `keys: true` option.)
 */
function press(element: any, name: string): void {
  const key = { name, full: name, shift: false, ctrl: false, meta: false };
  if (element.emit(`keypress ${name}`, '', key) !== true) {
    element.emit('keypress', '', key);
  }
}

describe('menu bar in the Tab cycle', () => {
  let screen: any;

  afterEach(() => {
    DropdownMenu.closeAll();
    screen?.destroy();
  });

  it('is reachable by Tab', () => {
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);

    const focusable = (screen as any)._getFocusable();

    expect(focusable).toContain(buttons(menuBar)[0]);
  });

  it('is ONE stop on the cycle, not one per menu', () => {
    // Three menus must not mean three Tab presses to get past the bar.
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);

    const focusable = (screen as any)._getFocusable();
    const barStops = buttons(menuBar).filter((b: any) => focusable.includes(b));

    expect(barStops).toHaveLength(1);
  });

  it('walks between menus with Left and Right once focused', () => {
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);
    const [first, second] = buttons(menuBar);

    first.focus();
    press(first, 'right');

    expect(focusedElement(screen)).toBe(second);

    press(second, 'left');

    expect(focusedElement(screen)).toBe(first);
  });

  it('wraps around the ends rather than dead-ending', () => {
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);
    const all = buttons(menuBar);

    all[0].focus();
    press(all[0], 'left');

    expect(focusedElement(screen)).toBe(all[all.length - 1]);
  });
});

describe('leaving the menus', () => {
  let screen: any;

  afterEach(() => {
    DropdownMenu.closeAll();
    screen?.destroy();
  });

  it('closes an open menu on Escape and puts focus back on its button', () => {
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);
    const first = buttons(menuBar)[0];

    first.focus();
    press(first, 'down');   // open the menu
    expect(DropdownMenu.isAnyOpen()).toBe(true);

    press((menuBar as any).dropdowns[0], 'escape');

    expect(DropdownMenu.isAnyOpen()).toBe(false);
    expect(focusedElement(screen)).toBe(first);
  });

  it('emits exit on Escape when no menu is open, so the host can move focus', () => {
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);
    const first = buttons(menuBar)[0];
    const onExit = jest.fn();
    menuBar.on('exit', onExit);

    first.focus();
    press(first, 'escape');

    expect(onExit).toHaveBeenCalled();
  });

  it('does not strand focus on a hidden dropdown', () => {
    // The actual bug: close() released the focus trap but focus stayed on the
    // dropdown, which was now hidden, so every later key went nowhere.
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);
    const first = buttons(menuBar)[0];

    first.focus();
    press(first, 'down');
    const dropdown = (menuBar as any).dropdowns[0];
    press(dropdown, 'escape');

    expect(focusedElement(screen)).not.toBe(dropdown);
    expect(focusedElement(screen).hidden).toBe(false);
  });
});
