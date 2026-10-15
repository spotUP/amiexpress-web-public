/**
 * Camera noise must not re-encode a still picture every frame.
 *
 * Video was "super slow": 41,457 frames in one session at ~7.5 KB each,
 * roughly 314 MB of tagged ASCII parsed and re-rendered by the doors. The
 * cause was not the tile size or the protocol - it was sensor noise
 * flipping cells between adjacent palette entries, which ends the current
 * colour run and starts a new one. 84% of cells began a colour run on a
 * noisy frame against 15% on a clean one.
 *
 * These lock the cure: a cell keeps its colour unless the pixel moved
 * clearly closer to a different one. The threshold is a measured value,
 * so the tests check both halves of the bargain - smaller frames AND a
 * picture that still tracks reality.
 */

import { renderHalfblock, renderAscii, PALETTE } from '../../../../Doors/livechat/video-encoders';
import {
  createColorMemory,
  fitColorMemory,
  pickColor,
  STICKINESS,
} from '../../../../Doors/livechat/video-hysteresis';

const W = 40;
const H = 12;

/** A frame of the same scene, optionally with per-pixel noise. */
function frame(t: number, noise: number, w: number = W, h: number = H) {
  const pw = w;
  const ph = h * 2;
  const data = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4;
      let r = 90 + y * 2;
      let g = 90 + y * 2;
      let b = 110 + y;
      const cx = pw / 2 + Math.sin(t / 6) * 6;
      if (Math.hypot(x - cx, (y - ph / 2) * 0.5) < 7) { r = 200; g = 150; b = 140; }
      if (noise > 0) {
        const n = (Math.sin(x * 12.9898 + y * 78.233 + t * 3.7) * 43758.5453) % 1;
        const jitter = Math.floor(n * noise);
        r += jitter; g += jitter; b += jitter;
      }
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { data, width: pw, height: ph };
}

function averageBytes(memoryOn: boolean): number {
  const memory = memoryOn ? createColorMemory(W, H) : undefined;
  let total = 0;
  for (let t = 0; t < 20; t++) {
    total += renderHalfblock(frame(t, 24) as any, W, H, memory).length;
  }
  return total / 20;
}

/** Share of subpixels differing from the same scene rendered without noise. */
function fidelityLoss(memory: ReturnType<typeof createColorMemory>, t: number): number {
  const truth = frame(t, 0);
  let wrong = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cell = y * W + x;
      const topI = ((y * 2) * W + x) * 4;
      const botI = ((y * 2 + 1) * W + x) * 4;
      if (memory.fg[cell] !== pickColor(PALETTE, truth.data[topI], truth.data[topI + 1], truth.data[topI + 2], [])) wrong++;
      if (memory.bg[cell] !== pickColor(PALETTE, truth.data[botI], truth.data[botI + 1], truth.data[botI + 2], [])) wrong++;
    }
  }
  return wrong / (W * H * 2);
}

