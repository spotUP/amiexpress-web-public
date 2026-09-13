/**
 * Every `import` condition in package.json must point at a file the ESM
 * build actually emits.
 *
 * This has now shipped broken four times - arcade, cell-art, theme and
 * teletext - always the same way: a subpath is added to `exports` with an
 * `import` condition under ./dist-esm/, and tsconfig.client.json's `include`
 * list is not extended, so the CJS `require` path works and the ESM one
 * resolves a file that has never existed. Doors are loaded as ESM, so it
 * surfaces only when a door actually imports that subpath.
 *
 * The comments in tsconfig.client.json explain the trap three separate
 * times; a comment is not a check, so this is the check. It runs against
 * the built dist-esm, which is what CI and the Dockerfile produce.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

function importTargets(): Array<{ subpath: string; file: string }> {
  const out: Array<{ subpath: string; file: string }> = [];
  for (const [subpath, value] of Object.entries(pkg.exports ?? {})) {
    if (!value || typeof value !== 'object') continue;
    const target = (value as Record<string, string>).import;
    if (typeof target === 'string' && target.startsWith('./dist-esm/')) {
      out.push({ subpath, file: path.join(ROOT, target) });
    }
  }
  return out;
}

const built = fs.existsSync(path.join(ROOT, 'dist-esm'));
const describeBuilt = built ? describe : describe.skip;

describeBuilt('package exports: every ESM condition resolves', () => {
  it('names at least the subpaths that have broken before', () => {
    const subpaths = importTargets().map((t) => t.subpath);
    expect(subpaths).toEqual(expect.arrayContaining(['./teletext']));
  });

  it('emits a file for every import condition', () => {
    const missing = importTargets()
      .filter((t) => !fs.existsSync(t.file))
      .map((t) => `${t.subpath} -> ${path.relative(ROOT, t.file)}`);
    expect(missing.join('\n')).toBe('');
  });
});
