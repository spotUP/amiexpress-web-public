/**
 * The ACS file only holds flags AmiExpress reads.
 *
 * The admin has two security endpoints and they name flags differently: the
 * file-backed one the Security page uses says `ACS.CENSORED`, while the
 * database mirror `dev/console` reads says `CENSORED`. Saving the mirror's
 * spelling through the file-backed route added a tooltype nobody reads - the
 * save reported success, the board was unchanged, and Access/ACS.10.info grew
 * a line that means nothing. (This session put `(CENSORED)` into that very
 * file before noticing.)
 *
 * Toggling a key the file already carries stays allowed whatever it is named:
 * these files hold non-ACS tooltypes too, and turning one off is not the same
 * as inventing one.
 */

import { flagsToTooltypes, tooltypesToFlags } from '../../src/services/config-services/acs-level-file.service';
import type { Tooltype } from '../../src/utils/info-file.util';

const tt = (key: string, commented = false): Tooltype => ({
  key, value: '', commented, commentStyle: commented ? '()' : undefined, prefix: '', originalLine: key,
});

describe('writing ACS flags', () => {
  const existing = [tt('ACS.DOWNLOAD'), tt('ACS.CENSORED', true), tt('LEGACY_KEY')];

  it('grants and denies a flag the file already has', () => {
    const out = flagsToTooltypes(existing, { 'ACS.CENSORED': true, 'ACS.DOWNLOAD': false });
    const flags = tooltypesToFlags(out);

    expect(flags['ACS.CENSORED']).toBe(true);
    expect(flags['ACS.DOWNLOAD']).toBe(false);
  });

  it('adds a new flag when it is named the way AmiExpress reads them', () => {
    const out = flagsToTooltypes(existing, { 'ACS.BREAK_CHAT': true });

    expect(tooltypesToFlags(out)['ACS.BREAK_CHAT']).toBe(true);
  });

  it('refuses to invent the mirror spelling, and says which one', () => {
    expect(() => flagsToTooltypes(existing, { CENSORED: true }))
      .toThrow(/CENSORED/);
    expect(() => flagsToTooltypes(existing, { CENSORED: true }))
      .toThrow(/ACS\.<NAME>/);
  });

  it('still toggles a non-ACS key the file already carries', () => {
    const out = flagsToTooltypes(existing, { LEGACY_KEY: false });

    expect(out.find(t => t.key === 'LEGACY_KEY')?.commented).toBe(true);
  });
});
