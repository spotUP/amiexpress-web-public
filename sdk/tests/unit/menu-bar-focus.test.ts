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

  it('leaves the menus entirely on ONE Escape', () => {
    // Desktop menu bars take two presses - one to close the menu, one to
    // leave the bar - and that was reported as a nuisance here: "the first
    // Esc closes the menu but focus stays on the menu, I have to press Esc
    // again to get out" (2026-08-26).
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);
    const first = buttons(menuBar)[0];
    const onExit = jest.fn();
    menuBar.on('exit', onExit);

    first.focus();
    press(first, 'down');   // open the menu
    expect(DropdownMenu.isAnyOpen()).toBe(true);

    press((menuBar as any).dropdowns[0], 'escape');

    expect(DropdownMenu.isAnyOpen()).toBe(false);
    expect(onExit).toHaveBeenCalled();
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

describe('opening a menu from the keyboard', () => {
  let screen: any;

  afterEach(() => {
    DropdownMenu.closeAll();
    screen?.destroy();
  });

  it('opens the menu WITHOUT also choosing its first item', () => {
    // Reported live 2026-08-25: "Enter opened the help screen" - the first
    // item of the first menu. The button's handler did not claim the key, so
    // Screen re-emitted the same Enter to what was now focused: the dropdown
    // it had just opened, which selected item one.
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);
    const chosen: string[] = [];
    (menuBar as any).dropdowns[0].on('select', (item: any) => chosen.push(item.label));

    const first = buttons(menuBar)[0];
    first.focus();
    press(first, 'enter');

    expect(DropdownMenu.isAnyOpen()).toBe(true);
    expect(chosen).toEqual([]);
  });

  it('reports the key as handled, so nothing downstream sees it', () => {
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);
    const first = buttons(menuBar)[0];
    first.focus();

    const key = { name: 'enter', full: 'enter', shift: false, ctrl: false, meta: false };
    const handled = first.emit('keypress enter', '', key);

    expect(handled).toBe(true);
  });

});

describe('a menu that has just opened', () => {
  let screen: any;

  afterEach(() => {
    DropdownMenu.closeAll();
    screen?.destroy();
  });

  it('is painted at once, not on the next keystroke', () => {
    // Reported live 2026-08-25: "if I tab to the menus they don't show, but
    // if I press arrow down to go to the next entry they draw." The
    // differential renderer had nothing marked dirty where the menu had
    // appeared. Opening with the mouse hid it, because the mouse event
    // dirtied the screen by itself.
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);
    const first = buttons(menuBar)[0];

    let fullRedraws = 0;
    const original = (screen as any).forceFullRedraw.bind(screen);
    (screen as any).forceFullRedraw = () => { fullRedraws += 1; return original(); };

    first.focus();
    press(first, 'enter');

    expect(DropdownMenu.isAnyOpen()).toBe(true);
    expect(fullRedraws).toBeGreaterThan(0);
  });
});

describe('the FIRST menu opened on a screen that has already rendered', () => {
  let screen: any;

  afterEach(() => {
    DropdownMenu.closeAll();
    screen?.destroy();
  });

  /** The characters painted where the menu should be. */
  function paintedAt(scr: any, dropdown: any): string {
    const pos = dropdown._getCoords();
    const row = scr.buffer[pos.yi];
    return row ? row.slice(pos.xi, pos.xl).map((c: [number, string]) => c[1]).join('') : '';
  }

  it('is painted the moment it opens', () => {
    // The real sequence: the door draws its UI, THEN the player opens a
    // menu. A menu built at one position and moved to its anchor only when
    // opened kept the coords it was built with, so the first open painted
    // nothing and the player had to press a key to shake it loose.
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);
    screen.render();                    // the door's UI is on screen already

    // The menu has been laid out at least once at its BUILD position, which
    // is what leaves a stale entry in the coords cache.
    const built = (menuBar as any).dropdowns[0];
    built._getCoords();

    const first = buttons(menuBar)[0];
    first.focus();
    press(first, 'enter');

    const dropdown = (menuBar as any).dropdowns[0];
    expect(dropdown.hidden).toBe(false);
    expect(paintedAt(screen, dropdown).trim().length).toBeGreaterThan(0);
  });

  it('sits where its button is, not where it was built', () => {
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);
    screen.render();
    (menuBar as any).dropdowns[1]._getCoords();

    const second = buttons(menuBar)[1];
    second.focus();
    press(second, 'enter');

    const dropdown = (menuBar as any).dropdowns[1];
    const menuPos = dropdown._getCoords();
    const buttonPos = second._getCoords();

    expect(menuPos.xi).toBe(buttonPos.xi);
    expect(menuPos.yi).toBe(buttonPos.yl);
  });
});

describe('arriving at the menu bar', () => {
  let screen: any;

  afterEach(() => {
    DropdownMenu.closeAll();
    screen?.destroy();
  });

  it('opens its first menu when the host says the player has arrived', () => {
    // Reported repeatedly as "the menus don't open until I press arrow
    // down". The host calls this when its focus cycle lands on the bar.
    //
    // Done here rather than from a focus EVENT on purpose: opening a menu
    // closes the others, and each close hands focus back to its own button,
    // which would open that menu again - an infinite loop that hung the
    // test suite when tried.
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);

    menuBar.openFirst();

    expect(DropdownMenu.isAnyOpen()).toBe(true);
  });

  it('does not disturb a menu that is already open', () => {
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);

    menuBar.openFirst();
    const openedFirst = (menuBar as any).dropdowns[0];
    menuBar.openFirst();

    expect(openedFirst.hidden).toBe(false);
  });

  it('still leaves on one Escape', () => {
    screen = makeScreen();
    const menuBar = makeMenuBar(screen);
    const onExit = jest.fn();
    menuBar.on('exit', onExit);

    menuBar.openFirst();
    press((menuBar as any).dropdowns[0], 'escape');

    expect(DropdownMenu.isAnyOpen()).toBe(false);
    expect(onExit).toHaveBeenCalled();
  });
});
