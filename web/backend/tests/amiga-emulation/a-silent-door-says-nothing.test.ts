/**
 * "the logoff screen is broken sometimes" - sysop, 2026-09-14.
 *
 * `LOGOFF<n>` runs `BBS:Batch<n>` as a SIM door, and a SIM door's stdout
 * reaches the caller by design - which is right for a door he ran and wrong
 * for maintenance. express.e's answer is the SILENT tooltype
 * (`doorSilent`, express.e:4774), gating every write to the line.
 */
import { stdoutReachesCaller } from '../../src/amiga-emulation/door-stdout-policy';

describe('a silent door says nothing to the caller', () => {
  it('keeps a SIM door talking, because that is how a SIM door talks', () => {
    expect(stdoutReachesCaller({ doorType: 'SIM' })).toBe(true);
    expect(stdoutReachesCaller({ doorType: 'SUP' })).toBe(true);
    expect(stdoutReachesCaller({})).toBe(true);        // SIM is the default
  });

  it('silences a SIM door that declares SILENT', () => {
    expect(stdoutReachesCaller({ doorType: 'SIM', silent: true })).toBe(false);
    expect(stdoutReachesCaller({ doorType: 'sim', silent: true })).toBe(false);
  });

  it('still points a XIM door at NIL:, silent or not', () => {
    for (const doorType of ['XIM', 'AIM', 'TIM', 'IIM', 'MCI', 'AEM']) {
      expect({ doorType, reaches: stdoutReachesCaller({ doorType }) })
        .toEqual({ doorType, reaches: false });
    }
    expect(stdoutReachesCaller({ doorType: 'XIM', silent: true })).toBe(false);
  });
});
