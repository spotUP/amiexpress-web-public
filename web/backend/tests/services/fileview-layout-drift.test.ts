/**
 * The shipped `Prompts/FILEVIEW.40` and the built-in constant must be BYTE
 * IDENTICAL.
 *
 * That equality is what makes "the file is absent" a valid state rather than a
 * degraded one: a board with no `Prompts/` prints exactly what a board with
 * the shipped file prints, so a sysop who deletes it loses nothing and a
 * deploy that has not yet seeded it changes nothing.
 *
 * The file is GENERATED from the constant
 * (`dev-scripts/generate-fileview-layout.ts`); this test is the thing that
 * notices when someone edits one of the two and not the other. Same shape as
 * the describe.ts mirror drift test.
 */
import * as fs from 'fs';
import * as path from 'path';

import { BUILT_IN_FILEVIEW_LAYOUT, compileFileLayout, sectionFault } from '../../src/services/file-layout.service';

const SHIPPED = path.join(__dirname, '..', '..', '..', '..', 'Prompts', 'FILEVIEW.40');

describe('the shipped layout file', () => {
  it('exists in the repo, so a deploy has something to seed', () => {
    expect(fs.existsSync(SHIPPED)).toBe(true);
  });

  it('is byte-identical to the built-in default', () => {
    const onDisk = fs.readFileSync(SHIPPED, 'utf8');
    if (onDisk !== BUILT_IN_FILEVIEW_LAYOUT) {
      throw new Error(
        'Prompts/FILEVIEW.40 has drifted from BUILT_IN_FILEVIEW_LAYOUT. ' +
        'Regenerate it: npx tsx dev-scripts/generate-fileview-layout.ts'
      );
    }
    expect(onDisk).toBe(BUILT_IN_FILEVIEW_LAYOUT);
  });

  it('is valid by the loader\'s own rules', () => {
    const layout = compileFileLayout(fs.readFileSync(SHIPPED, 'utf8'));
    expect(layout.fellBack).toEqual([]);
    expect(layout.diagnostics).toEqual([]);
    for (const name of ['header', 'row', 'footer', 'record'] as const) {
      expect(sectionFault(name, layout[name])).toBeUndefined();
    }
  });
});
