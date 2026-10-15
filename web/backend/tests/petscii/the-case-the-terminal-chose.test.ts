/**
 * The web canvas switches its own case with CTRL+ALT (its C= + SHIFT) and
 * tells the board; the board's next CTRL+L must toggle from THAT set, not
 * from the one it last sent (a C64 caller via the sysop, 2026-10-04; plan
 * `thoughts/shared/plans/2026-10-04-petscii-ctrl-l-case-toggle.md`).
 */
process.env.SKIP_DB_INIT = '1';

import {
  petsciiCaseChosenByTerminal,
  petsciiTerminalModelFor,
  togglePetsciiCase,
} from '../../src/utils/petscii-session-model';

function c64Session(): any {
  return { petsciiMode: true, terminalType: 'c64', screenWidth: 40 };
}

it('after the canvas chose the upper case set, CTRL+L switches back to lower case', () => {
  const session = c64Session();
  petsciiTerminalModelFor(session).transduce('menu');
  petsciiCaseChosenByTerminal(session, 0);
  expect(session.petsciiCaseBank).toBe(0);
  expect(session.petsciiTransducer.caseBank).toBe(0);

  const emitted: unknown[] = [];
  togglePetsciiCase({ emit: (_e: string, data: unknown) => emitted.push(data) }, session);
  expect(emitted).toEqual([{ bank: 1 }]);
});

it('a bank that is not 0 or 1 is ignored', () => {
  const session = c64Session();
  petsciiCaseChosenByTerminal(session, 'upper');
  expect(session.petsciiCaseBank).toBeUndefined();
});
