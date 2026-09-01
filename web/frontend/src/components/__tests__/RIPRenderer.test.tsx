/**
 * "RIP shows black images" on the live board (2026-09-01).
 *
 * RIPtermJS's BGI draws every command into an offscreen ImageData buffer.
 * The only thing that copies that buffer onto the visible canvas is
 * bgi.refresh(), on a timer that play() starts. The wrapper once called
 * playStream() directly: every command in the picture ran, the buffer
 * filled, nothing was ever painted. This pins the wrapper to play().
 *
 * RIPtermJS itself is not under test - it needs a 2D context and browser
 * text encodings jsdom does not have - so the vendored module is replaced
 * by a class that records what the wrapper asks of it. play() records and
 * returns, so a playStream() call seen here is the wrapper bypassing the
 * refresh loop, never play() doing its own job.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';
import RIPRenderer from '@amiexpress/terminal/rip/RIPRenderer';
import type { RIPRendererRef } from '@amiexpress/terminal/rip/RIPRenderer';

const seen = vi.hoisted(() => ({
  play: vi.fn(),
  playStream: vi.fn(),
  streams: [] as ReadableStream<Uint8Array>[],
}));

vi.mock('@amiexpress/terminal/rip/vendor/ripterm', () => ({
  RIPterm: class FakeRIPterm {
    onHostCommand?: (text: string) => void;
    async initFonts(): Promise<void> {}
    async setupStream(stream: ReadableStream<Uint8Array>): Promise<void> {
      seen.streams.push(stream);
    }
    async play(): Promise<void> {
      seen.play();
    }
    async playStream(): Promise<boolean> {
      seen.playStream();
      return false;
    }
    async stop(): Promise<void> {}
    clear(): void {}
    async reset(): Promise<void> {}
  },
}));

beforeEach(() => {
  cleanup();
  seen.play.mockClear();
  seen.playStream.mockClear();
  seen.streams.length = 0;
});

describe('RIPRenderer starting RIPtermJS', () => {
  it('calls play(), which owns the refresh timer, not playStream() directly', async () => {
    render(<RIPRenderer />);

    await waitFor(() => expect(seen.play).toHaveBeenCalledTimes(1));
    expect(seen.playStream).not.toHaveBeenCalled();
  });

  it('delivers RIP text that arrived before the fonts loaded, once play() has run', async () => {
    const ref = React.createRef<RIPRendererRef>();

    render(<RIPRenderer ref={ref} />);
    // Same tick as the mount - long before initFonts() resolves.
    ref.current?.render('!|*');

    await waitFor(() => expect(seen.play).toHaveBeenCalledTimes(1));

    expect(seen.streams).toHaveLength(1);
    const { value } = await seen.streams[0].getReader().read();
    expect(Array.from(value ?? [])).toEqual([0x21, 0x7c, 0x2a]);
  });
});