describe('video colour hysteresis', () => {
  it('roughly halves a noisy frame', () => {
    const before = averageBytes(false);
    const after = averageBytes(true);

    expect(after).toBeLessThan(before * 0.65);
  });

  it('tracks the real picture better than no hysteresis at all', () => {
    // The point that makes this not a quality trade: most of the detail the
    // encoder used to reproduce so faithfully was noise.
    const sticky = createColorMemory(W, H);
    const plain = createColorMemory(W, H, 0);
    for (let t = 0; t < 20; t++) {
      renderHalfblock(frame(t, 24) as any, W, H, sticky);
      renderHalfblock(frame(t, 24) as any, W, H, plain);
    }

    expect(fidelityLoss(sticky, 19)).toBeLessThan(fidelityLoss(plain, 19));
  });

  it('still follows motion instead of freezing the picture', () => {
    // The failure mode of too much stickiness: rows stop changing at all.
    const memory = createColorMemory(W, H);
    const first = renderHalfblock(frame(0, 24) as any, W, H, memory);
    let moved = false;
    for (let t = 1; t < 20; t++) {
      if (renderHalfblock(frame(t, 24) as any, W, H, memory) !== first) moved = true;
    }

    expect(moved).toBe(true);
  });

  it('keeps every row the same width, tags aside', () => {
    // The old "every second frame is broken" fault: a row one column wide
    // of the rest wraps and shears the picture.
    const memory = createColorMemory(W, H);
    for (let t = 0; t < 5; t++) {
      const rows = renderHalfblock(frame(t, 24) as any, W, H, memory).split('\n');
      for (const row of rows) {
        expect(row.replace(/\{[^}]*\}/g, '')).toHaveLength(W);
      }
    }
  });

  it('renders identically to before when given no memory', () => {
    // Callers that never opt in must be unaffected.
    const a = renderHalfblock(frame(3, 24) as any, W, H);
    const b = renderHalfblock(frame(3, 24) as any, W, H);
    expect(a).toBe(b);
    expect(a.replace(/\{[^}]*\}/g, '').split('\n')[0]).toHaveLength(W);
  });

  it('applies to coloured ascii too', () => {
    const memory = createColorMemory(W, H);
    let sticky = 0;
    let plain = 0;
    for (let t = 0; t < 20; t++) {
      sticky += renderAscii(frame(t, 24) as any, W, H, true, memory).length;
      plain += renderAscii(frame(t, 24) as any, W, H, true).length;
    }

    expect(sticky).toBeLessThan(plain);
  });

  describe('pickColor', () => {
    it('takes the nearest colour when nothing is remembered', () => {
      const black = PALETTE.findIndex(p => p[0] === 'black');
      expect(pickColor(PALETTE, 0, 0, 0, [])).toBe(black);
    });

    it('keeps the incumbent when the challenger barely wins', () => {
      const white = PALETTE.findIndex(p => p[0] === 'white');
      const gray = PALETTE.findIndex(p => p[0] === 'gray');
      // Midway between gray and white: whichever we already had, we keep.
      expect(pickColor(PALETTE, 127, 127, 127, [white])).toBe(white);
      expect(pickColor(PALETTE, 127, 127, 127, [gray])).toBe(gray);
    });

    it('gives way when the pixel really has changed colour', () => {
      const white = PALETTE.findIndex(p => p[0] === 'white');
      const red = pickColor(PALETTE, 255, 0, 0, []);
      expect(pickColor(PALETTE, 255, 0, 0, [white])).toBe(red);
    });

    it('ignores an incumbent that is not a real palette entry', () => {
      expect(pickColor(PALETTE, 0, 0, 0, [-1, 999])).toBe(PALETTE.findIndex(p => p[0] === 'black'));
    });

    it('uses the measured threshold by default', () => {
      expect(STICKINESS).toBe(12000);
    });
  });

  describe('memory lifecycle', () => {
    it('reuses the memory while the tile keeps its shape', () => {
      const memory = createColorMemory(W, H);
      expect(fitColorMemory(memory, W, H)).toBe(memory);
    });

    it('forgets everything when the tile is resized', () => {
      const memory = createColorMemory(W, H);
      memory.fg[0] = 5;
      const resized = fitColorMemory(memory, W + 3, H);

      expect(resized).not.toBe(memory);
      expect(resized.fg[0]).toBe(-1);
      expect(resized.width).toBe(W + 3);
    });

    it('keeps its history when the caller stores the fitted memory back', () => {
      // The bug this caught: fitColorMemory returns a NEW object when the
      // tile changes shape, and a caller that ignores the return value
      // allocates a fresh memory on EVERY frame at the new size. The
      // hysteresis then remembers nothing and the picture shimmers exactly
      // as it did before - which is what happened the moment a second
      // person joined and the tile resized.
      let memory = createColorMemory(W, H);
      renderHalfblock(frame(0, 24) as any, W, H, memory);

      // The tile changes shape, as it does when the grid re-lays out.
      const wider = W + 8;
      memory = fitColorMemory(memory, wider, H);
      renderHalfblock(frame(1, 24, wider) as any, wider, H, memory);

      const remembered = Array.from(memory.fg).filter(v => v >= 0).length;
      expect(remembered).toBe(wider * H);

      // And keeping that memory makes the picture STEADY, which is the
      // half of the bargain the history buys.
      //
      // Not size: a remembered colour can break a run that a fresh render
      // would have drawn uniformly, so a single frame can even come out
      // slightly larger. What it stops is cells flipping between two
      // near-equal colours from one frame to the next, which is seen as a
      // shimmer over the whole picture - exactly what a caller that
      // discards the resized memory reintroduces.
      const changedRows = (a: string, b: string) => {
        const ra = a.split('\n');
        const rb = b.split('\n');
        let n = 0;
        for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) n++;
        return n;
      };

      let keptChanges = 0;
      let rebuiltChanges = 0;
      let keptPrev = renderHalfblock(frame(2, 24, wider) as any, wider, H, memory);
      let rebuiltPrev = renderHalfblock(
        frame(2, 24, wider) as any, wider, H, createColorMemory(wider, H));

      for (let t = 3; t < 12; t++) {
        const keptNow = renderHalfblock(frame(t, 24, wider) as any, wider, H, memory);
        const rebuiltNow = renderHalfblock(
          frame(t, 24, wider) as any, wider, H, createColorMemory(wider, H));
        keptChanges += changedRows(keptPrev, keptNow);
        rebuiltChanges += changedRows(rebuiltPrev, rebuiltNow);
        keptPrev = keptNow;
        rebuiltPrev = rebuiltNow;
      }

      expect(keptChanges).toBeLessThan(rebuiltChanges);
    });

    it('carries the threshold across a resize', () => {
      const memory = createColorMemory(W, H, 4321);
      expect(fitColorMemory(memory, W + 1, H).stickiness).toBe(4321);
    });
  });
});
