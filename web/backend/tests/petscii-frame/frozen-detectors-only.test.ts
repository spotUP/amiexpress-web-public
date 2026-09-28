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
 *
 * The seam itself is checked at RUNTIME: every value ascii-art.util.ts exports
 * that is the frame module's own object must be one of the frozen two. The
 * rest are import-graph ABSENCE checks (REASONABLE: an import that must not
 * exist is invisible at runtime), read from the files on the 80-column path.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as asciiArtUtil from '../../src/utils/ascii-art.util';
import * as frameModule from '@amiexpress/bbs-door-sdk/petscii/frame';

const SRC = path.resolve(__dirname, '../../src');
const FROZEN = ['looksLikeAsciiArt', 'positionsCursorAbsolutely'];
const FRAME_MODULE = '@amiexpress/bbs-door-sdk/petscii/frame';

const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/**
 * The named bindings of every `import`/`export ... from '<module>'` in `src`
 * (`moduleSuffix` '' = from any module).
 */
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
  it('ascii-art.util.ts hands the 80-column path exactly the two frozen detectors', () => {
    // Runtime identity, whatever the import/export syntax: which of the
    // seam's exports ARE the frame module's objects.
    const frameValues = new Map<unknown, string>(
      Object.entries(frameModule).map(([name, value]) => [value, name]),
    );
    const fromFrame = Object.entries(asciiArtUtil)
      .filter(([, value]) => frameValues.has(value))
      .map(([name]) => name)
      .sort();
    expect(fromFrame).toEqual([...FROZEN].sort());
    for (const name of FROZEN) {
      expect((asciiArtUtil as Record<string, unknown>)[name]).toBe((frameModule as Record<string, unknown>)[name]);
    }
  });

  it.each([
    // The line-wrap safety net - the hottest 80-column caller. It lived in
    // `xim/io.ts` until 8d987590b moved the row loop out to its own module so
    // a paused file could hand back the lines it had not sent; the detectors
    // went with the loop, and this is where they are called from now.
    'amiga-emulation/xim/io-emit-lines.ts',
    'utils/wrap-for-session.util.ts',   // session-width prose wrap
    'utils/dir-file.util.ts',           // DIR listings
  ])('%s imports only frozen names, and never the frame module directly', (rel) => {
    const src = read(rel);
    expect(src).not.toContain(FRAME_MODULE);
    const taken = namesImportedFrom(src, 'ascii-art.util');
    expect(taken.filter((n) => !FROZEN.includes(n))).toEqual([]);
  });

  it.each([
    'amiga-emulation/xim/io.ts',
    'amiga-emulation/xim/io-emit-lines.ts',
    'utils/wrap-for-session.util.ts',
    'utils/dir-file.util.ts',
  ])('%s never reaches the frame module directly', (rel) => {
    // Asked of `io.ts` too, which no longer calls the detectors itself: the
    // seam it must not open is the frame module, whether or not it wraps.
    expect(read(rel)).not.toContain(FRAME_MODULE);
  });

  it('no 80-column file imports a ladder symbol from anywhere', () => {
    // Import bindings, from any module - not substrings of the code, so a
    // local name or a string that happens to match is not a use.
    const ladder = ['classifyRow', 'chooseRule', 'adaptRows', 'adaptFrame', 'applyRule', 'narrowRow', 'deindentRow', 'isRuleRow', 'columnParts', 'columnSpans', 'hasColumnStructure', 'hasTabularGutters'];
    for (const rel of ['utils/ascii-art.util.ts', 'amiga-emulation/xim/io.ts', 'amiga-emulation/xim/io-emit-lines.ts', 'utils/wrap-for-session.util.ts', 'utils/dir-file.util.ts']) {
      const imported = namesImportedFrom(read(rel), '');
      expect({ rel, used: ladder.filter((n) => imported.includes(n)) }).toEqual({ rel, used: [] });
    }
  });
});
