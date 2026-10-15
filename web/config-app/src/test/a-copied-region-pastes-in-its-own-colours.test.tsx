/**
 * Alt+C then Alt+V keeps the art's colours.
 *
 * The editor has two clipboards: the system one (plain text, so a sysop can
 * paste into their own editor) and an internal one that keeps every cell's
 * foreground and background. Alt+C wrote BOTH, and Alt+V preferred the system
 * read - which on Chrome hands back the plain text Alt+C had just written. So
 * every canvas-to-canvas paste went through the TEXT path and restamped the
 * art in whatever colours were currently selected: `pasteRegion`, the
 * colour-preserving path, was reachable only when the clipboard read failed.
 *
 * screen-clipboard.test.ts calls `pasteRegion` directly, so it never saw it.
 * This drives the editor's own keyboard handler, which is where the choice is
 * made.
 */
import { useState } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ScreenEditor } from '../components/ScreenEditor';
import {
  blankCanvas, createSurface, pointerToCanvas, typeText, type EditorSurface,
} from '../pages/screen-editor-state';

/** What the browser's clipboard holds, and who put it there. */
let systemText = '';
let readable = true;

beforeEach(() => {
  systemText = '';
  readable = true;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async (text: string) => { systemText = text; }),
      readText: vi.fn(async () => {
        if (!readable) throw new Error('denied');
        return systemText;
      }),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * "AB" on row 1 in ANSI red on black, with a 2x1 marquee committed over it -
 * and green-on-blue selected as the colours a new stroke would use. A paste
 * that keeps the art's own colours is red; one that restamps is green.
 */
const RED = 4;
const GREEN = 2;
const BLUE = 1;

function selectedAb(): EditorSurface {
  let surface = createSurface(blankCanvas(25, 80));
  surface = typeText({ ...surface, fg: RED, bg: 0 }, 0, 1, 'AB');
  const selecting = { ...surface, tool: 'select' as const };
  let dragged = pointerToCanvas(selecting, 0, 1, 'down');
  dragged = pointerToCanvas(dragged, 1, 1, 'move');
  const done = pointerToCanvas(dragged, 1, 1, 'up');
  return { ...done, fg: GREEN, bg: BLUE };
}

/** The editor as the page drives it: controlled, so a paste lands on screen. */
function Editor({ onSurface }: { onSurface: (surface: EditorSurface) => void }) {
  const [surface, setSurface] = useState<EditorSurface>(selectedAb);
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ScreenEditor
        surface={surface}
        onChange={next => { setSurface(next); onSurface(next); }}
      />
    </QueryClientProvider>
  );
}

/** The surface the editor handed back last - what is on screen now. */
const last = (seen: EditorSurface[]): EditorSurface | undefined => seen[seen.length - 1];

const altC = () => fireEvent.keyDown(window, { key: 'c', code: 'KeyC', altKey: true });
const altV = () => fireEvent.keyDown(window, { key: 'v', code: 'KeyV', altKey: true });

describe('a region copied on the canvas', () => {
  it('pastes in its own colours, not the ones currently selected', async () => {
    const seen: EditorSurface[] = [];
    render(<Editor onSurface={s => seen.push(s)} />);

    altC();
    await waitFor(() => expect(systemText).toBe('AB'));
    altV();

    // The cursor starts at 0,0, so the copy lands on the blank first row.
    await waitFor(() => expect(last(seen)?.canvas[0][0].char).toBe('A'));
    expect(last(seen)?.canvas[0][0]).toMatchObject({ char: 'A', fg: RED, bg: 0 });
    expect(last(seen)?.canvas[0][1]).toMatchObject({ char: 'B', fg: RED, bg: 0 });
  });

  it('still takes text copied outside the admin, in the current colours', async () => {
    const seen: EditorSurface[] = [];
    render(<Editor onSurface={s => seen.push(s)} />);

    altC();
    await waitFor(() => expect(systemText).toBe('AB'));
    // The sysop copies something in another window; that is the one case the
    // plain-text path is for.
    systemText = 'HI';
    altV();

    await waitFor(() => expect(last(seen)?.canvas[0][0].char).toBe('H'));
    expect(last(seen)?.canvas[0][0]).toMatchObject({ char: 'H', fg: GREEN, bg: BLUE });
  });

  it('pastes the region when the browser refuses to read the clipboard', async () => {
    const seen: EditorSurface[] = [];
    render(<Editor onSurface={s => seen.push(s)} />);

    altC();
    await waitFor(() => expect(systemText).toBe('AB'));
    readable = false;
    altV();

    await waitFor(() => expect(last(seen)?.canvas[0][0].char).toBe('A'));
    expect(last(seen)?.canvas[0][0]).toMatchObject({ char: 'A', fg: RED, bg: 0 });
  });
});
