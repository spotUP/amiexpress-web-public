/**
 * A prompt must not be painted on the masthead row.
 *
 * ui_input_style_init defaults `row` to 1 - the masthead - so any widget
 * handed a NULL style paints itself over the branding. That was survivable
 * while the rail was static; once it animated from the idle hook it repainted
 * about five times a second and the prompt lived for a single frame:
 * "when i press p in subs it draws the prompt in the animated ///// lines so
 * it goes away" (reported from the board 2026-09-08).
 *
 * Three call sites had it - SUBS's post confirm and REQUESTS' claim and
 * withdraw. The fix is the row, not the animation: the rail owns row 1 and
 * keeps sliding. This pins the class so the next confirm cannot quietly
 * inherit row 1 again.
 */

import * as fs from 'fs';
import * as path from 'path';

const EXAMPLES = path.join(__dirname, '..', '..', '..', '..', 'sdk', 'c', 'examples');

function doorSources(): string[] {
  const out: string[] = [];
  for (const dir of fs.readdirSync(EXAMPLES, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const d = path.join(EXAMPLES, dir.name);
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith('.c')) out.push(path.join(d, f));
    }
  }
  return out;
}

describe('C doors never hand a blocking widget a NULL style', () => {
  it('no ui_confirm or ui_input is called with a NULL style', () => {
    const offenders: string[] = [];

    for (const file of doorSources()) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        // `, 0,` in the style slot is the default, and the default is row 1.
        if (/ui_(confirm|input)\s*\([^)]*&pushback\s*,\s*0\s*,/.test(line)) {
          offenders.push(`${path.basename(path.dirname(file))}/${path.basename(file)}:${i + 1}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('the default style really does put a prompt on the masthead row', () => {
    // If this ever changes, the guard above is no longer load-bearing.
    const src = fs.readFileSync(
      path.join(EXAMPLES, '..', 'src', 'ui_input.c'), 'utf8',
    );
    expect(src).toMatch(/style->row\s*=\s*1;/);
  });
});
