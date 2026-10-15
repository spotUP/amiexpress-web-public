/**
 * The artist is told what a save will touch BEFORE they click it.
 *
 * The fan-out itself is not in question and is deliberately NOT
 * `same-content`: that rule wrote only the file being edited once a copy had
 * diverged, and the board went on serving the other 46 - "the bbs still reads
 * the old bbs title petscii", twice. The dialog writes the union of every copy
 * the screen resolves to and every copy still identical to this one.
 *
 * What was missing is the warning. "Saved 38 copies" after the fact tells an
 * artist what they have already done.
 */
import { expect, it } from 'vitest';

import { savingLabel } from '../pages/screen-write-plan';

it('says how many copies a save will write', () => {
  expect(savingLabel(['Node0/logoff.txt', 'Node1/logoff.txt', 'Node2/logoff.txt']))
    .toBe('Saving 3 copies');
});

it('says nothing for an ordinary one-file screen', () => {
  // Every screen on this board that has not been provisioned per node is one
  // file, and "Saving 1 copy" on each of them is noise.
  expect(savingLabel(['Screens/uprough.txt'])).toBe('');
  expect(savingLabel([])).toBe('');
});
