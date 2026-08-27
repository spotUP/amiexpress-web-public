import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { NAV_GROUPS, NAV_ITEMS, groupForPath, navItemForPath } from '../components/AppShell/nav-config';

/**
 * Several admin pages are the only route to a piece of BBS configuration -
 * Access Levels is the only editor of Access/ACS.<level>.info, Batch Editor
 * the only editor of batch*.info. A sidebar entry pointing at a path with no
 * route, or a route with no way to reach it, takes a capability away silently.
 * InfoEditorPage is exactly that failure: 351 lines, imported by nothing.
 */

const APP_SOURCE = readFileSync(resolve(__dirname, '..', 'App.tsx'), 'utf8');

const ROUTE_PATHS = new Set(
  [...APP_SOURCE.matchAll(/<Route\s+path="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => !path.startsWith('/') && path !== '*')
);

describe('navigation and routes', () => {
  it('routes every destination in the sidebar', () => {
    const unreachable = NAV_ITEMS
      // The Overview is the index route, which carries no path attribute.
      .filter((item) => item.path !== '')
      .filter((item) => !ROUTE_PATHS.has(item.path))
      .map((item) => `${item.label} -> ${item.path}`);

    expect(unreachable, `Sidebar entries with no route: ${unreachable.join(', ')}`).toEqual([]);
  });

  it('puts every route in the sidebar', () => {
    const navPaths = new Set(NAV_ITEMS.map((item) => item.path));
    const orphaned = [...ROUTE_PATHS].filter((path) => !navPaths.has(path));

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

  it('collapses only the groups that are read rather than worked in', () => {
    const collapsed = NAV_GROUPS.filter((group) => group.collapsedByDefault).map((group) => group.title);
    expect(collapsed).toEqual(['Lookup Tables', 'Diagnostics']);
  });
});
