/**
 * An artist makes a theme in every format the board serves, not just ANSI.
 *
 * A caller is served by EXTENSION - the loader looks for `<stem>.rip` on a RIP
 * terminal, `<stem>.seq` on a C64 and the text file otherwise - so a theme
 * carrying only `.txt` shows the board's own art to two thirds of the board.
 * The first cut of the studio dropped the format strip and the upload with it,
 * leaving an artist able to edit only what the browser could draw. The sysop:
 * "all artists should be able to make themes with all supported formats".
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../lib/query-client';

const art = new TextEncoder().encode('\x1b[31mHI');
const base64 = btoa(String.fromCharCode(...art));

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const writes: Array<{ url: string; body: any }> = [];
vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if ((init?.method ?? 'GET') !== 'GET') writes.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
  if (url.includes('/api/screens/file')) return envelope({ content: base64, format: 'ansi', bytes: art.length, mci: [] });
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope({});
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ArtistScreenDialog } from '../pages/ArtistScreenDialog';
import type { ScreenIndexShape } from '../pages/screen-index-view';

const theme = { slug: 'skope', title: "skope's screens", status: 'draft' as const, dir: 'Themes/skope', owner: 'skope', screens: 2, mine: true };
const mine = 'Themes/skope/Node/BBSTITLE.TXT';
const index = {
  files: {
    [mine]: { relPath: mine, theme: 'skope' },
    'Themes/skope/Node/BBSTITLE.SEQ': { relPath: 'Themes/skope/Node/BBSTITLE.SEQ', theme: 'skope' },
  },
} as unknown as ScreenIndexShape;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const open = (onOpenPath = vi.fn()) => {
  render(<ArtistScreenDialog path={mine} theme={theme} index={index} onClose={vi.fn()} onOpenPath={onOpenPath} />, { wrapper });
  return onOpenPath;
};

describe('the artist dialog keeps every tool the sysop has', () => {
  beforeEach(() => { vi.clearAllMocks(); writes.length = 0; });

  it('offers history, replacement and a way to drop their own version', async () => {
    open();

    // The things that were cut and are back: nothing here is sysop-only.
    expect(await screen.findByRole('button', { name: /History/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Upload a drawing/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Download/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Drop mine/ })).toBeTruthy();
  });

  it('asks before a drawing wipes the codes the board runs', async () => {
    const user = userEvent.setup();
    open();

    await user.upload(
      await screen.findByLabelText('Upload a drawing') as HTMLInputElement,
      new File([new Uint8Array([27, 91, 51, 49, 109])], 'title.ans'),
    );

    // Nothing is written until the artist says so.
    expect(await screen.findByRole('button', { name: 'Write it' })).toBeTruthy();
    expect(writes.filter(w => !String(w.body?.dryRun)).length).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Write it' }));
    await waitFor(() => expect(writes.some(w => w.body?.dryRun !== true)).toBe(true));
  });
});

describe('an artist with a screen open', () => {
  beforeEach(() => { vi.clearAllMocks(); writes.length = 0; });

  it('can move between the formats the screen already has', async () => {
    const user = userEvent.setup();
    const onOpenPath = open();

    const seq = await screen.findByRole('button', { name: 'PETSCII' });
    await user.click(seq);

    expect(onOpenPath).toHaveBeenCalledWith('Themes/skope/Node/BBSTITLE.SEQ');
  });

  it('is offered the format the screen is missing', async () => {
    open();

    // It has .TXT and .SEQ, so RIP is the gap.
    expect(await screen.findByRole('button', { name: /\+ RIP/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /\+ PETSCII/ })).toBeNull();
  });

  it('adds that format from a file drawn elsewhere', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: /\+ RIP/ }));

    const picker = screen.getByLabelText('Add a format') as HTMLInputElement;
    await user.upload(picker, new File([new Uint8Array([1, 2, 3])], 'title.rip'));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(writes[0].url).toContain('Themes%2Fskope%2FNode%2FBBSTITLE.rip');
  });

  it('can upload a drawing over the open screen, for artists who draw in PabloDraw', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('button', { name: 'PETSCII' });

    // The strip comes from the index and is there at once; the action row
    // waits on the file itself.
    const picker = await screen.findByLabelText('Upload a drawing');
    await user.upload(
      picker as HTMLInputElement,
      new File([new Uint8Array([27, 91, 51, 49, 109])], 'title.ans'),
    );

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(writes[0].url).toContain(encodeURIComponent(mine));
  });

  it('can take the file away to work on it, with the token a link could not carry', async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole('button', { name: /Download/ }));

    // Through the API client, so the request is authenticated - not an <a href>.
    await waitFor(() => expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
        .some(([url]) => String(url).includes('download=1')),
    ).toBe(true));
  });
});

/*
 * The hidden file input behind "+ PETSCII" / "+ RIP" was written out twice,
 * verbatim: once in the `isNew` branch and once in the branch beside it. It
 * is named once now, and both branches render it - which is the half of an
 * extraction that can go wrong silently. A screen with no picker has buttons
 * that open nothing; two pickers sharing one ref, and the ref points at the
 * wrong one.
 */
describe('the picker that adds a format', () => {
  beforeEach(() => { vi.clearAllMocks(); writes.length = 0; });

  it('is on the page exactly once, on a screen that exists', async () => {
    open();
    await screen.findByRole('button', { name: /\+ RIP/ });

    expect(screen.getAllByLabelText('Add a format')).toHaveLength(1);
  });

  it('is on the page exactly once, on a screen nothing has drawn yet', async () => {
    render(
      <ArtistScreenDialog
        path="Themes/skope/Node/GUESTLOGON.TXT"
        theme={theme}
        index={index}
        onClose={vi.fn()}
        onOpenPath={vi.fn()}
        isNew
      />,
      { wrapper },
    );
    await screen.findByRole('button', { name: /\+ PETSCII/ });

    expect(screen.getAllByLabelText('Add a format')).toHaveLength(1);
  });
});
