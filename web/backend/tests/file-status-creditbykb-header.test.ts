/**
 * Regression test for E-19: fileStatus header switches on TOGGLES_CREDITBYKB.
 *
 * express.e:24156-24160:
 *   IF sopt.toggles[TOGGLES_CREDITBYKB]
 *     aePuts('...    Conf  Files    KBytes         Files    KBytes         KBytes Avail Ratio\b\n')
 *   ELSE
 *     aePuts('...    Conf  Files    Bytes          Files    Bytes          Bytes Avail  Ratio\b\n')
 *   ENDIF
 *
 * Active FS command path is FileStatusHandler. We pin BOTH:
 *   - file-status.handler.ts has the toggle (live path)
 *   - file.handler.ts displayFileStatus has the toggle too (dead-but-exported
 *     duplicate; if it ever gets re-wired we don't want to silently regress
 *     to the always-KBytes-only header.)
 *
 * Same grep-style structural test as the other audit closures.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('fileStatus header switches on TOGGLES_CREDITBYKB (E-19, express.e:24156-24160)', () => {
  test('FileStatusHandler emits both headers under a CREDITBYKB conditional', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'handlers', 'file', 'file-status.handler.ts'),
      'utf8'
    );
    expect(src).toMatch(/ToggleFlags\.CREDITBYKB/);
    // Both header variants present
    expect(src).toMatch(/Conf\s+Files\s+KBytes\s+Files\s+KBytes\s+KBytes Avail/);
    expect(src).toMatch(/Conf\s+Files\s+Bytes\s+Files\s+Bytes\s+Bytes Avail/);
    // Conditional surrounds at least one of them
    const condBlock = src.match(/if\s*\(\s*creditByKB\s*\)[\s\S]{0,400}?else[\s\S]{0,400}?Bytes Avail/);
    expect(condBlock).not.toBeNull();
  });

  test('displayFileStatus duplicate in file.handler.ts also gates header on CREDITBYKB', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'handlers', 'file', 'file.handler.ts'),
      'utf8'
    );
    // Locate the displayFileStatus body
    const block = src.match(
      /export async function displayFileStatus\b[\s\S]{0,2500}?(?=\nexport |\n\/\/ =====|\n\}\n)/
    );
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/CREDITBYKB/);
    expect(block![0]).toMatch(/KBytes Avail/);
    expect(block![0]).toMatch(/Bytes Avail/);
  });
});
