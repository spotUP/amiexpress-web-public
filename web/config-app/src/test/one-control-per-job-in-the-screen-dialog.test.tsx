/**
 * TWO BUTTONS THAT LOOK THE SAME AND DO OPPOSITE THINGS.
 *
 * Opening the PETSCII title put "Load a drawing" in the editor's toolbar and
 * "Upload a drawing" in the dialog's strip below it: "this is weird in the
 * petscii editor the bottom row has a duplicate upload a drawing button and
 * svg and stuff" (sysop, 2026-09-15).
 *
 * They are not a duplicate - they are two different jobs under one name. The
 * toolbar one loads bytes ONTO THE CANVAS and writes nothing; the dialog one
 * REPLACES THE FILE on the board, with a carry verdict and a confirmation.
 * `ScreenEditor` already distinguishes them ("Open a file into the editor"),
 * so the fix is the wording that already existed, not a new one. Neither
 * control is removed: the toolbar one is the answer to "i dont see a way to
 * upload a petscii screen in the petscii editor" (sysop, 2026-09-14).
 *
 * And "Import SVG as RIP" was on the strip whatever the screen was. It writes
 * RIP drawing commands to the OPEN PATH, so on `BBSTITLE.SEQ` it offered to
 * put vector commands into a file the board serves to C64 callers as screen
 * codes.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../lib/query-client';

const entry = (over: Record<string, unknown>) => ({
  relPath: 'x', bytes: 100, format: 'petscii', sha256: 'h', mci: [], problems: [], readBy: [], ...over,
});
const reader = [{ screen: 'BBSTITLE', scope: 'board', id: null, via: 'resolved' }];
const files: Record<string, ReturnType<typeof entry>> = {
  'Screens/BBSTITLE.SEQ': entry({ relPath: 'Screens/BBSTITLE.SEQ', sha256: 'a', readBy: reader }),
  'Themes/skope/Node/BBSTITLE.SEQ': entry({
    relPath: 'Themes/skope/Node/BBSTITLE.SEQ', sha256: 'b', theme: 'skope', readBy: reader,
  }),
  'Screens/LOGO.RIP': entry({ relPath: 'Screens/LOGO.RIP', format: 'rip', sha256: 'c', readBy: reader }),
  'Themes/skope/Board/LOGO.RIP': entry({
    relPath: 'Themes/skope/Board/LOGO.RIP', format: 'rip', sha256: 'd', theme: 'skope', readBy: reader,
  }),
};
const index = () => ({
  builtAt: '2026-09-15T00:00:00.000Z', unused: [], conferences: [], bulletins: [],
  callersByLevel: {}, screens: [], files,
});
const themes = {
  defaultSlug: 'default', canCreate: false,
  themes: [{
    slug: 'skope', title: "skope's screens", status: 'draft', owner: 'skope', author: 'skope',
    dir: 'Themes/skope', widths: [80], doorTheme: '', screens: 2, exists: true,
    mine: true, wearable: true, writable: true, regressed: null,
  }],
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const converted: unknown[] = [];
const written: unknown[] = [];

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  if (url.includes('/screens/svg-to-rip')) {
    converted.push(JSON.parse(String(init?.body ?? '{}')));
    return envelope({ content: btoa('!|c0C'), commands: 8, losses: [] });
  }
  if (url.includes('/api/screens/file') && method === 'PUT') {
    written.push(JSON.parse(String(init?.body ?? '{}')));
    return envelope({ targets: [] });
  }
  if (url.includes('/validation')) return envelope({ blocking: [], advisory: [], publishable: true, coverage: { provided: 1, total: 44 } });
  if (url.includes('/api/themes')) return envelope(themes);
  // A real 40x25 screen's worth of bytes is not needed; the editor builds a
  // blank one from nothing and the toolbar is what is under test.
  if (url.includes('/api/screens/file')) return envelope({ content: '', format: 'petscii', bytes: 0, mci: [] });
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope(index());
}));

const showError = vi.fn();
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { username: 'skope' }, secLevel: 100 }) }));
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));
vi.mock('../components/ScreenPreviewPanel', () => ({ ScreenPreviewPanel: () => null }));
vi.mock('../components/RipScreenEditor', () => ({ RipScreenEditor: () => null }));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: (...a: unknown[]) => showError(...a), confirm: vi.fn(async () => true) }),
}));

import { ArtistScreenDialog } from '../pages/ArtistScreenDialog';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}

const THEME = themes.themes[0];

const openOn = (path: string) => render(
  <ArtistScreenDialog
    path={path}
    theme={THEME as never}
    index={index() as never}
    onClose={() => {}}
    onOpenPath={() => {}}
  />,
  { wrapper },
);

describe('the controls on a PETSCII screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    converted.length = 0;
    written.length = 0;
    client = new QueryClient({ defaultOptions: QUERY_DEFAULTS });
  });

  it('names the canvas loader and the board upload differently', async () => {
    openOn('Themes/skope/Node/BBSTITLE.SEQ');

    // One of each, and neither is called the same thing as the other.
    expect(await screen.findByLabelText('Open a file into the editor')).toBeTruthy();
    expect(await screen.findByLabelText('Upload a drawing')).toBeTruthy();
    expect(screen.queryByText('Load a drawing')).toBeNull();
  });

  it('does not offer to write RIP commands into a .SEQ', async () => {
    openOn('Themes/skope/Node/BBSTITLE.SEQ');
    await screen.findByLabelText('Upload a drawing');

    expect(screen.queryByText(/Import SVG as RIP/)).toBeNull();
    expect(screen.queryByLabelText('Choose an SVG')).toBeNull();
  });

  it('refuses an SVG brought in through the board upload, rather than converting it', async () => {
    const user = userEvent.setup();
    openOn('Themes/skope/Node/BBSTITLE.SEQ');

    const input = await screen.findByLabelText('Upload a drawing');
    await user.upload(input as HTMLInputElement, new File(
      ['<svg viewBox="0 0 10 10"/>'], 'uptown.svg', { type: 'image/svg+xml' },
    ));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(String(showError.mock.calls[0][0])).toMatch(/not a \.rip/);
    // Neither converted nor written: the screen is untouched.
    expect(converted).toHaveLength(0);
    expect(written).toHaveLength(0);
  });
});

describe('the controls on a RIP screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    converted.length = 0;
    written.length = 0;
    client = new QueryClient({ defaultOptions: QUERY_DEFAULTS });
  });

  it('still offers the SVG import where it belongs', async () => {
    openOn('Themes/skope/Board/LOGO.RIP');

    expect(await screen.findByText(/Import SVG as RIP/)).toBeTruthy();
    expect(await screen.findByLabelText('Choose an SVG')).toBeTruthy();
  });
});
