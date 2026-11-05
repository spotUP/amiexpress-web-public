/**
 * A PETSCII card is drawn on a C64 surface, not through the CP437 canvas.
 *
 * Every gallery card went through `ScreenArt` - the ANSI renderer - whatever
 * the file was, so a `.seq` (C64 screen codes) came out as noise and a `.rip`
 * (drawing commands) as text. The sysop, testing the studio: "the petscii
 * previews dont display correctly in the admin ui make them on par with how it
 * displays in the bbs".
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ScreenGallery } from '../src/components/ScreenGallery';
import { QUERY_DEFAULTS } from '../src/lib/query-client';

// clear, reverse on, two screen codes: a real .seq opening.
const seq = new Uint8Array([0x93, 0x12, 0x41, 0x42]);
const ansi = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: QUERY_DEFAULTS });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('a gallery card is drawn by whatever can read the file', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('BBSTITLE.SEQ')) return envelope({ content: base64(seq), format: 'petscii' });
      return envelope({ content: base64(ansi), format: 'ansi' });
    }));
  });

  it('draws a .seq on the board own C64 surface', async () => {
    render(
      <ScreenGallery
        items={[{ path: 'Node1/BBSTITLE.SEQ', label: 'BBSTITLE', format: 'petscii' }]}
        onOpen={() => {}}
      />,
      { wrapper },
    );

    await waitFor(() => expect(screen.getByTestId('petscii-screen-preview')).toBeTruthy());
  });

  it('does not offer a RIP file to the ANSI renderer', async () => {
    render(
      <ScreenGallery
        items={[{ path: 'Node1/BBSTITLE.rip', label: 'BBSTITLE', format: 'rip' }]}
        onOpen={() => {}}
      />,
      { wrapper },
    );

    await waitFor(() => expect(screen.getByTestId('rip-thumbnail')).toBeTruthy());
  });

  it('still draws an ANSI screen the way it always did', async () => {
    render(
      <ScreenGallery
        items={[{ path: 'Node1/BBSTITLE.txt', label: 'BBSTITLE', format: 'ansi' }]}
        onOpen={() => {}}
      />,
      { wrapper },
    );

    await waitFor(() => expect(screen.queryByTestId('petscii-screen-preview')).toBeNull());
    expect(screen.queryByTestId('rip-thumbnail')).toBeNull();
  });
});
