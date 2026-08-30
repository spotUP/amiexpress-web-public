import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { NAV_GROUPS, NAV_ITEMS, groupForPath, navItemForPath } from '../components/AppShell/nav-config';
import { LEGACY_ROUTES } from '../routes/legacy-routes';
import { WORKSPACE_TABS } from '../pages/workspaces';

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

const APP_SOURCE = readFileSync(resolve(__dirname, '..', 'App.tsx'), 'utf8');

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
