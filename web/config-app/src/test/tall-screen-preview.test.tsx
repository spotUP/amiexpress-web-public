/**
 * A 3,019-line file must not become a 3,019-row canvas.
 *
 * Reported twice: "/admin/screens still freeze the browser on live site". The
 * first fix - drawing thumbnails at thumbnail size instead of shrinking a full
 * editor canvas with CSS - was live and the page still froze, because the size
 * of a thumbnail was never the only problem.
 *
 * The other half was a regression of mine. The ANSI loader used to stop at the
 * row count SAUCE declares; that truncation DELETED the MCI codes that sit
 * below the art when a screen was saved, so the cap had to go. But this board
 * keeps ordinary text under its screen directories - BBSHelp.txt is 430 lines,
 * a vendored changelog 3,019 - and without a cap a preview of one asks for a
 * canvas 96,608 pixels tall. Browsers refuse past about 32,767 and the tab
 * stops responding.
 *
 * So the EDITOR still sees every row - that is the bug it exists to fix - and
 * a PREVIEW draws the first screenful.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { canvasPixelSize } from '../components/ansi-canvas-paint';
import { ScreenArt } from '../components/ScreenArt';
import { firstRows, screenToCanvas } from '../pages/screen-bytes';

// Chunked: spreading a megabyte of bytes into fromCharCode blows the stack,
// which is a fact about the test helper and not about the code under test.
const b64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
};
const lines = (count: number) => Array.from({ length: count }, (_, i) => `line ${i}`).join('\r\n');
const tall = b64(lines(3019));

describe('the pixels a tall file would cost', () => {
  it('is past what a browser will allocate, at full size', () => {
    // The file panel draws at scale 1: 3,019 rows x 16px x 2 for the display
    // is 96,608 pixels tall, and browsers refuse a canvas dimension past about
    // 32,767 - the preview comes back blank or takes the tab down with it.
    const uncapped = canvasPixelSize(80, 3019, 1, 2);

    expect(uncapped.height).toBeGreaterThan(32_767);
  });

  it('is tens of megabytes a card, at thumbnail size', () => {
    // Within the dimension limit and nowhere near affordable: one card of a
    // 3,019-line file is 38 MB, and the gallery draws seventy cards.
    const thumbnail = canvasPixelSize(80, 3019, 0.28, 2);

    expect(thumbnail.width * thumbnail.height * 4).toBeGreaterThan(30_000_000);
  });

  it('is ordinary once a preview draws one screenful', () => {
    const capped = canvasPixelSize(80, 25, 0.28, 2);

    expect(capped.height).toBeLessThan(300);
    expect(capped.width * capped.height * 4).toBeLessThan(400_000);
  });
});

describe('a preview of an ENORMOUS file', () => {
  it('parses a screenful, not a million lines', async () => {
    /*
     * The one that actually froze the page: this board keeps a 68klog.txt of
     * 992,732 lines under its screen directories, indexed as ordinary
     * drawable art. Slicing the CANVAS afterwards was far too late - parsing
     * builds roughly 79 million cell objects first, and the tab is gone
     * before anything asks for pixels.
     *
     * A tenth of the real file, and it still has to finish quickly.
     */
    // Counted in BYTES: firstRows is what keeps the parse affordable, and it
    // is the piece that has to be right - `content` is base64, so a
    // truncation that searched the STRING for a newline found none and did
    // nothing at all.
    const enormous = new TextEncoder().encode(lines(100_000));

    expect(firstRows(enormous, 25).length).toBeLessThan(enormous.length / 1000);

    const started = Date.now();
    const canvas = await screenToCanvas(b64(lines(100_000)), 25);

    expect(canvas.length).toBeLessThanOrEqual(26);
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it('parses the whole thing when no limit is given', async () => {
    // The editor's contract: every row, because the codes live below the art.
    const canvas = await screenToCanvas(b64(lines(400)));

    expect(canvas.length).toBeGreaterThanOrEqual(400);
  });
});

describe('a preview of a very long file', () => {
  it('draws 25 rows, not three thousand', async () => {
    render(<ScreenArt content={tall} scale={0.28} maxRows={25} />);

    const canvas = await screen.findByTestId('ansi-canvas');
    await waitFor(() => expect(canvas.getAttribute('data-rows')).toBe('25'));
  });

  it('draws every row when no limit is given, which is what the editor needs', async () => {
    // The whole point of removing SAUCE's cap: codes live below the art, and
    // an editor that cannot see them deletes them on save.
    render(<ScreenArt content={b64('one\r\ntwo\r\nthree')} />);

    const canvas = await screen.findByTestId('ansi-canvas');
    await waitFor(() => expect(Number(canvas.getAttribute('data-rows'))).toBeGreaterThanOrEqual(3));
  });
});
