/**
 * Clicking "Amiga colours" must repaint the art, not just light the button.
 *
 * "when i click amiga colors it doesnt switch state just adds a blue border"
 * (sysop, 2026-09-14). The ring IS the state - aria-pressed - so the question
 * is whether the canvas is told, and whether it repaints when it is.
 *
 * jsdom has no 2D context, so the paint itself cannot be observed here: the
 * module is stubbed and the test reads the palette argument the component
 * passed. What it proves is the wiring from the button to the paint call,
 * which is the part that can silently not exist.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../src/api/client';
import { createCanvas, setCell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/canvas';

const paintCalls: unknown[][] = [];
vi.mock('../src/components/ansi-canvas-paint', async () => {
  const actual = await vi.importActual<typeof import('../src/components/ansi-canvas-paint')>(
    '../src/components/ansi-canvas-paint',
  );
  return {
    ...actual,
    paintScreen: (...args: unknown[]) => { paintCalls.push(args); },
  };
});

import { ScreenEditor } from '../src/components/ScreenEditor';
import { createSurface } from '../src/pages/screen-editor-state';

/** A screen with a bright cell on it - something the fold can actually move. */
function brightSurface() {
  const canvas = createCanvas(10, 3);
  setCell(canvas, 0, 0, { char: 'A', fg: 11, bg: 0 });
  return createSurface(canvas);
}

/** The editor pulls the MCI catalogue and the board's config. */
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** A board that answers with the given colour depth. */
function boardWith(colours: number | undefined): void {
  vi.spyOn(apiClient, 'getSystemConfig').mockResolvedValue(
    { data: { terminal_colours: colours } } as never,
  );
}

/** The palette argument of the last paint. */
function lastPalette(): unknown {
  return paintCalls[paintCalls.length - 1]?.[4];
}

describe('the Amiga colours toggle', () => {
  beforeEach(() => {
    paintCalls.length = 0;
    // jsdom has no 2D backend and AnsiCanvas returns early without a context,
    // so there would be no paint to observe at all. The paint itself is
    // pinned in ansi-canvas-paint.test.ts; this is about the wiring.
    HTMLCanvasElement.prototype.getContext = (() => ({
      setTransform: () => {},
    })) as never;
    boardWith(16);
  });

  it('starts in full colour, and says so', () => {
    render(<ScreenEditor surface={brightSurface()} onChange={() => {}} />, { wrapper });
    expect(paintCalls.length).toBeGreaterThan(0);
    expect(lastPalette()).toBe('full');
    expect(screen.getByRole('button', { name: /all 16 colours/i })).toBeInTheDocument();
  });

  it('repaints in the Amiga palette when the button is pressed', () => {
    render(<ScreenEditor surface={brightSurface()} onChange={() => {}} />, { wrapper });
    const button = screen.getByRole('button', { name: /all 16 colours/i });

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'true');
    // The label says which palette is on the glass, not what a press would do.
    expect(button).toHaveTextContent('Amiga 8 colours');
    expect(lastPalette()).toBe('amiga');
  });

  it('goes back to full colour on a second press', () => {
    render(<ScreenEditor surface={brightSurface()} onChange={() => {}} />, { wrapper });
    const button = screen.getByRole('button', { name: /all 16 colours/i });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('All 16 colours');
    expect(lastPalette()).toBe('full');
  });
});

/**
 * An eight-colour board's artists should be looking at eight colours without
 * having to remember a button - and the button still wins once they press it.
 */
describe('the preview follows the board', () => {
  beforeEach(() => {
    paintCalls.length = 0;
    HTMLCanvasElement.prototype.getContext = (() => ({ setTransform: () => {} })) as never;
  });

  it('opens in the Amiga palette on an eight-colour board', async () => {
    boardWith(8);
    render(<ScreenEditor surface={brightSurface()} onChange={() => {}} />, { wrapper });

    await waitFor(() => expect(lastPalette()).toBe('amiga'));
    expect(screen.getByRole('button', { name: /amiga 8 colours/i })).toBeInTheDocument();
  });

  it('opens in full colour on a sixteen-colour board', async () => {
    boardWith(16);
    render(<ScreenEditor surface={brightSurface()} onChange={() => {}} />, { wrapper });

    await waitFor(() => expect(lastPalette()).toBe('full'));
  });

  it('lets the artist look at the other one, whatever the board runs', async () => {
    boardWith(8);
    render(<ScreenEditor surface={brightSurface()} onChange={() => {}} />, { wrapper });
    await waitFor(() => expect(lastPalette()).toBe('amiga'));

    fireEvent.click(screen.getByRole('button', { name: /amiga 8 colours/i }));
    expect(lastPalette()).toBe('full');
  });
});
