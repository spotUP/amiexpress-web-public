/**
 * A cleared number field must not put NaN into form state.
 *
 * Reported from the live board 2026-09-08, editing a door's settings:
 *
 *   The specified value "NaN" cannot be parsed, or is out of range.
 *
 * `parseInt('')` is NaN. Every one of these fields was written as
 * `parseInt(e.target.value)`, so the instant a sysop selected the value and
 * deleted it - the normal way to type a new number - state became NaN, React
 * wrote `value={NaN}` back into a `type="number"` input, and the browser
 * rejected it. The field then fought every further keystroke.
 *
 * It was never one field: ten call sites across six admin pages had the same
 * construction, and two lines in ConferencesPage already carried the `|| 0`
 * fallback that fixes it - the convention existed and simply had not been
 * applied. This test pins the whole class, because fixing the one field a
 * sysop happened to hit would leave nine more waiting.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..', 'src');

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    // Skip tests: this file names the construction in its own comments and
    // regex, and would otherwise report itself.
    if (entry.isDirectory()) {
      if (entry.name === 'test' || entry.name === '__tests__') continue;
      out.push(...tsxFiles(full));
    }
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('number inputs never write NaN into state', () => {
  it('has no unguarded parseInt(e.target.value) anywhere in the admin', () => {
    const offenders: string[] = [];

    for (const file of tsxFiles(SRC)) {
      const body = fs.readFileSync(file, 'utf8');
      const lines = body.split('\n');
      lines.forEach((line, i) => {
        // The bug is a parse with no fallback. `|| 0` (or any ??/|| guard) on
        // the same line is what makes a cleared field safe.
        if (!line.includes('parseInt(e.target.value')) return;
        // Two shapes are safe, and both appear in this codebase:
        //   parseInt(...) || 0            - guarded inline
        //   const p = parseInt(...);  Number.isNaN(p) ? 0 : p   - guarded next
        // So look at the whole statement, not one line. The PROPERTY is that a
        // parsed value is guarded before it reaches state; the spelling is free.
        const window = lines.slice(i, i + 3).join(' ');
        const guarded =
          /parseInt\(e\.target\.value[^)]*\)\s*(\|\||\?\?)/.test(window) ||
          /Number\.isNaN\(/.test(window);
        if (!guarded) offenders.push(`${path.relative(SRC, file)}:${i + 1}`);
      });
    }

    expect(offenders).toEqual([]);
  });

  it('parseInt on an empty string really is NaN - the premise of this test', () => {
    // If this ever stops being true the guard above is pointless, so pin it.
    expect(Number.isNaN(parseInt('', 10))).toBe(true);
    expect(parseInt('', 10) || 0).toBe(0);
  });
});
