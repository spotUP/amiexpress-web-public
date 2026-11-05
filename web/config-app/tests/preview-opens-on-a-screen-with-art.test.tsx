/**
 * "preview as a caller is just black in ansi studio" (sysop, 2026-09-17).
 *
 * It was, and the renderer was innocent. The picker opened on the FIRST
 * screen the catalogue lists - `AWAITSCREEN`, twenty bytes of codes that the
 * board expands to seven characters and draws nothing from. Measured on the
 * live board:
 *
 *     AWAITSCREEN: raw 20 -> parsed 7, visible 0 chars
 *     LOGOFF:      raw 38 -> parsed 2, visible 0 chars
 *     LOGON:       raw 116 -> parsed 11616, visible 1663 chars
 *
 * So two defects, and this pins both: open on a screen that HAS art, and when
 * a screen draws nothing, say so instead of showing a black rectangle.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { previewScreenOrder, hasVisibleContent, visibleLength } from '../src/pages/screen-preview-view';

describe('what the preview opens on', () => {
  /* The board's own flags, as the index reports them. */
  const codeOnly = { bytes: 20, codesOnly: true } as never;
  const art = { bytes: 14023, codesOnly: false } as never;

  it('puts a screen with art before one that is only codes', () => {
    const order = previewScreenOrder(
      [
        { screen: 'AWAITSCREEN', resolutions: [{ file: 'Screens/Node/awaitscreen.txt' }] },
        { screen: 'BBSTITLE', resolutions: [{ file: 'Screens/Node/BBSTITLE.txt' }] },
      ],
      {
        'Screens/Node/awaitscreen.txt': codeOnly,
        'Screens/Node/BBSTITLE.txt': art,
      },
    );

    expect(order[0]).toBe('BBSTITLE');
  });

  it('keeps the code-only screens, after them', () => {
    const order = previewScreenOrder(
      [
        { screen: 'AWAITSCREEN', resolutions: [{ file: 'Screens/Node/awaitscreen.txt' }] },
        { screen: 'BBSTITLE', resolutions: [{ file: 'Screens/Node/BBSTITLE.txt' }] },
      ],
      {
        'Screens/Node/awaitscreen.txt': codeOnly,
        'Screens/Node/BBSTITLE.txt': art,
      },
    );

    // Previewing what AWAITSCREEN expands to is a real thing to want. It is
    // just not where the panel should start.
    expect(order).toContain('AWAITSCREEN');
    expect(order).toHaveLength(2);
  });

  it('leaves a screen that resolves to nothing in the list', () => {
    const order = previewScreenOrder(
      [{ screen: 'STARTCHAT', resolutions: [{ file: null }] }],
      {},
    );
    expect(order).toEqual(['STARTCHAT']);
  });
});

describe('whether a caller would see anything', () => {
  it('counts nothing in a screen that is only escape sequences', () => {
    // What AWAITSCREEN parsed down to on the live board.
    expect(visibleLength('\x1b[2J\x1b[H\r\n')).toBe(0);
    expect(hasVisibleContent('\x1b[2J\x1b[H\r\n')).toBe(false);
  });

  it('counts the letters in a screen that draws', () => {
    expect(hasVisibleContent('\x1b[31mUP ROUGH\x1b[0m')).toBe(true);
    // Seven, not eight: the space between the words is not something drawn.
    expect(visibleLength('\x1b[31mUP ROUGH\x1b[0m')).toBe(7);
  });

  it('counts coloured blocks of spaces as art, because half of it is', () => {
    // A logo drawn as background colour carries no letters at all.
    expect(visibleLength('\x1b[44m    \x1b[0m')).toBe(0);
    expect(hasVisibleContent('\x1b[44m    \x1b[0m')).toBe(true);
  });

  it('does not count a form feed as something drawn', () => {
    // `~f` clears the screen. It is an instruction, not a picture.
    expect(hasVisibleContent('\f')).toBe(false);
  });
});

const PARSED_NOTHING = btoa('\x1b[2J\x1b[H');

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/screens/preview')) {
    return envelope({
      screen: 'AWAITSCREEN', theme: 'default', filePath: 'Screens/Node/awaitscreen.txt',
      isPetscii: false, isRip: false, secLevel: 255, content: PARSED_NOTHING,
      commands: [], searched: [],
    });
  }
  return envelope({});
}));

// The renderer needs a canvas; what is under test is the SENTENCE beside it.
vi.mock('../src/components/ScreenPreview', () => ({ ScreenPreview: () => null }));
vi.mock('../src/components/PetsciiScreenPreview', () => ({ PetsciiScreenPreview: () => null }));

import { ScreenPreviewPanel } from '../src/components/ScreenPreviewPanel';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('a screen that draws nothing', () => {
  it('says so, instead of showing a black rectangle', async () => {
    render(
      <ScreenPreviewPanel theme="default" themeTitle="the board itself" screenNames={['AWAITSCREEN']} />,
      { wrapper },
    );

    await waitFor(() => expect(screen.getByText(/nothing to draw|draws nothing/i)).toBeTruthy());
    // And it still names the file, so the sysop can go and look at it.
    expect(screen.getByText('Screens/Node/awaitscreen.txt')).toBeTruthy();
  });
});
