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
  const start = dockerfile.indexOf('FROM node:20-alpine AS config-builder');
  const end = dockerfile.indexOf('FROM ', start + 1);
  expect(start).toBeGreaterThan(-1);

  return dockerfile.slice(start, end === -1 ? undefined : end)
    .split('\n')
    .filter(line => line.startsWith('COPY ') && !line.includes('--from='))
    .map(line => line.split(/\s+/)[1])
    .filter(src => src !== undefined);
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
    const stage = dockerfile.slice(dockerfile.indexOf('FROM node:20-alpine AS backend-builder'));
    // Anchor on the RUN line: the words "npm ci" also appear in the comment
    // that explains why the copy has to come first.
    const beforeInstall = stage.slice(0, stage.indexOf('RUN npm ci'));

    // jest's expect takes one argument, unlike vitest's - the explanation goes
    // in the assertion itself.
    const copied = /COPY --from=sdk-builder \/app\/sdk/.test(beforeInstall);
    expect({ copied, importers }).toEqual({ copied: true, importers });
  });
});
