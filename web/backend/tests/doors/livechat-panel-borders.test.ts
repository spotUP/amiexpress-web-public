/**
 * One border colour, one focus colour, everywhere.
 *
 * Asked for 2026-08-26: "all window borders in the chat need to have the dark
 * blue colour when not active and cyan when active."
 *
 * ui/theme.ts has said this since it was written - and its own comment
 * explains why: every panel used to pick its own colour, the sidebar magenta,
 * the chat green, the input yellow, so the focused panel was impossible to
 * spot among colours that already competed. Eighteen panels had drifted back
 * to picking their own anyway.
 *
 * This test is the thing that stops that happening a third time.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PANEL_BORDER, PANEL_BORDER_FOCUS } from '../../../../Doors/livechat/ui/theme';

const DOOR = join(__dirname, '..', '..', '..', '..', 'Doors', 'livechat');

/** Every door source file, except the build output. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('the theme', () => {
  it('is dark blue when a panel is not active', () => {
    expect(PANEL_BORDER).toBe('blue');
  });

  it('is cyan when it is', () => {
    expect(PANEL_BORDER_FOCUS).toBe('cyan');
  });
});

describe('every panel', () => {
  it('takes its border colour from the theme, not its own taste', () => {
    const offenders: string[] = [];

    for (const file of sources(DOOR)) {
      if (file.endsWith('ui/theme.ts')) continue;
      // labelStyle lives INSIDE the border object and legitimately carries
      // its own colours - the panel label is white on blue - so it is taken
      // out before looking for border colours, or every labelled panel reads
      // as an offender.
      const text = readFileSync(file, 'utf8').replace(/labelStyle:\s*\{[^}]*\}/g, '');

      // A literal colour ANYWHERE inside a border object - the first version
      // of this test only matched `border: { fg: ... }` and walked straight
      // past `border: { type: 'line', fg: 'cyan' }`, which is how the two
      // main panels kept their old colour while the test said all was well.
      for (const m of text.matchAll(/border:\s*\{[^}]*\bfg:\s*'(\w+)'/g)) {
        offenders.push(`${file.replace(DOOR + '/', '')}: border fg '${m[1]}'`);
      }
      for (const m of text.matchAll(/borderColor:\s*'(\w+)'/g)) {
        offenders.push(`${file.replace(DOOR + '/', '')}: borderColor '${m[1]}'`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
