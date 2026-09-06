/**
 * The sidebar search field.
 *
 * 21 destinations across 7 groups is already too many to scan, and four of
 * them are merges - Nodes, Conferences, Configuration Files and Lookup
 * Tables absorbed other pages behind tabs (nav-config.ts's header, and
 * routes/legacy-routes.ts for exactly what each one used to be called).
 * Matching only the visible label would miss exactly the case that matters:
 * a sysop hunting "file areas" or "tooltypes" by the old name.
 *
 * filterNavGroups is tested as a pure function over the real NAV_GROUPS data,
 * which also proves the keywords assigned to the merged destinations actually
 * work. The two behaviours that live in Sidebar's own state - a
 * collapsedByDefault group opening while a query is active, and the field
 * clearing back to the untouched sidebar - get one small render test each.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  NAV_GROUPS,
  navItemsForLevel,
  filterNavGroups,
  navItemMatchesQuery,
} from '../components/AppShell/nav-config';

function labelsOf(groups: ReturnType<typeof filterNavGroups>): string[] {
  return groups.flatMap((group) => group.items.map((item) => item.label));
}

describe('filterNavGroups', () => {
  it('matches a label', () => {
    const result = filterNavGroups(NAV_GROUPS, 'Access Levels');
    expect(labelsOf(result)).toEqual(['Access Levels']);
  });

  it('matches case-insensitively as a substring, not a whole word', () => {
    const result = filterNavGroups(NAV_GROUPS, 'door');
    expect(labelsOf(result)).toContain('Doors');
  });

  it('finds Conferences by the keyword "file areas", which the label does not contain', () => {
    const result = filterNavGroups(NAV_GROUPS, 'file areas');
    expect(labelsOf(result)).toEqual(['Conferences']);
  });

  it('finds Configuration Files by "tooltypes", one of the four editors it absorbed', () => {
    const result = filterNavGroups(NAV_GROUPS, 'tooltypes');
    expect(labelsOf(result)).toEqual(['Configuration Files']);
  });

  it('finds Lookup Tables by "computers", one of the five lists it absorbed', () => {
    const result = filterNavGroups(NAV_GROUPS, 'computers');
    expect(labelsOf(result)).toEqual(['Lookup Tables']);
  });

  it('finds Nodes by "node control", the page it absorbed', () => {
    const result = filterNavGroups(NAV_GROUPS, 'node control');
    expect(labelsOf(result)).toEqual(['Nodes']);
  });

  it('drops a group entirely when none of its items match', () => {
    const result = filterNavGroups(NAV_GROUPS, 'file areas');
    const titles = result.map((group) => group.title);
    // Only Content (which holds Conferences) should survive.
    expect(titles).toEqual(['Content']);
  });

  it('reveals a match inside the Diagnostics group, which is collapsed by default', () => {
    // "replay" is unique to Session Logs's description.
    const result = filterNavGroups(NAV_GROUPS, 'replay');
    expect(labelsOf(result)).toEqual(['Session Logs']);
    const diagnostics = result.find((group) => group.title === 'Diagnostics');
    expect(diagnostics?.collapsedByDefault).toBe(true);
    expect(diagnostics?.items.map((i) => i.label)).toEqual(['Session Logs']);
  });

  it('never surfaces an item above the caller-supplied level, because filtering runs on already-gated groups', () => {
    // Screen Files (minLevel 100) matches "screen"; so does Screen Types
    // vocabulary on Lookup Tables (minLevel 255). A level-100 user must see
    // only the level-100 destination.
    const gated = navItemsForLevel(100);
    const result = filterNavGroups(gated, 'screen');

    expect(labelsOf(result)).toEqual(['Screen Files']);
    expect(labelsOf(result)).not.toContain('Lookup Tables');
  });

  it('restores the original groups on an empty query', () => {
    expect(filterNavGroups(NAV_GROUPS, '')).toEqual(NAV_GROUPS);
    expect(filterNavGroups(NAV_GROUPS, '   ')).toEqual(NAV_GROUPS);
  });
});

describe('navItemMatchesQuery', () => {
  const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.path === 'conferences')!;

  it('matches label, description and keywords case-insensitively', () => {
    expect(navItemMatchesQuery(item, 'CONFERENCES')).toBe(true);
    expect(navItemMatchesQuery(item, 'message areas')).toBe(true);
    expect(navItemMatchesQuery(item, 'DLPATH')).toBe(true);
  });

  it('rejects a query matching nothing', () => {
    expect(navItemMatchesQuery(item, 'sprite manager')).toBe(false);
  });
});

// Sidebar renders behind auth + router context; the auth half is mocked so
// the test drives only the behaviour this feature adds.
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'sysop', secLevel: 255 },
    adminPerms: undefined,
    logout: vi.fn(),
  }),
}));

async function renderSidebar() {
  const { Sidebar } = await import('../components/AppShell/Sidebar');
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Sidebar />
    </MemoryRouter>
  );
}

describe('Sidebar search field', () => {
  it('expands the collapsed Diagnostics group while a filter matches inside it', async () => {
    const user = userEvent.setup();
    await renderSidebar();

    expect(screen.queryByText('Session Logs')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Filter admin navigation'), 'replay');

    expect(screen.getByText('Session Logs')).toBeInTheDocument();
  });

  it('restores the untouched sidebar, collapsed groups included, once the field is cleared', async () => {
    const user = userEvent.setup();
    await renderSidebar();

    const input = screen.getByLabelText('Filter admin navigation');
    await user.type(input, 'replay');
    expect(screen.getByText('Session Logs')).toBeInTheDocument();

    await user.clear(input);

    expect(screen.queryByText('Session Logs')).not.toBeInTheDocument();
    // The rest of the always-open sidebar is still there.
    expect(screen.getByText('Doors')).toBeInTheDocument();
  });

  it('clears on Escape', async () => {
    const user = userEvent.setup();
    await renderSidebar();

    const input = screen.getByLabelText('Filter admin navigation') as HTMLInputElement;
    await user.type(input, 'replay');
    expect(input.value).toBe('replay');

    await user.keyboard('{Escape}');

    expect(input.value).toBe('');
  });

  it('says so, in one line, when nothing matches', async () => {
    const user = userEvent.setup();
    await renderSidebar();

    await user.type(screen.getByLabelText('Filter admin navigation'), 'xyzzy-not-a-destination');

    expect(screen.getByText(/No destinations match/)).toBeInTheDocument();
  });
});
