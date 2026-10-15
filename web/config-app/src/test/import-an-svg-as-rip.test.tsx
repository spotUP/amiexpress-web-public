/**
 * An SVG becomes a RIP screen, and says what it lost on the way.
 *
 * `!ASCII-Art/rip/` has carried `uptown.ai` and its `uPtOwN.svg` export since
 * before any of this existed: the art is drawn in Illustrator and had nowhere
 * to go (sysop, 2026-09-14). `RipScreenEditor` says of itself "editable
 * without being a drawing program", so the way IN was always meant to be an
 * export rather than a canvas.
 *
 * The conversion is a PROJECTION - 640x350, sixteen colours, no gradients, no
 * text, no clipping - so what it could not carry is shown BEFORE anything is
 * written. A `.rip` that turns out to be a blank screen is otherwise only
 * discoverable by opening it.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../lib/query-client';

const file = (over: Record<string, unknown>) => ({
  relPath: 'x', bytes: 100, format: 'rip', sha256: 'h', mci: [], problems: [], readBy: [], ...over,
});
const reader = [{ screen: 'LOGO', scope: 'board', id: null, via: 'resolved' }];
/*
 * A board screen AND the theme's copy of it, which is the shape the gallery
 * draws a card from: a theme file with no board screen behind it is not a
 * slot the studio knows about, and lists nothing.
 */
const files: Record<string, ReturnType<typeof file>> = {
  'Screens/LOGO.RIP': file({ relPath: 'Screens/LOGO.RIP', sha256: 'a', readBy: reader }),
  'Themes/skope/Board/LOGO.RIP': file({
    relPath: 'Themes/skope/Board/LOGO.RIP', sha256: 'b', theme: 'skope', readBy: reader,
  }),
};
const index = () => ({
  builtAt: '2026-09-14T00:00:00.000Z', unused: [], conferences: [], bulletins: [],
  callersByLevel: {}, screens: [], files,
});
const themes = {
  defaultSlug: 'default', canCreate: false,
  themes: [{
    slug: 'skope', title: "skope's screens", status: 'draft', owner: 'skope', author: 'skope',
    dir: 'Themes/skope', widths: [80], doorTheme: '', screens: 1, exists: true,
    mine: true, wearable: true, writable: true, regressed: null,
  }],
};

const envelope = (data: unknown, message?: string) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, message, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

/** What the converter answered, and what was written afterwards. */
const converted: Array<{ svg: string }> = [];
const written: Array<{ url: string; body: unknown }> = [];
let answer = { content: btoa('!|c0C|p02...'), commands: 8, losses: [] as Array<{ element: string; reason: string }> };

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  if (url.includes('/copy') && method === 'POST') {
    return envelope({
      from: 'Screens/LOGO.RIP', to: 'Themes/skope/Board/LOGO.RIP',
      target: 'Board/LOGO.RIP', copied: [{ target: 'Board/LOGO.RIP' }], kept: [],
    }, 'Copied in');
  }
  if (url.includes('/screens/svg-to-rip')) {
    converted.push(JSON.parse(String(init?.body ?? '{}')));
    return envelope(answer, `Converted - ${answer.commands} drawing commands`);
  }
  if (url.includes('/api/screens/file') && method === 'PUT') {
    written.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    return envelope({ targets: [] });
  }
  if (url.includes('/validation')) return envelope({ blocking: [], advisory: [], publishable: true, coverage: { provided: 1, total: 44 } });
  if (url.includes('/api/themes')) return envelope(themes);
  if (url.includes('/api/screens/file')) return envelope({ content: btoa('!|c0F'), format: 'rip', bytes: 6, mci: [] });
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope(index());
}));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { username: 'skope' }, secLevel: 100 }) }));
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));
vi.mock('../components/ScreenPreviewPanel', () => ({ ScreenPreviewPanel: () => null }));
vi.mock('../components/RipScreenEditor', () => ({ RipScreenEditor: () => null }));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ArtistScreenDialog } from '../pages/ArtistScreenDialog';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}

/** The dialog, open on the artist's own RIP screen. */
const THEME = themes.themes[0];
const PATH = 'Themes/skope/Board/LOGO.RIP';

function openDialog() {
  return render(
    <ArtistScreenDialog
      path={PATH}
      theme={THEME as never}
      index={index() as never}
      onClose={() => {}}
      onOpenPath={() => {}}
    />,
    { wrapper },
  );
}

/** Hand the hidden file input an SVG, as the picker would. */
async function pickSvg(user: ReturnType<typeof userEvent.setup>, text: string) {
  const input = await screen.findByLabelText('Choose an SVG');
  const svg = new File([text], 'uptown.svg', { type: 'image/svg+xml' });
  await user.upload(input as HTMLInputElement, svg);
}

