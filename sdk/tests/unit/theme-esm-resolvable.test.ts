/**
 * The theme barrel must be importable as ESM, not only as CommonJS.
 *
 * Doors are built both ways. A tsc/CommonJS door requires the SDK and
 * extensionless re-exports resolve fine; an esbuild/ESM door with the SDK
 * marked external has Node resolve it at runtime, and Node's ESM loader
 * does NOT guess file extensions. So this shipped:
 *
 *   Error executing door: The requested module
 *   '@amiexpress/bbs-door-sdk/engines/ui/theme' does not provide an export
 *   named 'themeById'
 *
 * BUGS was dead on arrival and the CommonJS doors were all fine, which is
 * exactly the sort of split a unit test never notices - the suite runs
 * through ts-jest, which resolves like CommonJS.
 */

import * as fs from 'fs';
import * as path from 'path';

const THEME_DIR = path.resolve(__dirname, '../../engines/ui/theme');

describe('the theme barrel is ESM-resolvable', () => {
  const files = fs.readdirSync(THEME_DIR).filter(f => f.endsWith('.ts'));

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  for (const file of files) {
    it(`${file} gives every relative import a file extension`, () => {
      const src = fs.readFileSync(path.join(THEME_DIR, file), 'utf-8');
      const bare: string[] = [];
      // A relative specifier with no extension. Node ESM cannot resolve it.
      for (const m of src.matchAll(/from\s+'(\.\/[^']*)'/g)) {
        if (!m[1].endsWith('.js')) bare.push(m[1]);
      }
      expect(bare).toEqual([]);
    });
  }
});
