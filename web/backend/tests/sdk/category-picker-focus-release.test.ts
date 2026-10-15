/**
 * A picker must be out of the way before it hands control back.
 *
 * Reported 2026-08-26 with a screenshot: picking the emoji `\(^o^)/`, pressing
 * Enter to send it, and getting a SECOND copy in the input instead - then a
 * second Enter sending both at once.
 *
 * CategoryPicker._selectCurrentItem ran the caller's callback first and only
 * then hid itself:
 *
 *   this._onSelect(...)   // livechat focuses its input box in here
 *   this.emit('select')
 *   this.hide()           // releases the focus trap
 *
 * The callback moves focus to the input, but the picker's focus TRAP is still
 * armed at that moment, and the trap reasserts itself on the next keypress
 * (core/screen.ts: "A focus trap has to reassert itself whenever focus is
 * outside it"). So the next Enter was dragged back into the picker's item
 * list, which selected the same emoji again.
 *
 * Hiding first makes the callback's focus change stick.
 */

import { Screen, CategoryPicker, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { CategoryItem } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const ITEMS: Record<string, CategoryItem[]> = {
  Emotions: [
    { id: 'wave', label: '\\(^o^)/' } as CategoryItem,
    { id: 'smile', label: ':-)' } as CategoryItem,
  ],
};

function build() {
  const screen = new Screen({ title: 'picker focus test', width: 80, height: 24 });

  // Stands in for livechat's message input.
  const input = new Box({
    parent: screen,
    top: 20, left: 0, width: 40, height: 1,
    keys: true, focusable: true,
  } as any);

  const picker = new CategoryPicker({
    parent: screen,
    title: 'Emoji Picker',
    width: 40,
    height: 12,
    categories: ['Emotions'],
    getItems: (c: string) => ITEMS[c] ?? [],
  } as any);

  return { screen, input, picker };
}

describe('CategoryPicker selection', () => {
  it('is already hidden when the caller callback runs', () => {
    const { screen, input, picker } = build();
    let visibleDuringCallback: boolean | null = null;

    picker.onSelect(() => {
      visibleDuringCallback = picker.isVisible();
      input.focus();
    });

    picker.display();
    (picker as any)._selectCurrentItem();

    // The callback is where a caller moves focus. A picker still on screen
    // with its trap armed will take that focus straight back.
    expect(visibleDuringCallback).toBe(false);
    screen.destroy?.();
  });

  it('leaves focus where the callback put it', () => {
    const { screen, input, picker } = build();

    picker.onSelect(() => { input.focus(); });

    picker.display();
    (picker as any)._selectCurrentItem();

    // getFocused() is the focused ELEMENT; screen.focused is a boolean about
    // the Screen itself.
    expect((screen as any).getFocused()).toBe(input);
    screen.destroy?.();
  });

  it('still delivers the selected item to the callback', () => {
    const { screen, picker } = build();
    const picked: string[] = [];

    picker.onSelect((item: CategoryItem) => { picked.push(item.id as string); });

    picker.display();
    (picker as any)._selectCurrentItem();

    expect(picked).toEqual(['wave']);
    screen.destroy?.();
  });

  it('selects once per Enter, not once per re-entry', () => {
    const { screen, input, picker } = build();
    let calls = 0;

    picker.onSelect(() => { calls++; input.focus(); });

    picker.display();
    (picker as any)._selectCurrentItem();

    expect(calls).toBe(1);
    screen.destroy?.();
  });
});