describe('importing an SVG as RIP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    converted.length = 0;
    written.length = 0;
    answer = { content: btoa('!|c0C|p02...'), commands: 8, losses: [] };
    client = new QueryClient({ defaultOptions: QUERY_DEFAULTS });
  });

  it('sends the SVG and shows what it became, before writing anything', async () => {
    const user = userEvent.setup();
    openDialog();
    await pickSvg(user, '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#c9325c"/></svg>');

    await waitFor(() => expect(converted).toHaveLength(1));
    expect(converted[0].svg).toContain('<rect');
    expect(await screen.findByTestId('svg-import')).toBeTruthy();
    expect(screen.getByText(/8 drawing commands/)).toBeTruthy();
    // Nothing has been written yet - the artist has not said so.
    expect(written).toHaveLength(0);
  });

  it('writes it only when the artist says to', async () => {
    const user = userEvent.setup();
    openDialog();
    await pickSvg(user, '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/></svg>');

    await user.click(await screen.findByRole('button', { name: /Write it to/ }));
    await waitFor(() => expect(written).toHaveLength(1));
    expect((written[0].body as { content: string }).content).toBe(answer.content);
  });

  it('converts an SVG picked through "Upload a drawing" too', async () => {
    /*
     * That is the control an artist reaches for when they have a drawing,
     * and the raw bytes of an export are refused by the loader's own guard:
     * "the target is a .rip but these bytes are not RIP" (sysop,
     * 2026-09-14) - true, and useless when the conversion is right there.
     */
    const user = userEvent.setup();
    openDialog();

    const upload = await screen.findByLabelText('Upload a drawing');
    const svg = new File(
      ['<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/></svg>'],
      'uptown.svg',
      { type: 'image/svg+xml' },
    );
    await user.upload(upload as HTMLInputElement, svg);

    // Converted, not uploaded raw: the board was asked to convert, and
    // nothing was written.
    await waitFor(() => expect(converted).toHaveLength(1));
    expect(converted[0].svg).toContain('<rect');
    expect(await screen.findByTestId('svg-import')).toBeTruthy();
    expect(written).toHaveLength(0);
  });

  it('converts through the empty-slot upload, which is the one the sysop hit', async () => {
    /*
     * `Node0/BBSTITLE.rip` had no file, so the dialog was in its "nothing is
     * drawn here" branch - a THIRD file picker, which the SVG rule did not
     * reach: "Node0/BBSTITLE.rip: The target is a .rip but these bytes are
     * not RIP" (sysop, 2026-09-14).
     */
    const user = userEvent.setup();
    render(
      <ArtistScreenDialog
        path={PATH}
        theme={THEME as never}
        index={{ ...index(), files: {} } as never}
        onClose={() => {}}
        onOpenPath={() => {}}
        isNew
      />,
      { wrapper },
    );

    const upload = await screen.findByLabelText('Upload ANSI drawing');
    await user.upload(
      upload as HTMLInputElement,
      new File(['<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/></svg>'],
        'uptown.svg', { type: 'image/svg+xml' }),
    );

    await waitFor(() => expect(converted).toHaveLength(1));
    expect(await screen.findByTestId('svg-import')).toBeTruthy();
    expect(written).toHaveLength(0);
  });

  it('still uploads anything that is not an SVG unchanged', async () => {
    const user = userEvent.setup();
    openDialog();

    const upload = await screen.findByLabelText('Upload a drawing');
    await user.upload(
      upload as HTMLInputElement,
      new File(['!|c0F'], 'logo.rip', { type: 'application/octet-stream' }),
    );

    // No conversion was asked for; the ordinary replace flow has it.
    await waitFor(() => expect(screen.queryByText(/Replace with logo.rip/)).toBeTruthy());
    expect(converted).toHaveLength(0);
  });

  it('names what RIP could not carry', async () => {
    answer = {
      content: btoa('!|c0F'), commands: 3,
      losses: [{ element: 'text', reason: 'RIP text is a different command set' }],
    };
    const user = userEvent.setup();
    openDialog();
    await pickSvg(user, '<svg><text>HI</text></svg>');

    expect(await screen.findByText(/cannot carry everything/)).toBeTruthy();
    expect(screen.getByText(/different command set/)).toBeTruthy();
  });

  it('refuses to write a scene that draws nothing', async () => {
    answer = { content: btoa(''), commands: 0, losses: [{ element: 'svg', reason: 'nothing was drawn' }] };
    const user = userEvent.setup();
    openDialog();
    await pickSvg(user, '<svg><path d="M0,0 L1,1"/></svg>');

    expect(await screen.findByText(/Nothing was drawn/)).toBeTruthy();
    const write = screen.getByRole('button', { name: /Write it to/ });
    expect((write as HTMLButtonElement).disabled).toBe(true);
    expect(written).toHaveLength(0);
  });
});
