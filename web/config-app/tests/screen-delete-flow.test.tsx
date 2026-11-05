/**
 * Deleting a screen closes the dialog and refreshes what is on screen.
 *
 * "I deleted a screen file but the dialog did not close and the gallery was
 * not refreshed."
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const art = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

let deleted = false;
let refuse = false;
let damaged = false;

const index = () => ({
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [],
  screens: [],
  conferences: [],
  bulletins: [],
  files: deleted ? {} : {
    'Screens/DOOMED.TXT': {
      relPath: 'Screens/DOOMED.TXT', bytes: 6, format: 'ansi', sha256: 'a', mci: [],
      problems: damaged ? ['colour-codes-without-escape'] : [],
      readBy: [{ screen: 'LOGON', scope: 'board', id: null, via: 'resolved' }],
    },
  },
});

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

let globalDeleted = false;

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('/api/screens/screen-delete-plan')) {
    return envelope({
      screen: 'LOGON',
      targets: [
        { path: 'Screens/DOOMED.TXT' },
        { path: 'Themes/neon/Board/DOOMED.TXT', theme: 'neon' },
      ],
      themes: ['neon'],
      archivedThemesSkipped: [],
      references: [],
      removableReferences: 0,
      loginStep: { screen: 'LOGON', label: 'Logon screen' },
    });
  }
  if (url.includes('/api/screens/screen?') && init?.method === 'DELETE') {
    globalDeleted = true;
    deleted = true;
    return envelope({ screen: 'LOGON', deleted: ['Screens/DOOMED.TXT'], backups: [], failed: [], fixed: [] });
  }
  if (url.includes('/api/screens/file') && init?.method === 'DELETE') {
    if (refuse) {
      return Promise.resolve({
        ok: false, status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: false, error: 'Path outside the board root' }),
        text: async () => '{}',
      } as unknown as Response);
    }
    deleted = true;
    return envelope({ deleted: true, stopsResolving: [] });
  }
  if (url.includes('/api/screens/repair')) return envelope({ repaired: 2 });
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) {
    // The file endpoint answers with screenFileFacts, so the problems come
    // with it - that is what the Repair button keys on.
    return envelope({
      relPath: 'Screens/DOOMED.TXT', bytes: 6, format: 'ansi', mci: [],
      problems: damaged ? ['colour-codes-without-escape'] : [],
      content: base64(art),
    });
  }
  return envelope(index());
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    // A confirm carrying a checkbox answers {confirmed, checked}; a plain one
    // answers a boolean. Standing in for one with the other is how a delete
    // with an unticked box would read as a cancel.
    confirm: vi.fn(async (options: { checkbox?: unknown }) =>
      options?.checkbox ? { confirmed: true, checked: false } : true),
  }),
}));


/*
 * The gallery is Screen Designer's whole view since S9, so these cases drive
 * it there. The theme is mocked rather than fetched - the board's own screens
 * are one of the options in its selector - because what is under test is the
 * CARDS, not a theme registry round-trip in front of them.
 */
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'sysop' }, secLevel: 255 }),
}));
vi.mock('../src/pages/use-my-theme', () => ({
  useMyTheme: () => ({
    theme: {
      slug: 'default', title: "The board's own screens", dir: '', owner: '',
      status: 'live', mine: false, writable: true, widths: [80],
    },
    choices: [], select: vi.fn(), isPreparing: false, error: null,
    auditing: false, sysop: true,
  }),
}));

import { ArtistStudioPage as ScreenScopeTables } from '../src/pages/ArtistStudioPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('deleting a screen file', () => {
  beforeEach(() => { deleted = false; refuse = false; damaged = false; fetchMock.mockClear(); });

  it('says why, in the dialog, when the board refuses', async () => {
    // A toast is missable and then gone; the reason belongs where the button
    // was pressed. This is what "the dialog did not close" actually was.
    refuse = true;
    const user = userEvent.setup();
    render(<ScreenScopeTables />, { wrapper });

    await user.click(await screen.findByText('LOGON'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    expect(await within(dialog).findByText(/That did not work/)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('closes the dialog and takes the card off the gallery', async () => {
    const user = userEvent.setup();
    render(<ScreenScopeTables />, { wrapper });

    await user.click(await screen.findByText('LOGON'));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.queryByText('LOGON')).toBeNull());
  });
});

/**
 * Repairing a screen whose colour codes lost their escape byte.
 *
 * "Can we also offer a fix button in the admin interface in the dialog for the
 * broken ones?" 47 files on the live board are in that state.
 */
describe('repairing a damaged screen', () => {
  beforeEach(() => { deleted = false; refuse = false; damaged = false; fetchMock.mockClear(); });

  /*
   * REPAIR SITS BESIDE THE COMPLAINT, in the one dialog.
   *
   * It used to sit in this page's own modal, which the one dialog replaced.
   * The dialog is where a file's problems are reported, so that is where the
   * fix belongs - and it is the sysop's, because repairing rewrites a file an
   * artist may not own. Classification went the other way, onto the report
   * row that makes the claim.
   */
  it('offers the fix beside the complaint, and asks the board to do it', async () => {
    damaged = true;
    const user = userEvent.setup();
    render(<ScreenScopeTables />, { wrapper });

    await user.click(await screen.findByText('LOGON'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /put the escape byte back/i }));

    await waitFor(() => {
      const repair = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/screens/repair'));
      expect(repair).toBeTruthy();
    });
  });

  it('offers nothing of the sort on a healthy file', async () => {
    const user = userEvent.setup();
    render(<ScreenScopeTables />, { wrapper });

    await user.click(await screen.findByText('LOGON'));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).queryByRole('button', { name: /escape byte/i })).toBeNull();
  });
});

/**
 * "if the sysop changes his mind and wants to entirely remove a screen
 * entirely from the bbs he needs to be able to delete it globally from all
 * themes and the default theme" (sysop, 2026-09-20).
 *
 * Delete takes this file and Drop mine takes a theme's version; neither ends
 * a screen. The third button does, and it must ask the board WHAT it would
 * take before the sysop confirms - the count, the themes and the login
 * warning are the whole of that decision.
 */
describe('removing a screen from the whole board', () => {
  beforeEach(() => { deleted = false; globalDeleted = false; fetchMock.mockClear(); });

  it('asks what would go, then deletes by screen name', async () => {
    const user = userEvent.setup();
    render(<ScreenScopeTables />, { wrapper });

    await user.click(await screen.findByText('LOGON'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /delete everywhere/i }));

    // The plan is read from the board, keyed by the open FILE - the rule for
    // which variants share a screen name lives there, not in this dialog.
    await waitFor(() => {
      const planned = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/api/screens/screen-delete-plan'));
      expect(planned).toBeTruthy();
      expect(String(planned?.[0])).toContain('path=');
    });

    await waitFor(() => expect(globalDeleted).toBe(true));
    const call = fetchMock.mock.calls.find(([url, init]) =>
      String(url).includes('/api/screens/screen?') && (init as RequestInit)?.method === 'DELETE');
    // By NAME, and without mending includes unless the box was ticked.
    expect(String(call?.[0])).toContain('screen=LOGON');
    expect(String(call?.[0])).not.toContain('fixReferences');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
