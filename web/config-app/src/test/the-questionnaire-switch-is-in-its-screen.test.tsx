/**
 * The questionnaire's off switch lives beside the screen it switches off.
 *
 * S8, finished. The questionnaire IS a screen - `Node<n>/script<baud>`, a text
 * shown to a new caller that carries the `~CC_` codes the board runs - and the
 * sysop asked for it to be treated like one. That leaves exactly one thing
 * about it that no other screen has: whether callers are asked at all. It had
 * a page, then a tab; it is now a control in the dialog the screen opens in,
 * which is what he chose when asked.
 *
 * Off is not a flag. `doNewUserQuestions` looks for the FILES, so off means
 * they are parked in `Node<n>/disabled_scripts/` - the convention this board
 * has been switched off with since 2026-04-24.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { isQuestionnaireScreen } from '../pages/QuestionnaireSwitch';

const script = new TextEncoder().encode('What is your real name: ~\r\n~CC_THEME|\r\n');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

let enabled = true;
const puts: { url: string; body: unknown }[] = [];

const envelope = (data: unknown, message?: string) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, message, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('/questionnaire/enabled')) {
    puts.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    return envelope({ enabled: !enabled }, 'Questionnaire updated');
  }
  if (url.includes('/questionnaire')) {
    return envelope({ enabled, nodes: 41, liveFiles: enabled ? 281 : 0, parkedFiles: enabled ? 0 : 281 });
  }
  if (url.includes('/api/screens/file')) {
    return envelope({
      relPath: 'Node1/script2400', bytes: script.length, format: 'text',
      sha256: 'q', mci: [], content: base64(script),
    });
  }
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  return envelope({ builtAt: '', unused: [], screens: [], files: {} });
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));

import { ArtistScreenDialog } from '../pages/ArtistScreenDialog';

const BOARD = {
  slug: 'default', title: "The board's own screens", dir: '', owner: '',
  status: 'live', mine: false, writable: true, widths: [80],
} as never;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

const openOn = (path: string) => render(
  <ArtistScreenDialog
    path={path}
    theme={BOARD}
    index={{ builtAt: '', unused: [], screens: [], files: {} } as never}
    sysop
    onClose={() => {}}
    onOpenPath={() => {}}
  />,
  { wrapper },
);

describe('which files are a questionnaire', () => {
  it('knows a script by its baud, not by its directory', () => {
    expect(isQuestionnaireScreen('Node1/script2400')).toBe(true);
    expect(isQuestionnaireScreen('Node7/SCRIPT115200')).toBe(true);
    expect(isQuestionnaireScreen('Node1/BBSTITLE.txt')).toBe(false);
    // A file that merely starts with the word is not one.
    expect(isQuestionnaireScreen('Screens/scriptures.txt')).toBe(false);
    expect(isQuestionnaireScreen(null)).toBe(false);
  });
});

describe('the switch in the screen', () => {
  it('says whether new callers are asked, on the questionnaire screen', async () => {
    enabled = true;
    openOn('Node1/script2400');

    expect(await screen.findByText(/Asked of every new caller/)).toBeTruthy();
    // And how much of the board it is: one text in 281 copies.
    expect(screen.getByText(/281 files, 41 nodes/)).toBeTruthy();
  });

  it('is not offered on any other screen', async () => {
    enabled = true;
    openOn('Node1/BBSTITLE.txt');

    await waitFor(() => expect(screen.queryByRole('button', { name: /^Disable$/ })).toBeNull());
    expect(screen.queryByText(/Asked of every new caller/)).toBeNull();
  });

  it('switches it off, which parks the files', async () => {
    enabled = true;
    puts.length = 0;
    const user = userEvent.setup();
    openOn('Node1/script2400');

    await user.click(await screen.findByRole('button', { name: /^Disable$/ }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect((puts[0].body as { enabled: boolean }).enabled).toBe(false);
  });

  it('offers to switch it back on when it is off', async () => {
    enabled = false;
    openOn('Node1/script2400');

    expect(await screen.findByText(/Not asked/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Enable$/ })).toBeTruthy();
    expect(screen.getByText(/281 files, 41 nodes, parked/)).toBeTruthy();
  });
});
