/**
 * The menu is three parallel arrays, and this file exists because they drifted.
 *
 * `items`, `selections` and the descriptions are index-aligned by convention
 * and by nothing else. Key bindings used to hardcode positions into them - q
 * and ESC jumped to index 15 for quit, F1 to index 14 for the manual - and when
 * rows were added above, those indices quietly started pointing at High Scores
 * and Settings instead. Nothing failed; the keys just did the wrong thing.
 *
 * So: the arrays must agree in length, the lookups must resolve, and the new
 * mode must actually be reachable. A feature that compiles but cannot be
 * selected is not done.
 */

import assert from 'assert';
import { MENU_ITEMS, MENU_SELECTIONS, MenuSelection } from '../../ui/menu';

export async function theMenuArraysAreIndexAligned(): Promise<void> {
  assert.strictEqual(
    MENU_ITEMS.length, MENU_SELECTIONS.length,
    'every rendered row needs exactly one selection behind it',
  );
}

/**
 * The regression. These were hardcoded, and adding rows above them silently
 * repointed them; they are looked up now, and this proves the lookup lands on
 * the row whose label says so.
 */
export async function quitAndManualResolveToTheirOwnRows(): Promise<void> {
  const quit = MENU_SELECTIONS.indexOf('quit');
  const manual = MENU_SELECTIONS.indexOf('manual');

  assert.ok(quit >= 0, 'the menu has a quit row');
  assert.ok(manual >= 0, 'the menu has a manual row');

  assert.match(MENU_ITEMS[quit], /Quit/i, `row ${quit} should be the Quit row`);
  assert.match(MENU_ITEMS[manual], /Manual/i, `row ${manual} should be the Manual row`);

  // The specific failure that shipped: these landed on stats and settings.
  assert.notStrictEqual(MENU_SELECTIONS[quit], 'stats');
  assert.notStrictEqual(MENU_SELECTIONS[manual], 'settings');
}

export async function tetrisAttackIsReachableFromTheMenu(): Promise<void> {
  const index = MENU_SELECTIONS.indexOf('tetris_attack' as MenuSelection);
  assert.ok(index >= 0, 'TETRIS ATTACK has a selection');
  assert.match(
    MENU_ITEMS[index], /TETRIS ATTACK/,
    'and the row at that index is the one that says so',
  );
}

/**
 * Every selection appears once. A duplicate would make indexOf resolve to the
 * first, and the second row would be unreachable while looking fine.
 */
export async function noSelectionAppearsTwice(): Promise<void> {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  MENU_SELECTIONS.forEach((selection, index) => {
    // The separator row deliberately reuses a selection; skip blank labels.
    if (MENU_ITEMS[index] === '') return;
    if (seen.has(selection)) duplicates.push(selection);
    seen.add(selection);
  });
  assert.deepStrictEqual(duplicates, [], 'a duplicate selection hides a row');
}
