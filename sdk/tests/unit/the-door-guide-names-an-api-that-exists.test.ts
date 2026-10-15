/**
 * The ANSI editor's door guide must name the editor the doors actually use.
 *
 * There are two ANSI editors in this SDK: the library under
 * `engines/ui/ansi-editor/` and the blessed widget under
 * `engines/ui/blessed/widgets/ansi-editor.ts`. All three hosting doors -
 * ANSI-EDIT, SPRITED and mail-composer - construct the WIDGET. The library's
 * own UI shell (`showANSIEditor`, its toolbar, its status bar) is hosted by
 * nothing in this repo.
 *
 * The guide's worked example told a door developer to call `showANSIEditor`,
 * through a relative `../../../../sdk/...` path that no door can resolve -
 * doors import the published package name. Someone following it wrote against
 * the editor nobody maintains, by a route that does not compile.
 *
 * So this pins the guide to reality:
 *   - every SDK import it shows resolves to a real module, and
 *   - every symbol it imports is actually exported by that module, and
 *   - it teaches the package name, never a relative climb out of Doors/.
 *
 * It is a DOC test on purpose. The guide is the only artifact here a door
 * developer reads before writing code, and nothing else in the suite looks
 * at it.
 */
import * as fs from 'fs';
import * as path from 'path';

const GUIDE = path.join(
  __dirname,
  '../../../Documentation/4-Door-Developers/ANSI_EDITOR_DOOR_GUIDE.md'
);
const SDK_ROOT = path.join(__dirname, '../..');
const PACKAGE = '@amiexpress/bbs-door-sdk';

/** Every `import { a, b } from '<spec>'` the guide shows, in order. */
function importsIn(markdown: string): Array<{ names: string[]; spec: string }> {
  const out: Array<{ names: string[]; spec: string }> = [];
  const re = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const names = m[1]
      .split(',')
      .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    out.push({ names, spec: m[2] });
  }
  return out;
}

/** The file a `@amiexpress/bbs-door-sdk/x/y` specifier names, or null. */
function resolveSdk(spec: string): string | null {
  if (!spec.startsWith(PACKAGE)) return null;
  const sub = spec.slice(PACKAGE.length).replace(/^\//, '');
  const base = sub === '' ? path.join(SDK_ROOT, 'index') : path.join(SDK_ROOT, sub);
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

describe('the ANSI editor door guide', () => {
  const guide = fs.readFileSync(GUIDE, 'utf8');

  it('exists to be read', () => {
    expect(guide.length).toBeGreaterThan(0);
  });

  it('never tells a door to climb out of its own directory into sdk/', () => {
    const climbs = importsIn(guide).filter((i) => /\.\.\/.*\bsdk\b/.test(i.spec));
    expect(climbs.map((c) => c.spec)).toEqual([]);
  });

  it('shows the widget the hosting doors actually construct', () => {
    const specs = importsIn(guide).map((i) => i.spec);
    // The barrel is what the three hosting doors import, so it is what the
    // guide should teach - not the widget's own file path.
    expect(specs).toContain(`${PACKAGE}/engines/ui/blessed`);
  });

  it('imports only symbols the named SDK module exports', () => {
    const missing: string[] = [];
    for (const { names, spec } of importsIn(guide)) {
      const file = resolveSdk(spec);
      if (spec.startsWith(PACKAGE)) {
        if (!file) {
          missing.push(`${spec} (no such module)`);
          continue;
        }
        const source = fs.readFileSync(file, 'utf8');
        for (const name of names) {
          const exported = new RegExp(
            `export\\s+(?:abstract\\s+)?(?:class|function|const|let|interface|type|enum)\\s+${name}\\b`
          ).test(source) || new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(source);
          if (!exported) missing.push(`${name} from ${spec}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
