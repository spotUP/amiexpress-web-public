/**
 * The screens modules the admin app compiles import nothing outside screens/.
 *
 * config-app bundles four modules straight from backend/src/screens (the
 * `@bbs/screens` alias), and the Docker stage that builds it copies only that
 * folder. An import that reaches out - `../utils/screen-wipe.util` from
 * mci-catalog, 2026-09-30 - builds locally, where the whole tree is present,
 * and fails every deploy with `Could not resolve`, leaving live on the old
 * code until someone reads the host's journal.
 */
import * as fs from 'fs';
import * as path from 'path';

const SCREENS = path.resolve(__dirname, '../../src/screens');
const ADMIN_SRC = path.resolve(__dirname, '../../../config-app/src');

function adminEntryPoints(): string[] {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      for (const m of fs.readFileSync(p, 'utf8').matchAll(/['"]@bbs\/screens\/([^'"]+)['"]/g)) found.add(m[1]);
    }
  };
  walk(ADMIN_SRC);
  return [...found].map(name => path.join(SCREENS, `${name}.ts`));
}

function relativeImports(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8');
  const specs = [
    ...text.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g),
    ...text.matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g),
    ...text.matchAll(/\brequire\(\s*['"](\.[^'"]+)['"]\s*\)/g),
  ].map(m => m[1]);
  return specs.map(spec => {
    const base = path.resolve(path.dirname(file), spec);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return base;
  });
}

describe('what the admin app compiles from backend/src/screens', () => {
  it('reaches nothing outside screens/', () => {
    const entries = adminEntryPoints();
    expect(entries.length).toBeGreaterThan(0);

    const seen = new Set<string>();
    const outside: string[] = [];
    const queue = [...entries];
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const dep of relativeImports(file)) {
        if (!dep.startsWith(SCREENS + path.sep)) outside.push(`${path.relative(SCREENS, file)} -> ${path.relative(SCREENS, dep)}`);
        else queue.push(dep);
      }
    }
    expect(outside).toEqual([]);
  });
});
