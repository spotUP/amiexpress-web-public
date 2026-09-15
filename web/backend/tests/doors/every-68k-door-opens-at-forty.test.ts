/**
 * THE WIDTH GATE IS DEFAULT-CLOSED, AND THIS BOARD'S DOORS NOW SAY SOMETHING.
 *
 * The sysop's first C64 walk of the board, 2026-09-16, was door after door
 * answering `THIS DOOR NEEDS AN 80 COLUMN SCREEN`: 55 of his 149 command
 * icons were adapted-type doors (XIM/DD/SIM/FIM) that declared no width at
 * all, and a door that says nothing is refused. Asked whether to mark them,
 * he said mark all 55.
 *
 * `dev/scripts/mark-doors-c64-adapt.ts` is what did it, and this pins the
 * DECISION it makes rather than the 59 files it touched - the files are the
 * sysop's to change, the rule is not:
 *
 *   - an adapted-type door with no width declaration gets `C64_ADAPT=40`;
 *   - a door that already declares one is left exactly as it is, because
 *     somebody decided that and a sweep does not overrule a decision;
 *   - a type the adapter's seam never sees is never marked, because marking
 *     one lets a caller in and then serves them 80-column bytes.
 */
import { verdictFor } from '../../../../dev/scripts/mark-doors-c64-adapt';

describe('which doors the sweep marks', () => {
  it('marks a 68K door that says nothing about width', () => {
    expect(verdictFor({ TYPE: 'XIM' })).toBe('mark');
    for (const type of ['DD', 'SIM', 'FIM', 'xim']) {
      expect({ type, verdict: verdictFor({ TYPE: type }) }).toEqual({ type, verdict: 'mark' });
    }
  });

  it('leaves a door that already declares a width alone', () => {
    expect(verdictFor({ TYPE: 'XIM', MIN_COLUMNS: '40' })).toBe('already-declared');
    expect(verdictFor({ TYPE: 'XIM', C64_ADAPT: '40' })).toBe('already-declared');
    expect(verdictFor({ TYPE: 'XIM', C64_VIEWPORT: '1' })).toBe('already-declared');
    // Including one that says it needs the full eighty: that is a decision too.
    expect(verdictFor({ TYPE: 'XIM', MIN_COLUMNS: '80' })).toBe('already-declared');
  });

  it('never marks a type the adapter cannot reach', () => {
    // A TS door paints its own blessed UI and an AREXX door never builds an
    // AmigaDoorSession, so neither crosses the adapter's seam.
    for (const type of ['TS', 'AIM', 'AREXX', '']) {
      expect({ type, verdict: verdictFor({ TYPE: type }) }).toEqual({ type, verdict: 'not-adapted-type' });
    }
  });

  it('reads the tooltype names case-insensitively, as the board does', () => {
    expect(verdictFor({ type: 'xim', c64_adapt: '40' })).toBe('already-declared');
  });
});
