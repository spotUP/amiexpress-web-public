/**
 * Alt+Enter's other half.
 *
 * The door widens itself; the page has to leave the browser's chrome behind
 * or the extra columns are not there to be had. It must happen on the KEY -
 * requestFullscreen is only granted inside a user gesture, so reacting to the
 * door's terminal-mode socket event instead would be rejected by the browser.
 */

import { describe, it, expect, vi } from 'vitest';
import { toggleFullscreen, isFullscreen, type FullscreenDocument } from '@amiexpress/terminal';

function fakeDocument(overrides: Partial<FullscreenDocument> = {}): FullscreenDocument {
  return {
    fullscreenElement: null,
    exitFullscreen: vi.fn(() => Promise.resolve()),
    documentElement: { requestFullscreen: vi.fn(() => Promise.resolve()) },
    ...overrides,
  };
}

describe('toggleFullscreen', () => {
  it('asks for fullscreen when the page is not fullscreen', () => {
    const doc = fakeDocument();
    expect(toggleFullscreen(doc)).toBe(true);
    expect(doc.documentElement!.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
  });

  it('leaves fullscreen when the page is already there', () => {
    const doc = fakeDocument({ fullscreenElement: {} as Element });
    expect(toggleFullscreen(doc)).toBe(true);
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(doc.documentElement!.requestFullscreen).not.toHaveBeenCalled();
  });

  it('reads and uses the WebKit spellings', () => {
    const enter = vi.fn();
    const doc: FullscreenDocument = {
      webkitFullscreenElement: null,
      documentElement: { webkitRequestFullscreen: enter },
    };
    expect(toggleFullscreen(doc)).toBe(true);
    expect(enter).toHaveBeenCalledTimes(1);

    const exit = vi.fn();
    const showing: FullscreenDocument = {
      webkitFullscreenElement: {} as Element,
      webkitExitFullscreen: exit,
    };
    expect(isFullscreen(showing)).toBe(true);
    expect(toggleFullscreen(showing)).toBe(true);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('says no rather than throwing where the browser has neither spelling', () => {
    // iOS Safari refuses fullscreen on anything but a video. The door's own
    // size toggle still runs; only the window stays as it is.
    expect(toggleFullscreen({ documentElement: {} })).toBe(false);
    expect(toggleFullscreen({ fullscreenElement: {} as Element })).toBe(false);
  });

  it('swallows a rejected request instead of leaving it unhandled', () => {
    // The promise rejects whenever the gesture is not accepted; an unhandled
    // rejection inside a keydown handler is noise, not information.
    const doc = fakeDocument({
      documentElement: { requestFullscreen: () => Promise.reject(new Error('denied')) },
    });
    expect(() => toggleFullscreen(doc)).not.toThrow();
  });

  it('can be pointed at an element other than the document', () => {
    const target = { requestFullscreen: vi.fn(() => Promise.resolve()) };
    const doc = fakeDocument();
    expect(toggleFullscreen(doc, target)).toBe(true);
    expect(target.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(doc.documentElement!.requestFullscreen).not.toHaveBeenCalled();
  });
});
