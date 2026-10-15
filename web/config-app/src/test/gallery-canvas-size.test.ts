/**
 * A thumbnail must not allocate a full screen.
 *
 * Reported 2026-09-02 from the live board: "this page is still super heavy.
 * it froze the browser now", on /admin/screens?tab=gallery.
 *
 * The cards were lazy about FETCHING - an IntersectionObserver per card, and
 * the bytes only requested once it scrolled into view - and not lazy at all
 * about PIXELS. Each thumbnail built the same canvas the editor does, 80x8 by
 * 25x16, doubled again for a retina display: 1280x800, 4.1 MB of backing
 * store. `transform: scale(0.28)` around it changed what you saw and not one
 * byte of what was allocated. The observer disconnects once a card is drawn,
 * so nothing was ever released either - scrolling a board of 872 screens
 * walked straight into gigabytes.
 *
 * The fix is to draw the thumbnail at thumbnail size. This test is the number,
 * because the number is the bug.
 */
import { describe, expect, it } from 'vitest';
import { canvasPixelSize, CELL_WIDTH, CELL_HEIGHT } from '../components/ansi-canvas-paint';

const MEGABYTE = 1024 * 1024;
const bytes = (size: { width: number; height: number }) => size.width * size.height * 4;

describe('the pixels a screen thumbnail costs', () => {
  it('is a fraction of a full screen, not a full screen scaled by CSS', () => {
    const full = canvasPixelSize(80, 25, 1, 2);
    const thumbnail = canvasPixelSize(80, 25, 0.28, 2);

    // 1280 x 800 x 4 = 4,096,000 bytes against 358 x 224 x 4 = 320,768.
    expect(bytes(full)).toBe(4_096_000);
    expect(bytes(thumbnail)).toBeLessThan(bytes(full) / 12);
  });

  it('keeps a whole gallery inside a browser', () => {
    // 872 screens on this board. At full size that is more than three
    // gigabytes of canvas if a sysop scrolls to the end, and the cards never
    // release what they have drawn.
    const perCard = bytes(canvasPixelSize(80, 25, 0.28, 2));

    expect(perCard * 872).toBeLessThan(512 * MEGABYTE);
  });

  it('still draws a full-size screen at full size', () => {
    const full = canvasPixelSize(80, 25, 1, 1);

    expect(full.width).toBe(80 * CELL_WIDTH);
    expect(full.height).toBe(25 * CELL_HEIGHT);
    expect(full.ratio).toBe(1);
  });

  it('never asks for a zero-pixel canvas', () => {
    // An empty screen and a very small scale both reach zero by rounding, and
    // a canvas of width 0 throws in some browsers.
    expect(canvasPixelSize(0, 0, 1, 1)).toMatchObject({ width: 1, height: 1 });
    expect(canvasPixelSize(80, 25, 0.001, 1).width).toBeGreaterThanOrEqual(1);
  });
});
