/**
 * The admin's out-of-tree imports must exist in the image that builds it.
 *
 * `web/config-app` imports the SDK's ANSI editor core and two backend modules
 * from SOURCE, through aliases in vite.config.ts. On a developer's machine
 * those paths sit above the app and everything builds; the Dockerfile's
 * config-builder stage copied only `web/config-app`, so the deploy failed with
 *
 *   [vite:load-fallback] Could not load
 *   /app/sdk/engines/ui/ansi-editor/core/file-ops
 *
 * after a green local build and a green test suite. Nothing in the repo
 * connected the aliases to the stage that has to satisfy them. This does.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..', '..');
const CONFIG_APP = path.join(REPO, 'web', 'config-app', 'src');

/** Every path the config-builder stage copies into the image, repo-relative. */
function stageCopies(): string[] {
  const dockerfile = fs.readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');
  const start = dockerfile.search(/^FROM \S+ AS config-builder$/m);
  const end = dockerfile.indexOf('FROM ', start + 1);
  expect(start).toBeGreaterThan(-1);

  return dockerfile.slice(start, end === -1 ? undefined : end)
    .split('\n')
    .filter(line => line.startsWith('COPY '))
    .map((line) => {
      const parts = line.split(/\s+/);
      // `COPY <src> <dst>` names the repo path directly. `COPY --from=<stage>
      // /app/<path> <dst>` copies a path an earlier stage BUILT - the terminal
      // package arrives that way, source and dist together - so the repo path
      // it satisfies is what follows /app/.
      if (parts[1]?.startsWith('--from=')) {
        const src = parts[2] ?? '';
        return src.startsWith('/app/') ? src.slice('/app/'.length) : undefined;
      }
      return parts[1];
    })
    .filter((src): src is string => src !== undefined);
}

/** The alias targets vite resolves, as repo-relative paths. */
function aliasTargets(): Record<string, string> {
  const vite = fs.readFileSync(path.join(REPO, 'web', 'config-app', 'vite.config.ts'), 'utf8');
  const targets: Record<string, string> = {};

  for (const m of vite.matchAll(/'(@[^']+)':\s*path\.resolve\(\s*__dirname,\s*'([^']+)'/g)) {
    targets[m[1]] = path.posix.normalize(path.posix.join('web/config-app', m[2]));
  }
  return targets;
}

/** Which aliases the admin's source actually imports. */
function importedAliases(): Set<string> {
  const used = new Set<string>();

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        for (const m of fs.readFileSync(full, 'utf8').matchAll(/from '(@[^']+)'/g)) {
          used.add(m[1]);
        }
      }
    }
  };

  walk(CONFIG_APP);
  return used;
}

it('copies every source directory the admin imports through an alias', () => {
  const copies = stageCopies();
  const targets = aliasTargets();
  const imported = importedAliases();

  // '@' is the app's own src, and '@amiexpress/terminal' is an npm dependency;
  // neither is a path outside the app.
  const outOfTree = [...imported].filter(name =>
    Object.keys(targets).some(alias => name === alias || name.startsWith(`${alias}/`)));

  expect(outOfTree.length).toBeGreaterThan(0);

  for (const name of outOfTree) {
    const alias = Object.keys(targets)
      .filter(a => name === a || name.startsWith(`${a}/`))
      .sort((a, b) => b.length - a.length)[0];
    const target = targets[alias];

    const covered = copies.some(src => target === src || target.startsWith(`${src}/`));
    expect(covered).toBe(true);
  }
});

/**
 * The OTHER way an admin import escapes this stage, and the one that took the
 * deploy down a second time on 2026-09-07: a workspace package imported by
 * NAME. `@amiexpress/terminal` is a `file:../../packages/terminal` dependency,
 * so npm links it out of the repo and `npm ci` inside a stage that never
 * copied it leaves the bundler with nothing to resolve ("Rollup failed to
 * resolve import @amiexpress/terminal"). An alias is not involved, so the case
 * above cannot see it.
 */
it('copies every file: workspace package the admin imports by name', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO, 'web', 'config-app', 'package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const copies = stageCopies();
  const imported = importedAliases();

  const local = Object.entries(deps)
    .filter(([, spec]) => spec.startsWith('file:'))
    .filter(([name]) => [...imported].some(u => u === name || u.startsWith(`${name}/`)))
    .map(([name, spec]) => ({
      name,
      // `file:../../packages/terminal`, relative to web/config-app.
      target: path.posix.normalize(
        path.posix.join('web/config-app', spec.slice('file:'.length)),
      ),
    }));

  expect(local.length).toBeGreaterThan(0);

  for (const { name, target } of local) {
    const covered = copies.some(src => target === src || target.startsWith(`${src}/`));
    expect({ name, covered }).toEqual({ name, covered: true });
  }
});

it('names the stage that has to satisfy them, so the reason survives', () => {
  const dockerfile = fs.readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');

  expect(dockerfile).toContain('sdk/engines/ui/ansi-editor');
  expect(dockerfile).toContain('web/backend/src/screens');
});

