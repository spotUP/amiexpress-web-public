/**
 * The menu has to be navigable, and has to fit on the screen.
 *
 * Reported with a screenshot: "i cant navigate the menu in pengo and it's
 * offset to the left" - the title showed as "ngo" and every item was clipped.
 *
 * Two independent faults:
 *
 *   - The menu was a blessed List parented to gameArea. gameArea is only
 *     GRID_WIDTH * 2 columns - the width of the board - so a 40-column menu
 *     asking for left:"center" inside it resolved to left:-5 and hung five
 *     columns off the left edge.
 *
 *   - The screen is created with `input: null`: blessed never receives a real
 *     key, so the List's keys:true and focus() could never fire. Meanwhile
 *     handleMenuInput moved gameData.menuSelection, which the List ignored.
 *     Two competing menus, neither of them working.
 *
 * Pengo was the only arcade door still doing this; the other eight already
 * drive their menus from gameData.menuSelection.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { GRID_WIDTH, MENU_OPTIONS } from '../game/constants';

function indexSource(): string {
  return readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
}

/** No screen may rely on blessed receiving keys, because it never does. */
export async function nothingRelaysOnBlessedReceivingKeys(): Promise<void> {
  const src = indexSource();

  assert.ok(
    /input: null/.test(src),
    'this test assumes the screen takes no input; if that changed, revisit it'
  );
  assert.ok(
    !/new List\(/.test(src),
    'a blessed List owns its own selection and needs real key events - it can never work here'
  );
  assert.ok(
    !/screen\.emit\('keypress'/.test(src),
    're-emitting keypress at the screen and hoping a widget catches it is not a menu'
  );
}

/** The menu is driven by the door's own selection state. */
export async function theMenuIsDrivenByMenuSelection(): Promise<void> {
  const src = indexSource();

  assert.ok(
    /case "menu":\s*\n\s*handleMenuInput\(inputKey\);/.test(src),
    'menu input must reach handleMenuInput'
  );
  assert.ok(
    /index === gameData\.menuSelection/.test(src),
    'the rendered menu must highlight the selected row from gameData'
  );
  assert.ok(MENU_OPTIONS.length > 1, 'there should be something to navigate');
}

/**
 * No popup is wider than what it is parented to.
 *
 * gameArea is the board's width, not the screen's, which is what pushed the
 * menu off the left edge.
 */
export async function noPopupIsWiderThanItsParent(): Promise<void> {
  const src = indexSource();
  const boardColumns = GRID_WIDTH * 2;

  // Every popup that asks to be centred must be parented to the screen.
  const centred = [...src.matchAll(/new (?:Box|ScrollableBox)\(\{([\s\S]*?)\n  \}\)/g)];
  for (const [, body] of centred) {
    if (!/left: "center"/.test(body)) continue;

    const width = body.match(/width:\s*(\d+)/);
    const parent = body.match(/parent:\s*(\w+)/);
    if (!width || !parent) continue;

    if (Number(width[1]) > boardColumns) {
      assert.strictEqual(
        parent[1], 'screen',
        `a ${width[1]}-column popup centred inside ${parent[1]} (only ${boardColumns} ` +
        'columns wide) resolves to a negative left and hangs off the screen'
      );
    }
  }
}
