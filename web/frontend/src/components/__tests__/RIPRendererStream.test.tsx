/**
 * The renderer against the REAL vendored RIPtermJS, live-stream path.
 *
 * "the entire browser goes black" (sysop, localhost, 2026-09-01): the
 * wrapper borrowed RIPterm's play(), and play()'s first run does
 * reloadStream() -> releaseStream() -> stream.cancel() on the very stream
 * the wrapper enqueues into. The pending-content flush then throws
 * "Cannot enqueue a chunk into a closed readable stream", the catch logs
 * "[RIP] RIPtermJS failed to start", and the black canvas overlay never
 * paints anything again. play()/reset() are the vendor's file/url replay
 * API; a live stream needs the wrapper to run the session itself.
 *
 * Only initFonts is stubbed (network); everything else is the real
 * engine, drawing into its real byte buffer through a fake 2D context.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';
import { RIPterm } from '@amiexpress/terminal/rip/vendor/ripterm';
import RIPRenderer from '@amiexpress/terminal/rip/RIPRenderer';
import type { RIPRendererRef } from '@amiexpress/terminal/rip/RIPRenderer';

// node's TextDecoder refuses the browser-only 'x-user-defined' encoding
// the RIPterm constructor asks for; one byte = one char is what it means.
class ByteDecoder {
  decode(buf: Uint8Array): string {
    let s = '';
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return s;
  }
}
(globalThis as any).TextDecoder = ByteDecoder;

function fakeCtx(canvas: HTMLCanvasElement) {
  const real: Record<string, unknown> = {
    canvas,
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData: () => undefined,
  };
  return new Proxy(real, {
    get: (t, p) => (p in t ? t[p as string] : () => undefined),
  }) as unknown as CanvasRenderingContext2D;
}

const proto = (RIPterm as any).prototype;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return fakeCtx(this);
  });
  vi.spyOn(proto, 'initFonts').mockResolvedValue(undefined); // network only
  warnSpy = vi.spyOn(console, 'warn');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function failedToStart(): boolean {
  return warnSpy.mock.calls.some((c) => String(c[0]).includes('RIPtermJS failed to start'));
}

describe('RIPRenderer on a live stream (real RIPtermJS)', () => {
  it('starts and consumes content queued before the fonts loaded, without killing its own stream', async () => {
    const ref = React.createRef<RIPRendererRef>();
    render(<RIPRenderer ref={ref} />);
    // Arrives in the same tick as the mount, like the door's first chunk.
    ref.current?.render('!|*|c05|B0A0A1E1E\n');

    const playSpy = vi.spyOn(proto, 'playStream');
    await waitFor(() => expect(playSpy).toHaveBeenCalled(), { timeout: 3000 });
    // The regression: play() cancelled the stream and this warn fired.
    expect(failedToStart()).toBe(false);
  });

  it('keeps drawing after a reset() between pictures', async () => {
    const ref = React.createRef<RIPRendererRef>();
    render(<RIPRenderer ref={ref} />);
    ref.current?.render('!|*|c05|B0A0A1E1E\n');
    const playSpy = vi.spyOn(proto, 'playStream');
    await waitFor(() => expect(playSpy).toHaveBeenCalled(), { timeout: 3000 });

    // New picture, the way BBSTerminal does it when rip mode re-arms.
    ref.current?.reset();
    const ran = vi.spyOn(proto, 'runRIPcmd');
    expect(() => ref.current?.render('!|c0A|B05051414\n')).not.toThrow();
    // The engine must still be consuming the stream: the new picture's
    // commands actually execute rather than piling up unread.
    await waitFor(() => {
      expect(ran.mock.calls.some((c) => c[0] === 'B')).toBe(true);
    }, { timeout: 3000 });
    expect(failedToStart()).toBe(false);
  });
});
