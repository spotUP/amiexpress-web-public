/**
 * q, ESC and F1 do what the menu says they do.
 *
 * Live on main until 2026-09-03: the three key handlers emitted a hardcoded
 * row index - 15 for quit, 14 for the manual - which was right when the menu
 * had sixteen rows. It has eighteen. So q and ESC opened HIGH SCORES and F1
 * opened SETTINGS. Nothing errored; the keys just did the wrong thing, which
 * is the kind of bug a type checker cannot see and a player hits immediately.
 *
 * The fix is that the handlers ask for the row BY NAME, so the two parallel
 * lists - the drawn rows and what they do - can grow without the keys
 * drifting. These tests pin the alignment itself, because that is the thing
 * that broke: not the lookup, the assumption that a number stays put.
 */

import assert from 'assert';

import { MENU_ITEMS, MENU_SELECTIONS } from '../ui/menu';

/**
 * The drawn rows.
 *
 * This used to read them out of the source with a string search, because the
 * rows were an array literal inside the widget call and there was nothing to
 * import. They are a module constant now - the compact menu has to be able to
 * filter them - so the test reads the array itself, which is both simpler and
 * harder to fool: a search for `items: [` finds whatever now sits there.
 */
function drawnRows(): readonly string[] {
  return MENU_ITEMS;
}

export async function quitIsTheRowThatQuits(): Promise<void> {
  const quit = MENU_SELECTIONS.indexOf('quit');
  assert.ok(quit >= 0, 'the menu has a quit row');

  const rows = drawnRows();
  assert.ok(rows[quit].toLowerCase().includes('quit'),
    `row ${quit} is what q and ESC choose, and it reads "${rows[quit]}"`);
}

export async function f1OpensTheManual(): Promise<void> {
  const manual = MENU_SELECTIONS.indexOf('manual');
  assert.ok(manual >= 0);

  const rows = drawnRows();
  assert.ok(rows[manual].toLowerCase().includes('manual'),
    `row ${manual} is what F1 chooses, and it reads "${rows[manual]}"`);
}

export async function theTwoListsAreTheSameLength(): Promise<void> {
  // The bug in one sentence: a row was added to one list and not the other.
  const rows = drawnRows();
  assert.strictEqual(rows.length, MENU_SELECTIONS.length,
    `${rows.length} rows are drawn and ${MENU_SELECTIONS.length} have an action`);
}

export async function everyRowDoesSomething(): Promise<void> {
  for (let index = 0; index < MENU_SELECTIONS.length; index += 1) {
    assert.ok(MENU_SELECTIONS[index], `row ${index} has an action`);
  }
}
