/**
 * A sysop has full rights in the studio; an artist has their own theme.
 *
 * Sysop, 2026-09-15: "it doesnt let me upload screens to replace", and then
 * the ruling - "sysops should have full rights artists should only see their
 * own themes", artists being level 100.
 *
 * What he hit: the dialog decided what you may write from OWNERSHIP alone -
 * does the theme you are standing in own this file. That is right for an
 * artist and wrong for a sysop, and it bit hardest for him because
 * use-my-theme lands a sysop in his OWN theme, so every board screen belonged
 * to somebody else. The result was a dialog with no upload button AND no save
 * (both were gated on the same flag), and nothing saying why.
 *
 * The backend had already granted it - a sysop's writable root is the board
 * itself - so this was the UI refusing what the server would have allowed.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../lib/query-client';

const art = new TextEncoder().encode('\x1b[31mBOARD ART');
const base64 = btoa(String.fromCharCode(...art));

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/api/screens/file')) return envelope({ content: base64, format: 'ansi', bytes: art.length, mci: [] });
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope({});
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ArtistScreenDialog } from '../pages/ArtistScreenDialog';
import type { ScreenIndexShape } from '../pages/screen-index-view';

/** Standing in an artist's theme... */
const standingIn = { slug: 'spot', title: "spot's screens", status: 'draft' as const, dir: 'Themes/spot', owner: 'spot', screens: 1, mine: true };
/** ...looking at one of the BOARD's own screens, which no theme owns. */
const boardScreen = 'Screens/BBSTITLE.TXT';
const index = {
  files: { [boardScreen]: { relPath: boardScreen } },
} as unknown as ScreenIndexShape;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('a sysop standing in their own theme, looking at a board screen', () => {
  it('may replace it', async () => {
    render(
      <ArtistScreenDialog path={boardScreen} theme={standingIn} index={index}
        onClose={vi.fn()} onOpenPath={vi.fn()} sysop />,
      { wrapper },
    );

    expect(await screen.findByText('Upload a drawing')).toBeTruthy();
  });

  it('is not told the screen belongs to somebody else, because it does not', async () => {
    render(
      <ArtistScreenDialog path={boardScreen} theme={standingIn} index={index}
        onClose={vi.fn()} onOpenPath={vi.fn()} sysop />,
      { wrapper },
    );

    await screen.findByText('Upload a drawing');
    expect(screen.queryByText(/nothing here to save or replace/)).toBeNull();
  });
});

describe('an artist standing in their own theme, looking at a board screen', () => {
  it('may not replace it - that rule is what keeps them to their own work', async () => {
    render(
      <ArtistScreenDialog path={boardScreen} theme={standingIn} index={index}
        onClose={vi.fn()} onOpenPath={vi.fn()} />,
      { wrapper },
    );

    await waitFor(() => expect(screen.queryByText(/nothing here to save or replace/)).toBeTruthy());
    expect(screen.queryByText('Upload a drawing')).toBeNull();
  });

  it('is TOLD why, instead of getting a dialog with nothing in it', async () => {
    render(
      <ArtistScreenDialog path={boardScreen} theme={standingIn} index={index}
        onClose={vi.fn()} onOpenPath={vi.fn()} />,
      { wrapper },
    );

    // The old behaviour was a silently read-only dialog: no button, no reason.
    expect(await screen.findByText(/board’s own screens/)).toBeTruthy();
  });

  it('is offered the one click that fixes it, when the page can switch', async () => {
    const onSwitchTheme = vi.fn();
    render(
      <ArtistScreenDialog path={boardScreen} theme={standingIn} index={index}
        onClose={vi.fn()} onOpenPath={vi.fn()} onSwitchTheme={onSwitchTheme} />,
      { wrapper },
    );

    const button = await screen.findByText('Switch to Board screens');
    button.click();
    expect(onSwitchTheme).toHaveBeenCalledWith('default');
  });

  /*
   * Artist in 607080, 2026-10-02: "Switch to Board screens" did nothing. The
   * studio's switch only lands on the artist's own themes, so the button was
   * a dead end that looked like a way out.
   */
  it('is not offered a switch to the board when the page cannot make it', async () => {
    const onSwitchTheme = vi.fn();
    render(
      <ArtistScreenDialog path={boardScreen} theme={standingIn} index={index}
        onClose={vi.fn()} onOpenPath={vi.fn()} onSwitchTheme={onSwitchTheme}
        switchableThemes={[standingIn.slug]} />,
      { wrapper },
    );

    await screen.findByText(/nothing here to save or replace/);
    expect(screen.queryByText('Switch to Board screens')).toBeNull();
  });
});
