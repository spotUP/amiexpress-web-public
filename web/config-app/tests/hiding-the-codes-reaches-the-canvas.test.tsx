/**
 * The fold has to reach the CANVAS, not a list beside it.
 *
 * Twice now the toggle has been reported as doing nothing - "show or hide
 * codes does nothing", then "so far i havent seen it hide codes" (sysop,
 * 2026-09-18) - and twice I answered that it worked. This is the one test
 * that settles it: the runs the editor hands the canvas, when the codes are
 * folded and when they are not.
 *
 * `AnsiCanvas` paints to a real 2D context, which jsdom has not got, so the
 * canvas is mocked to record the props it is given. What is asserted is the
 * wiring: the editor computes the runs from the same tokens it lists, so the
 * picture and the list cannot disagree about what a code is.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/** Every set of props the canvas was drawn with, newest last. */
const painted: { hidden?: { x: number; y: number; length: number }[] }[] = [];

vi.mock('../src/components/AnsiCanvas', () => ({
  AnsiCanvas: (props: { hidden?: { x: number; y: number; length: number }[] }) => {
    painted.push(props);
    return <div data-testid="ansi-canvas" />;
  },
}));

vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data: { families: [], codes: [] }, timestamp: '' }),
  text: async () => '{}',
} as unknown as Response)));

import { ScreenEditor } from '../src/components/ScreenEditor';
import { createSurface } from '../src/pages/screen-editor-state';
import { createCanvas, setCell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/canvas';

/** `~f` on line 1 with art under it - Conf3/bull20.txt's shape. */
function surfaceWithACode() {
  const canvas = createCanvas(10, 2);
  for (const [x, char] of [...'~f'].entries()) setCell(canvas, x, 0, { char, fg: 7, bg: 0 });
  for (const [x, char] of [...'ART'].entries()) setCell(canvas, x, 1, { char, fg: 7, bg: 0 });
  return createSurface(canvas);
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('folding the codes away', () => {
  it('hides the code cells on the canvas, and shows them again', async () => {
    painted.length = 0;
    const user = userEvent.setup();
    render(<ScreenEditor surface={surfaceWithACode()} onChange={() => {}} />, { wrapper });

    // Shut by default: the two cells of `~f` are not drawn.
    expect(painted[painted.length - 1]?.hidden).toEqual([{ x: 0, y: 0, length: 2 }]);

    await user.click(await screen.findByRole('button', { name: /show the codes/i }));
    expect(painted[painted.length - 1]?.hidden).toEqual([]);

    await user.click(await screen.findByRole('button', { name: /hide the codes/i }));
    expect(painted[painted.length - 1]?.hidden).toEqual([{ x: 0, y: 0, length: 2 }]);
  });

  it('is a real control, not underlined text', async () => {
    painted.length = 0;
    render(<ScreenEditor surface={surfaceWithACode()} onChange={() => {}} />, { wrapper });

    const button = await screen.findByRole('button', { name: /show the codes/i });
    // The design system's button, and a pressed state a screen reader can read.
    expect(button.className).toContain('btn-');
    expect(button.className).not.toContain('underline');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});
