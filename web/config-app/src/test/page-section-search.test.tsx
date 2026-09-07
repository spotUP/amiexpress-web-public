/**
 * The sidebar filter finds what is INSIDE a page, not only its name.
 *
 * Reported by the sysop on 2026-09-07: "is the search on the web ui crappy? it
 * doesnt find anything when i type ftp". It was not crappy, it was
 * nav-only - 21 destinations matched by label, description and keywords - and
 * `ftp` names no destination. The four FTP fields live two thirds of the way
 * down Configuration, in a section the filter had never heard of.
 *
 * Three things are pinned here:
 *
 *  1. the match itself, through the real NAV_GROUPS and the real section table
 *  2. the drift guard - the table is read off the page's own source, so a
 *     section or a field added to `SystemConfigPage` and not to
 *     `page-sections.ts` fails here rather than going quietly unsearchable
 *  3. the result is USEFUL: it deep-links to one section, and the page shows
 *     that section alone
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { NAV_GROUPS, filterNavGroups, navItemMatchesQuery } from '../components/AppShell/nav-config';
import {
  PAGE_SECTIONS,
  SYSTEM_CONFIG_SECTIONS,
  sectionMatchesQuery,
  sectionsMatching,
} from '../components/AppShell/page-sections';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE_SOURCE = path.resolve(HERE, '..', 'pages', 'SystemConfigPage.tsx');

describe('a section is a searchable destination', () => {
  it('finds the FTP settings by the three letters the sysop typed', () => {
    const hits = sectionsMatching('system', 'ftp');

    expect(hits.map((section) => section.name)).toEqual(['FTP Server Settings']);
  });

  it('finds a section by a configuration KEY, which is what a sysop knows it by', () => {
    // Not the heading - `Mail & SMTP Settings` contains no "relay", and
    // `smtp_port` is the string in bbsConfig.info.
    expect(sectionsMatching('system', 'smtp_port').map((s) => s.name)).toEqual([
      'Mail & SMTP Settings',
    ]);
    expect(sectionsMatching('system', 'max_nodes').map((s) => s.name)).toEqual(['System Limits']);
  });

  it('finds a section by a word in neither its heading nor its keys', () => {
    expect(sectionsMatching('system', 'passive').map((s) => s.name)).toEqual([
      'FTP Server Settings',
    ]);
  });

  it('matches nothing for an empty query, so an idle sidebar is not an index', () => {
    expect(sectionsMatching('system', '')).toEqual([]);
    expect(sectionsMatching('system', '   ')).toEqual([]);
    expect(sectionMatchesQuery(SYSTEM_CONFIG_SECTIONS[0], '')).toBe(false);
  });

  it('says nothing about a page that has no sections registered', () => {
    expect(sectionsMatching('users', 'ftp')).toEqual([]);
  });
});

describe('the nav filter surfaces the page that CONTAINS the match', () => {
  it('Configuration answers "ftp" even though its label and keywords do not', () => {
    const configuration = NAV_GROUPS.flatMap((group) => group.items).find(
      (item) => item.path === 'system'
    )!;
    const ownWords = [configuration.label, configuration.description, ...(configuration.keywords ?? [])];

    // The premise: nothing the item itself says contains "ftp".
    expect(ownWords.some((text) => text?.toLowerCase().includes('ftp'))).toBe(false);

    expect(navItemMatchesQuery(configuration, 'ftp')).toBe(true);
    const paths = filterNavGroups(NAV_GROUPS, 'ftp').flatMap((group) =>
      group.items.map((item) => item.path)
    );
    expect(paths).toContain('system');
  });

  it('still returns nothing for a word that is nowhere in the admin', () => {
    expect(filterNavGroups(NAV_GROUPS, 'zzzznotathing')).toEqual([]);
  });
});

describe('the section table and the page it describes stay in step', () => {
  const source = readFileSync(PAGE_SOURCE, 'utf8');

  it('lists every section the page renders, in the order it renders them', () => {
    const rendered = [...source.matchAll(/shouldShowSection\('([^']+)'\)/g)].map((m) => m[1]);

    expect(SYSTEM_CONFIG_SECTIONS.map((section) => section.name)).toEqual(rendered);
  });

  it('lists every field each section registers', () => {
    // Walk the source once: a `shouldShowSection` opens a section, every
    // `register('key')` after it belongs to that section until the next one.
    const found = new Map<string, string[]>();
    let current: string | null = null;
    for (const line of source.split('\n')) {
      const opened = line.match(/shouldShowSection\('([^']+)'\)/);
      if (opened) {
        current = opened[1];
        found.set(current, []);
        continue;
      }
      if (!current) continue;
      for (const [, key] of line.matchAll(/register\('([a-z0-9_]+)'/g)) {
        const keys = found.get(current)!;
        if (!keys.includes(key)) keys.push(key);
      }
    }

    const table = Object.fromEntries(
      SYSTEM_CONFIG_SECTIONS.map((section) => [section.name, section.fields])
    );
    expect(table).toEqual(Object.fromEntries(found));
  });

  it('registers Configuration under the nav path the sidebar links to', () => {
    expect(PAGE_SECTIONS.system).toBe(SYSTEM_CONFIG_SECTIONS);
  });
});

/* The page under test renders forms over the API, so the network is stubbed. */
const envelope = (data: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ success: true, data, timestamp: '' }),
    text: async () => JSON.stringify({ success: true, data }),
  } as unknown as Response);

vi.stubGlobal(
  'fetch',
  vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/languages') || url.includes('/screen-types')) return envelope([]);
    if (url.includes('/config/security/levels')) return envelope({ levels: [30, 255], inUse: [], permissions: [] });
    if (url.includes('/config/system')) return envelope({ bbs_name: 'Up Rough', ftp_port: 1541 });
    return envelope({});
  })
);

// The sidebar renders behind auth + router context; only the router half
// matters here, so the auth half is stubbed.
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'sysop', secLevel: 255 },
    adminPerms: undefined,
    logout: vi.fn(),
  }),
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
    confirm: vi.fn(async () => true),
  }),
}));

import { SystemConfigPage } from '../pages/SystemConfigPage';
import { Sidebar } from '../components/AppShell/Sidebar';

function pageAt(search: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[`/admin/system${search}`]}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return render(<SystemConfigPage />, { wrapper: wrap });
}

describe('a search result opens the section it names', () => {
  it('shows that section alone, and offers the way back', async () => {
    pageAt(`?section=${encodeURIComponent('FTP Server Settings')}`);

    // By ROLE: the banner above names the section as well, and the heading is
    // the thing that proves the section itself is on screen.
    expect(
      await screen.findByRole('heading', { name: 'FTP Server Settings' })
    ).toBeInTheDocument();
    // The eighteen others are not - this is the difference between landing on
    // the section and landing at the top of the page.
    expect(screen.queryByRole('heading', { name: 'Basic Information' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mail & SMTP Settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all sections' })).toBeInTheDocument();
  });

  it('shows every section when no section is named', async () => {
    pageAt('');

    expect(await screen.findByRole('heading', { name: 'FTP Server Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Basic Information' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all sections' })).not.toBeInTheDocument();
  });
});

describe('the sidebar shows what matched inside a destination', () => {
  it('lists the section under the page, linking straight to it', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Sidebar />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Filter admin navigation'), 'ftp');

    const link = await screen.findByRole('link', { name: 'FTP Server Settings' });
    expect(link).toHaveAttribute('href', '/admin/system?section=FTP%20Server%20Settings');
  });

  it('lists nothing extra while the sidebar is idle', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.queryByText('FTP Server Settings')).not.toBeInTheDocument();
  });
});