/**
 * The backend stage needs the SDK too, for the same reason.
 *
 * Its SDK usages were runtime `require()` calls, which tsc never resolves - so
 * the stage built fine without the SDK anywhere near it. The PETSCII work
 * added static imports, which ARE typechecked, and the deploy died with
 * "Cannot find module '@amiexpress/bbs-door-sdk/petscii'" while every local
 * build stayed green, because on a developer's machine ../../sdk is just
 * there.
 */
describe('the backend image stage', () => {
  const backendSources = (dir: string): string[] => {
    const out: string[] = [];
    const walk = (current: string) => {
      for (const entry of require('fs').readdirSync(current, { withFileTypes: true })) {
        const full = require('path').join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.ts$/.test(entry.name)) out.push(full);
      }
    };
    walk(dir);
    return out;
  };

  it('carries the SDK whenever the backend imports it statically', () => {
    const src = path.join(REPO, 'web', 'backend', 'src');
    const staticImport = /^\s*import\s[^;]*from\s+'@amiexpress\/bbs-door-sdk[^']*'/m;

    const importers = backendSources(src)
      .filter(file => staticImport.test(fs.readFileSync(file, 'utf8')))
      .map(file => file.slice(REPO.length + 1));

    if (importers.length === 0) return;

    const dockerfile = fs.readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');
    const stage = dockerfile.slice(dockerfile.search(/^FROM \S+ AS backend-builder$/m));
    // Anchor on the RUN line: the words "npm ci" also appear in the comment
    // that explains why the copy has to come first.
    const beforeInstall = stage.slice(0, stage.indexOf('RUN npm ci'));

    // jest's expect takes one argument, unlike vitest's - the explanation goes
    // in the assertion itself.
    const copied = /COPY --from=sdk-builder \/app\/sdk/.test(beforeInstall);
    expect({ copied, importers }).toEqual({ copied: true, importers });
  });
});

/**
 * The same rule, one level down: a package the stage COPIES may itself import
 * something by name, and that import has to resolve too.
 *
 * `packages/terminal` arrives built, and its dist imports
 * `@amiexpress/bbs-door-sdk/petscii` - the PETSCII machine the admin's preview
 * renders through. The admin never names it, so the check above (which reads
 * only the admin's own sources) passed, and the deploy died in the
 * config-builder stage with
 *
 *   [vite]: Rollup failed to resolve import "@amiexpress/bbs-door-sdk/petscii"
 *           from "/app/packages/terminal/dist/index.js"
 *
 * after a green local build - locally the SDK resolves through node_modules,
 * which that stage does not have.
 */
describe('what the copied packages import, by name', () => {
  const BARE = /from\s+['"](@amiexpress\/[^'"]+)['"]/g;

  function bareImportsOf(dir: string): string[] {
    const out = new Set<string>();
    const walk = (d: string) => {
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(full); continue; }
        if (!/\.(js|mjs|ts)$/.test(e.name) || e.name.endsWith('.d.ts')) continue;
        const text = fs.readFileSync(full, 'utf8');
        for (const m of text.matchAll(BARE)) out.add(m[1]);
      }
    };
    walk(dir);
    return [...out];
  }

  it('is satisfied by a copy or an alias, for every package the stage copies', () => {
    const copies = stageCopies();
    const viteConfig = fs.readFileSync(
      path.join(REPO, 'web', 'config-app', 'vite.config.ts'), 'utf8'
    );

    const terminalDist = path.join(REPO, 'packages', 'terminal', 'dist');
    if (!fs.existsSync(terminalDist)) return; // not built here; CI builds it

    const unresolved = bareImportsOf(terminalDist).filter(spec => {
      if (spec.startsWith('@amiexpress/terminal')) return false;  // itself
      const aliased = viteConfig.includes(`'${spec}'`);
      // An alias points at a repo path; that path must ALSO be copied.
      const target = /@amiexpress\/bbs-door-sdk\/(.+)/.exec(spec)?.[1];
      const copied = target ? copies.some(c => c === `sdk/${target}` || c.startsWith(`sdk/${target}/`)) : false;
      return !(aliased && copied);
    });

    expect(unresolved).toEqual([]);
  });
});


/**
 * A stylesheet escapes the stage too, and vite does not fail when it does.
 *
 * The teletext editor's font is `url('../../frontend/public/fonts/...')` in
 * the admin's index.css. In a stage without that file vite keeps the url as
 * written, the built CSS asks for /frontend/public/fonts/TeletextUPR.woff2,
 * the server answers 404, and the canvas draws every mosaic glyph in a
 * fallback face: blocks with gaps, edges that wander. The build stays green,
 * so only this test connects the url to the copy that has to satisfy it.
 */
it('copies every file a stylesheet reaches outside the app', () => {
  const copies = stageCopies();
  const escapes: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.css')) continue;
      for (const m of fs.readFileSync(full, 'utf8').matchAll(/url\(\s*['"]?(\.[^'")]+)['"]?\s*\)/g)) {
        const target = path.relative(REPO, path.resolve(path.dirname(full), m[1])).split(path.sep).join('/');
        if (!target.startsWith('web/config-app/')) escapes.push(target);
      }
    }
  };
  walk(CONFIG_APP);

  expect(escapes).toContain('web/frontend/public/fonts/TeletextUPR.woff2');
  const uncopied = escapes.filter(target =>
    !copies.some(src => target === src || target.startsWith(`${src}/`)));
  expect(uncopied).toEqual([]);
});
