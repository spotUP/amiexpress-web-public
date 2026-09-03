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
import * as fs from 'fs';
import * as path from 'path';

import { MENU_SELECTIONS } from '../ui/menu';

/** The drawn rows, read out of the source that draws them. */
function drawnRows(): string[] {
  const source = fs.readFileSync(path.join(__dirname, '..', 'ui', 'menu.ts'), 'utf8');
  const start = source.indexOf('items: [');
  assert.ok(start > 0, 'the menu still builds its rows from an items array');
  const end = source.indexOf('],', start);
  return source.slice(start + 'items: ['.length, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith("'") || line.startsWith('"'))
    .map((line) => line.replace(/^['"]|['"],?$/g, ''));
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
