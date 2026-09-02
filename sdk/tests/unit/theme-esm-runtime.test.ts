/**
 * The ESM build is loaded AS ESM by every loader, not only by a Node whose
 * syntax detection happens to be on.
 *
 * `dist-esm/*.js` sits under a package.json with no "type", so its format
 * is ambiguous. Node 22.7+ sniffs the syntax and reparses; Node 20 (the
 * Docker image) and tsx (the dev backend, which imports TS doors in-process)
 * do not, and read the barrel as CommonJS - so an esbuild/ESM door with the
 * SDK external got:
 *
 *   The requested module '@amiexpress/bbs-door-sdk/engines/ui/theme' does
 *   not provide an export named 'themeById'
 *
 * theme-esm-resolvable.test.ts pins the SOURCE (relative imports carry an
 * extension); that is a pin, not a proof. This test loads the built barrel
 * through a real Node ESM loader with detection OFF - the loader shape tsx
 * and Node 20 give a door - and asks for the export. It needs a built
 * `dist-esm`, as every SDK suite needs `dist`.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

const DIST_ESM = path.resolve(__dirname, '../../dist-esm');
const BARREL = path.join(DIST_ESM, 'engines/ui/theme/index.js');

function importAsEsmWithoutDetection(specifier: string, name: string): { status: number | null; out: string } {
  const script = `import { ${name} } from ${JSON.stringify(specifier)}; process.stdout.write(typeof ${name});`;
  const r = spawnSync(process.execPath, ['--no-experimental-detect-module', '--input-type=module', '-e', script], {
    encoding: 'utf-8',
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

describe('the ESM build declares its own module format', () => {
  it('dist-esm carries a package.json that says "type": "module"', () => {
    const marker = path.join(DIST_ESM, 'package.json');
    expect(fs.existsSync(marker)).toBe(true);
    expect(JSON.parse(fs.readFileSync(marker, 'utf-8')).type).toBe('module');
  });

  it('a loader with syntax detection off still gets themeById from the theme barrel', () => {
    expect(fs.existsSync(BARREL)).toBe(true);
    const r = importAsEsmWithoutDetection(pathToFileURL(BARREL).href, 'themeById');
    expect(r.out).toContain('function');
    expect(r.status).toBe(0);
  });
});
