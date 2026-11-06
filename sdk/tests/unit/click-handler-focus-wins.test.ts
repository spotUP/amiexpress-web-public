/**
 * A left click must not take back focus that its own handler moved.
 *
 * Reported in LiveChat (2026-11-06): right-click a message, choose Reply
 * with the mouse, and the input box shows "/reply 77 " but typing goes
 * nowhere. The menu is a List: its click handler emits 'select', the door
 * hides the menu and focuses the input box, and then Element.onMouse()
 * claimed focus for the clicked element - the now-hidden menu - so every
 * key went to a list nobody could see. The keyboard path (arrows + Enter)
 * worked because it never reaches onMouse().
 *
 * These tests drive the real Element.onMouse() with a mousedown, the path a
 * pointer click takes, and read focus back from the Screen. Identity is
 * compared as a boolean: a failing toBe() on two elements prints both trees.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { Box } from '../../engines/ui/blessed/widgets/box';
import { List } from '../../engines/ui/blessed/widgets/list';

function makeScreen(): any {
  return new Screen({ title: 'click-handler-focus-wins', width: 80, height: 24 } as any);
}

function leftClick(el: any, x: number, y: number): void {
  el.onMouse({ action: 'mousedown', button: 'left', x, y });
}

describe('a left click and the focus its handler sets', () => {
  let screen: any;

  afterEach(() => screen?.destroy());

  it('choosing a menu item with the mouse leaves focus where the select handler put it', () => {
    screen = makeScreen();
    const input = new Box({ parent: screen, top: 20, left: 0, width: 40, height: 3, keys: true } as any);
    const menu = new List({
      parent: screen, top: 2, left: 2, width: 20, height: 5, border: { type: 'line' },
      mouse: true, keys: true, interactive: true, items: ['Reply', 'Quote'],
    } as any);
    menu.focus();
    screen.render();

    let chosen = '';
    menu.on('select', (item: any) => {
      chosen = typeof item === 'string' ? item : item.content;
      menu.hide();
      input.focus();
    });

    // Row 3 is the first item: top 2 plus the border.
    leftClick(menu, 5, 3);

    expect(chosen).toBe('Reply');
    expect(screen.getFocused() === input).toBe(true);
  });

  it('a plain click on a clickable element still claims focus', () => {
    screen = makeScreen();
    const other = new Box({ parent: screen, top: 20, left: 0, width: 40, height: 3, keys: true } as any);
    const button = new Box({ parent: screen, top: 2, left: 2, width: 10, height: 3, clickable: true, mouse: true } as any);
    other.focus();
    screen.render();

    leftClick(button, 4, 3);

    expect(screen.getFocused() === button).toBe(true);
  });

  it('a click whose handler hides the element does not focus the hidden element', () => {
    screen = makeScreen();
    const other = new Box({ parent: screen, top: 20, left: 0, width: 40, height: 3, keys: true } as any);
    const button = new Box({ parent: screen, top: 2, left: 2, width: 10, height: 3, clickable: true, mouse: true } as any);
    other.focus();
    screen.render();
    button.on('click', () => button.hide());

    leftClick(button, 4, 3);

    expect(screen.getFocused() === button).toBe(false);
  });
});
