/**
 * The J door lists the conferences the board actually has.
 *
 * "i still see adf area in the bbs" - after the conference was deleted, the
 * disk was right, the mirror was right, the board's own list was right, and
 * J (Doors:emp_tools/joincnf) went on showing "ADF Area" at position 9.
 *
 * The door reads BBS:ConfConfig.info through icon.library for NCONFS and for
 * NAME.n, and it is configured to (CNF_NAMES YES). But whenever joincnf.cfg
 * carries a CNF_NAME.n line, that string wins - verbatim, dots and all - and
 * the cfg shipped with a hand-typed table of 36 names from the board it came
 * from, twenty-odd of them conferences this board never had.
 *
 * Measured against the real binary under the emulator, with the live
 * ConfConfig.info:
 *   - cfg line present  -> the cfg string, whatever the icon says
 *   - cfg line REMOVED  -> the icon's NAME.n, formatted by the door the same
 *                          way ("[01] ................. Lamer Zonen")
 *   - every line removed -> all twelve from the icon, prompt still [1-12]
 *
 * So the fix is not in the emulator and not in the door: the cfg must not
 * carry names. This test keeps it that way, because the next person who
 * "fixes" a name by typing it into joincnf.cfg reintroduces the drift for
 * every conference change after it.
 */

import * as fs from 'fs';
import * as path from 'path';

const CFG = path.resolve(__dirname, '../../../../Doors/emp_tools/joincnf.cfg');

describe('Doors/emp_tools/joincnf.cfg', () => {
  const text = fs.readFileSync(CFG, 'latin1');

  it('asks the door to take conference names from ConfConfig.info', () => {
    expect(text).toMatch(/^CNF_NAMES\s+YES\b/m);
  });

  it('carries no hand-typed conference names, so the icon is the only source', () => {
    const hardcoded = text.match(/^CNF_NAME\.\d+\s*=.*$/gm) ?? [];
    expect(hardcoded).toEqual([]);
  });
});
