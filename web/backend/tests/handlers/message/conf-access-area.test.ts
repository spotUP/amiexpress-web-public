/**
 * checkConfAccess — the AREA-NAME conference-access path (express.e:8511-8512).
 *
 * A board with more than nine conferences cannot use the X/_ confAccess string
 * (it caps at nine), so it holds an AREA NAME in confAccess and defines the
 * grants in Access/AREA.<name>.info via `Conf.<n>` tooltypes. uprough runs
 * fourteen conferences this way. Before the fix, this path was a fail-closed
 * stub that DENIED every Elite/Lamer/Sysop user their conferences.
 *
 * Drives the real board's Access/AREA.*.info files (committed): Elite grants
 * CONF.1-11 and 13 (no 12), Lamer only CONF.1, Disabled CONF.1,2,4-9 (not 3).
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

import * as path from 'path';
import { checkConfAccess } from '../../../src/handlers/message/message-scan.handler';
import { config } from '../../../src/config';

// Repo root holds Access/AREA.*.info.
const REPO_ROOT = path.resolve(__dirname, '../../../../..');

beforeAll(() => config.set('dataDir', REPO_ROOT));

describe('checkConfAccess — area-name access (express.e:8511-8512)', () => {
  it('Elite grants the conferences its .info lists (1-13) and denies beyond', () => {
    const u = { username: 'e', confAccess: 'Elite' };
    expect(checkConfAccess(u, 1)).toBe(true);
    expect(checkConfAccess(u, 13)).toBe(true);
    expect(checkConfAccess(u, 12)).toBe(false); // real gap - Elite lists no CONF.12
    expect(checkConfAccess(u, 14)).toBe(false); // beyond the list
  });

  it('Lamer grants only CONF.1', () => {
    const u = { username: 'l', confAccess: 'Lamer' };
    expect(checkConfAccess(u, 1)).toBe(true);
    expect(checkConfAccess(u, 2)).toBe(false);
  });

  it('a gap in the list is a denial (Disabled has no CONF.3)', () => {
    const u = { username: 'd', confAccess: 'Disabled' };
    expect(checkConfAccess(u, 4)).toBe(true);
    expect(checkConfAccess(u, 3)).toBe(false);
  });

  it('an unknown area (no .info file) denies every conference', () => {
    const u = { username: 'x', confAccess: 'NoSuchArea' };
    expect(checkConfAccess(u, 1)).toBe(false);
  });

  it('the X/_ string path is unchanged', () => {
    // Not an area name (only X/_), so the flag-string path runs.
    expect(checkConfAccess({ username: 'f', confAccess: 'X_X' }, 1)).toBe(true);
    expect(checkConfAccess({ username: 'f', confAccess: 'X_X' }, 2)).toBe(false);
    expect(checkConfAccess({ username: 'f', confAccess: 'X_X' }, 3)).toBe(true);
  });
});
