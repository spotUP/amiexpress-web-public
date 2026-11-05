import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { NAV_GROUPS, NAV_ITEMS, groupForPath, navItemForPath } from '../src/components/AppShell/nav-config';
import { LEGACY_ROUTES } from '../src/routes/legacy-routes';
import { WORKSPACE_TABS } from '../src/pages/workspaces';

/**
 * Several admin pages are the only route to a piece of BBS configuration -
 * Access Levels is the only editor of Access/ACS.<level>.info, Batch Editor
 * the only editor of batch*.info, File Areas the only editor of DLPATH.n and
 * ULPATH.n. A sidebar entry pointing at a path with no route, or a route with
 * no way to reach it, takes a capability away silently. InfoEditorPage was
 * exactly that: 351 lines, imported by nothing, for however long.
 *
 * These read App.tsx as text rather than rendering the router, because what
 * is being asserted is the table itself.
 */

const APP_SOURCE = readFileSync(resolve(__dirname, '..', 'src', 'App.tsx'), 'utf8');

const ROUTE_PATHS = new Set(
  [...APP_SOURCE.matchAll(/<Route\s+path="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => !path.startsWith('/') && path !== '*')
);

const LEGACY_FROM = new Set(LEGACY_ROUTES.map((route) => route.from));

describe('navigation and routes', () => {
  it('routes every destination in the sidebar', () => {
    const unreachable = NAV_ITEMS
      // The Overview is the index route, which carries no path attribute.
      .filter((item) => item.path !== '')
      .filter((item) => !ROUTE_PATHS.has(item.path))
      .map((item) => `${item.label} -> ${item.path}`);

    expect(unreachable, `Sidebar entries with no route: ${unreachable.join(', ')}`).toEqual([]);
  });

  it('puts every route in the sidebar, unless it is a legacy redirect', () => {
    const navPaths = new Set(NAV_ITEMS.map((item) => item.path));
    const orphaned = [...ROUTE_PATHS].filter((path) => !navPaths.has(path) && !LEGACY_FROM.has(path));

    expect(orphaned, `Routes with no way to reach them: ${orphaned.join(', ')}`).toEqual([]);
  });

  it('names each destination once', () => {
    const paths = NAV_ITEMS.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('resolves a pathname back to its item and group', () => {
    expect(navItemForPath('/admin/doors')?.label).toBe('Doors');
    expect(navItemForPath('/admin')?.label).toBe('Overview');
    expect(navItemForPath('/admin/')?.label).toBe('Overview');
    expect(groupForPath('/admin/doors')?.title).toBe('Content');
    expect(navItemForPath('/admin/not-a-page')).toBeUndefined();
  });

  it('collapses only the group that is read rather than worked in', () => {
    const collapsed = NAV_GROUPS.filter((group) => group.collapsedByDefault).map((group) => group.title);
    expect(collapsed).toEqual(['Diagnostics']);
  });
});

describe('legacy paths', () => {
  it('renders a redirect for every entry in the table', () => {
    // The redirects are generated from LEGACY_ROUTES rather than written out
    // one by one, so what has to be asserted is that App.tsx still maps the
    // table into routes. Drop that line and every folded path 404s.
    expect(APP_SOURCE).toContain('LEGACY_ROUTES.map(');
    expect(APP_SOURCE).toMatch(/<Navigate\s+to=\{`\/admin\/\$\{route\.to\}`\}\s+replace\s*\/>/);
    expect(LEGACY_ROUTES.length).toBeGreaterThan(0);
  });

  it('sends each one to a destination that exists, carrying its tab', () => {
    const navPaths = new Set(NAV_ITEMS.map((item) => item.path));

    for (const route of LEGACY_ROUTES) {
      const [target, query] = route.to.split('?');
      expect(navPaths.has(target), `${route.from} redirects to ${target}, which is not a destination`).toBe(true);

      // A tabbed destination has to say WHICH tab, or the bookmark lands on
      // the default one and the capability looks missing. A destination with
      // no tabs takes no tab parameter - the same rule the next test states.
      // Global Wall was the first redirect to land on one, and this asserted
      // a tab unconditionally.
      if (!WORKSPACE_TABS[target]) {
        expect(query, `${target} has no tabs, so ${route.from} must not name one`).toBeUndefined();
        continue;
      }
      expect(query, `${route.from} must name the tab that carries "${route.capability}"`).toMatch(/^tab=[a-z-]+$/);
    }
  });

  it('names a tab that the destination actually has', () => {
    // Collapsing two tabs into one used to be invisible here: the redirects
    // that named them kept pointing at ids that were gone, and a sysop
    // following an old bookmark landed on the default tab with nothing
    // saying the thing they wanted had moved.
    for (const route of LEGACY_ROUTES) {
      const [target, query] = route.to.split('?');
      const tabs = WORKSPACE_TABS[target];
      if (!tabs) continue; // A destination with no tabs takes no tab parameter.

      const tab = query.replace('tab=', '');
      expect(
        tabs,
        `${route.from} redirects to ${target}?${query}, but that destination has no "${tab}" tab`
      ).toContain(tab);
    }
  });

  it('never redirects a path onto itself', () => {
    for (const route of LEGACY_ROUTES) {
      expect(route.to.split('?')[0]).not.toBe(route.from);
    }
  });

  it('keeps the capabilities that have no second route to them', () => {
    // Each of these is the only editor of the file it names. A merge that
    // dropped one would be silent: the page still exists, nothing links to it.
    const capabilities = LEGACY_ROUTES.map((route) => route.capability).join(' | ');

    expect(capabilities).toContain('DLPATH.n');
    expect(capabilities).toContain('batch*.info');
    expect(capabilities).toContain('Comment, add and remove a tooltype');
    expect(capabilities).toContain('ComputerList.info');
  });
});

/**
 * A PAGE NOBODY IMPORTS IS A PAGE NOBODY CAN OPEN.
 *
 * The two tests above check the sidebar against the route table, so they pass
 * happily while a finished page sits in neither. That is not hypothetical: the
 * sysop asked for an editor for the login flow, it was built with its own
 * backend routes and three test files, and it was never routed - "we added a
 * startup scrips/bulls manager to the admin ui where i can edit the login flow
 * but i cant find it can you?" (2026-09-16). The comment at the top of this
 * file says InfoEditorPage was the same, 351 lines, imported by nothing.
 *
 * Tests do not count as an importer. They are exactly what makes such a page
 * look alive.
 */
describe('pages that exist but nobody can reach', () => {
  it('is imported by something other than its own tests', () => {
    const { readdirSync, statSync } = require('fs') as typeof import('fs');
    const pagesDir = resolve(__dirname, '..', 'src', 'pages');
    const srcDir = resolve(__dirname, '..', 'src');

    /** Every .tsx under src, except the tests - what a user can actually reach through. */
    const sourceFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = resolve(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === 'test' || entry === 'node_modules') continue;
          walk(full);
          continue;
        }
        if (entry.endsWith('.tsx') || entry.endsWith('.ts')) sourceFiles.push(full);
      }
    };
    walk(srcDir);
    const sources = sourceFiles.map((file) => ({ file, text: readFileSync(file, 'utf8') }));

    const orphans = readdirSync(pagesDir)
      .filter((name) => name.endsWith('Page.tsx'))
      .map((name) => name.replace(/\.tsx$/, ''))
      .filter((page) => !sources.some(({ file, text }) =>
        !file.endsWith(`pages/${page}.tsx`) && text.includes(`/${page}'`)
      ));

    expect(
      orphans,
      `Pages imported by nothing but their tests: ${orphans.join(', ')}`
    ).toEqual([]);
  });
});
