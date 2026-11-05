/**
 * The list is as long as the caller's screen, not as long as a number.
 *
 * The sysop, on the 80-column version: "the ansi version grows when the chrome
 * fills so all is not visible". Twenty callers plus eighteen rows of chrome is
 * twenty-eight rows on a twenty-four row screen, and the logo goes off the top
 * before anyone reads it.
 *
 * The original solved this and the answer was sitting in its own config file
 * the whole time: `LINES=AUTO`, which is
 * `getAEIntValue(DT_LINELENGTH) - 18`, floored at five (`GLCViewer.e:828-831`).
 * Eighteen is the wide screen's chrome - logo, title bar, column header, two
 * rules, the action legend and the three totals.
 */
import * as fs from 'fs';
import * as path from 'path';

import { autoLines, WIDE_CHROME_ROWS } from '../../../../board/Doors/glc-viewer/src/sizing';

const DOOR = path.join(__dirname, '../../../../board/Doors/glc-viewer');

describe('LINES=AUTO', () => {
  it('is the caller\'s own screen less the chrome, as the original computes it', () => {
    // A 24-row terminal: 24 - 18 = 6 callers, and the screen ends where the
    // screen ends.
    expect(autoLines(24)).toBe(24 - WIDE_CHROME_ROWS);
    expect(autoLines(25)).toBe(7);
    // A tall xterm gets the list it can hold.
    expect(autoLines(50)).toBe(32);
  });

  it('floors at five rather than going negative on a tiny screen', () => {
    // `IF count<0 THEN count:=5` - a caller with a twelve-row window still
    // gets a list, and the board's own pause handles the rest.
    expect(autoLines(18)).toBe(0);
    expect(autoLines(17)).toBe(5);
    expect(autoLines(1)).toBe(5);
  });
});

describe('what the door ships', () => {
  it('asks for AUTO out of the box, so a fresh board fits', () => {
    const cfg = fs.readFileSync(path.join(DOOR, 'GLCViewer.cfg'), 'latin1');
    expect(cfg).toMatch(/^LINES=AUTO$/m);
  });

  it('says the same thing in the manifest, or the next boot rewrites it', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DOOR, 'door.settings.json'), 'utf8'));
    const lines = manifest.settings.find((s: { cfgKey?: string }) => s.cfgKey === 'LINES');
    expect(lines.default).toBe('AUTO');
  });
});
