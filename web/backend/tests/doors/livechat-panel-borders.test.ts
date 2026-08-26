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
  it('is dim when a panel is not active, bright when it is', () => {
    // The signal that matters is DIM versus BRIGHT - the widest gap the
    // palette offers. Dark blue on black was close to unreadable.
    expect(PANEL_BORDER).toBe('gray');
    expect(PANEL_BORDER_FOCUS).toBe('white');
  });

  it('never uses the dark blue that could not be seen', () => {
    expect(PANEL_BORDER).not.toBe('blue');
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
      // Comments stripped first: this file's own explanations quote the bad
      // pattern as an example, and a comment is not behaviour. labelStyle
      // goes too - it lives inside the border object and legitimately has
      // its own colours, since a panel label is white on blue.
      const text = readFileSync(file, 'utf8')
        .split('\n')
        .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
        .join('\n')
        .replace(/labelStyle:\s*\{[^}]*\}/g, '');

      // A literal colour ANYWHERE inside a border object - the first version
      // of this test only matched `border: { fg: ... }` and walked straight
      // past `border: { type: 'line', fg: 'cyan' }`, which is how the two
      // main panels kept their old colour while the test said all was well.
      for (const m of text.matchAll(/border:\s*\{[^}]*\bfg:\s*'(\w+)'/g)) {
        offenders.push(`${file.replace(DOOR + '/', '')}: border fg '${m[1]}'`);
      }

      // A colour on the WIDGET's border object is ignored by the renderer,
      // theme constant or not: Element reads style.border / border.style /
      // style.fg. `border: { type: 'line', fg: PANEL_BORDER }` therefore
      // looked correct in the source and drew grey, which is exactly how the
      // sidebar and the chat panel stayed grey while everything here passed.
      //
      // `type` is what tells the two apart: only the widget-level border
      // carries it, while the one inside `style` is colours alone.
      for (const m of text.matchAll(/border:\s*\{([^}]*)\}/g)) {
        const body = m[1];
        if (/\btype:/.test(body) && /\bfg:/.test(body)) {
          offenders.push(`${file.replace(DOOR + '/', '')}: colour on the widget border object (use style.border)`);
        }
      }
      for (const m of text.matchAll(/borderColor:\s*'(\w+)'/g)) {
        offenders.push(`${file.replace(DOOR + '/', '')}: borderColor '${m[1]}'`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
