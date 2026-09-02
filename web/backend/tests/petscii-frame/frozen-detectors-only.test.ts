/**
 * The 80-COLUMN NON-NEGOTIABLE, as a test.
 *
 * Since Phase 3 Task 1 the board's art/paint detectors ARE the SDK's
 * (`ascii-art.util.ts` is one `export ... from '@amiexpress/bbs-door-sdk/petscii/frame'`),
 * so the 80-column path now reaches a module that also holds the C64 ladder -
 * `classifyRow`, `isRuleRow`, `columnSpans`, `chooseRule`, `narrowRow`, the
 * lot. Phase 3 Task 2 changed those freely on the argument that no ANSI
 * session reaches them. This pins the argument: the files ON the 80-column
 * path take the two FROZEN names out of that module and nothing else.
 *
 * If a future change needs a third name here, that name joins the frozen set
 * and its behaviour stops being free to move - which is the decision this test
 * exists to force into the open.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../../src');
const FROZEN = ['looksLikeAsciiArt', 'positionsCursorAbsolutely'];
const FRAME_MODULE = '@amiexpress/bbs-door-sdk/petscii/frame';

const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** The named bindings of every `import`/`export ... from '<module>'` in `src`. */
function namesImportedFrom(src: string, moduleSuffix: string): string[] {
  const names: string[] = [];
  const re = /(?:import|export)\s*\{([^}]*)\}\s*from\s*'([^']+)'/g;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    if (!m[2].endsWith(moduleSuffix)) continue;
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (name) names.push(name);
    }
  }
  return names;
}

describe('the 80-column path takes only the frozen detectors out of the frame module', () => {
  it('ascii-art.util.ts re-exports exactly the two frozen names', () => {
    const src = read('utils/ascii-art.util.ts');
    expect(namesImportedFrom(src, FRAME_MODULE).sort()).toEqual([...FROZEN].sort());
    // ...and reaches the frame module exactly once, so there is one seam to audit.
    expect(src.split(FRAME_MODULE).length - 1).toBe(1);
  });

  it.each([
    'amiga-emulation/xim/io.ts',        // the line-wrap safety net: the hottest 80-column caller
    'utils/wrap-for-session.util.ts',   // session-width prose wrap
    'utils/dir-file.util.ts',           // DIR listings
  ])('%s imports only frozen names, and never the frame module directly', (rel) => {
    const src = read(rel);
    expect(src).not.toContain(FRAME_MODULE);
    const taken = namesImportedFrom(src, 'ascii-art.util');
    expect(taken.length).toBeGreaterThan(0);
    expect(taken.filter((n) => !FROZEN.includes(n))).toEqual([]);
  });

  it('no 80-column file names a ladder symbol at all', () => {
    const ladder = ['classifyRow', 'chooseRule', 'adaptRows', 'adaptFrame', 'applyRule', 'narrowRow', 'deindentRow', 'isRuleRow', 'columnParts', 'columnSpans', 'hasColumnStructure', 'hasTabularGutters'];
    for (const rel of ['utils/ascii-art.util.ts', 'amiga-emulation/xim/io.ts', 'utils/wrap-for-session.util.ts', 'utils/dir-file.util.ts']) {
      const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // comments may discuss them
      expect({ rel, used: ladder.filter((n) => code.includes(n)) }).toEqual({ rel, used: [] });
    }
  });
});
