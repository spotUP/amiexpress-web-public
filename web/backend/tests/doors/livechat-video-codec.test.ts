/**
 * The compact frame format.
 *
 * Frames used to travel as blessed markup - `{lightgreen-fg}{gray-bg}▀▀▀{/}`
 * - which costs twenty-four bytes every time the colour changes, for a
 * picture drawn from sixteen colours. A 146x46 tile came to 21 KB a frame,
 * and because the client paces itself against a byte budget, that was two
 * frames a second.
 *
 * One byte per cell, run-length encoded, with unchanged stretches skipped
 * against the previous frame.
 */

import {
  encodeFrame,
  decodeFrame,
  isDeltaPacket,
  isKeyframeDue,
  CODEC_VERSION,
  KEYFRAME_INTERVAL,
} from '../../../../Doors/livechat/video-codec';
import {
  cellsToTags,
  MODE_HALFBLOCK,
  MODE_BRAILLE,
  MODE_ASCII,
} from '../../../../Doors/livechat/video-cells';

const W = 16;
const H = 8;

function flat(value: number): Uint8Array {
  return new Uint8Array(W * H).fill(value);
}

function noisy(seed: number): Uint8Array {
  const out = new Uint8Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = (i * 7 + seed * 13) % 256;
  return out;
}

describe('video codec', () => {
  describe('full frames', () => {
    it('round-trips a frame exactly', () => {
      const cells = noisy(1);
      const decoded = decodeFrame(encodeFrame(cells, W, H, MODE_HALFBLOCK));

      expect(decoded).not.toBeNull();
      expect(Array.from(decoded!.cells)).toEqual(Array.from(cells));
      expect(decoded!.width).toBe(W);
      expect(decoded!.height).toBe(H);
      expect(decoded!.mode).toBe(MODE_HALFBLOCK);
      expect(decoded!.isDelta).toBe(false);
    });

    it('crushes a flat picture to almost nothing', () => {
      // 128 cells of one colour: a handful of run tokens, not 128 bytes.
      const packet = encodeFrame(flat(0x5a), W, H, MODE_HALFBLOCK);
      expect(packet.byteLength).toBeLessThan(20);
    });

    it('beats the markup it replaces, badly', () => {
      const cells = noisy(3);
      const markup = cellsToTags(cells, W, H, MODE_HALFBLOCK);
      const packet = encodeFrame(cells, W, H, MODE_HALFBLOCK);

      expect(packet.byteLength).toBeLessThan(markup.length / 2);
    });

    it('carries the render mode, so the receiver draws the right thing', () => {
      for (const mode of [MODE_HALFBLOCK, MODE_ASCII, MODE_BRAILLE]) {
        expect(decodeFrame(encodeFrame(noisy(2), W, H, mode))!.mode).toBe(mode);
      }
    });
  });

  describe('deltas', () => {
    it('sends almost nothing when nothing moved', () => {
      const cells = noisy(4);
      const packet = encodeFrame(cells, W, H, MODE_HALFBLOCK, cells);

      expect(isDeltaPacket(packet)).toBe(true);
      expect(packet.byteLength).toBeLessThan(20);
    });

    it('reconstructs the new frame from the old one', () => {
      const before = noisy(5);
      const after = noisy(5);
      after[10] = 0xff;
      after[11] = 0xff;
      after[80] = 0x01;

      const decoded = decodeFrame(encodeFrame(after, W, H, MODE_HALFBLOCK, before), before);

      expect(Array.from(decoded!.cells)).toEqual(Array.from(after));
    });

    it('costs far less than the full frame it describes', () => {
      const before = noisy(6);
      const after = new Uint8Array(before);
      for (let i = 40; i < 48; i++) after[i] = 0x33;

      const full = encodeFrame(after, W, H, MODE_HALFBLOCK);
      const delta = encodeFrame(after, W, H, MODE_HALFBLOCK, before);

      expect(delta.byteLength).toBeLessThan(full.byteLength / 2);
    });

    it('sends a full frame when there is nothing to compare against', () => {
      expect(isDeltaPacket(encodeFrame(noisy(7), W, H, MODE_HALFBLOCK, null))).toBe(false);
    });

    it('sends a full frame when the picture changed size', () => {
      // A delta against a different-sized frame would be nonsense; the
      // encoder must notice rather than produce garbage.
      const previous = new Uint8Array(W * H);
      const packet = encodeFrame(new Uint8Array(W * 2 * H), W * 2, H, MODE_HALFBLOCK, previous);

      expect(isDeltaPacket(packet)).toBe(false);
    });
  });

  describe('refusing to draw rubbish', () => {
    it('rejects a delta it has no previous frame for', () => {
      const cells = noisy(8);
      const packet = encodeFrame(cells, W, H, MODE_HALFBLOCK, cells);

      expect(decodeFrame(packet, null)).toBeNull();
    });

    it('rejects a delta against a frame of the wrong size', () => {
      const cells = noisy(9);
      const packet = encodeFrame(cells, W, H, MODE_HALFBLOCK, cells);

      expect(decodeFrame(packet, new Uint8Array(4))).toBeNull();
    });

    it('rejects a version it does not know', () => {
      const packet = encodeFrame(noisy(10), W, H, MODE_HALFBLOCK);
      const tampered = new Uint8Array(packet);
      tampered[0] = CODEC_VERSION + 9;

      expect(decodeFrame(tampered.buffer)).toBeNull();
    });

    it('rejects a truncated packet', () => {
      const packet = encodeFrame(noisy(11), W, H, MODE_HALFBLOCK);

      expect(decodeFrame(packet.slice(0, 4))).toBeNull();
    });

    it('rejects an unknown opcode instead of guessing', () => {
      const packet = encodeFrame(noisy(12), W, H, MODE_HALFBLOCK);
      const tampered = new Uint8Array(packet);
      tampered[8] = 99;

      expect(decodeFrame(tampered.buffer)).toBeNull();
    });

    it('rejects a frame with no size', () => {
      const packet = encodeFrame(new Uint8Array(0), 0, 0, MODE_HALFBLOCK);
      expect(decodeFrame(packet)).toBeNull();
    });
  });

  describe('keyframes, so a receiver can always recover', () => {
    it('demands a full frame first', () => {
      expect(isKeyframeDue(0)).toBe(true);
    });

    it('does not demand one for every frame in between', () => {
      expect(isKeyframeDue(1)).toBe(false);
      expect(isKeyframeDue(KEYFRAME_INTERVAL - 1)).toBe(false);
    });

    it('demands one again after the interval', () => {
      expect(isKeyframeDue(KEYFRAME_INTERVAL)).toBe(true);
      expect(isKeyframeDue(KEYFRAME_INTERVAL + 5)).toBe(true);
    });

    it('repairs a receiver whose picture has drifted', () => {
      // The reported symptom: a viewer applying deltas to the wrong base
      // keeps showing stale cells for ever, because a delta never mentions
      // the cells that did not change. A keyframe describes all of them.
      const truth = noisy(30);
      const drifted = noisy(31);

      const keyframe = encodeFrame(truth, W, H, MODE_HALFBLOCK, null);
      const repaired = decodeFrame(keyframe, drifted);

      expect(Array.from(repaired!.cells)).toEqual(Array.from(truth));
    });

    it('lets a viewer who joined mid-stream start seeing the picture', () => {
      // A delta is refused outright when there is no base; the keyframe
      // that follows is what gets them a picture.
      const cells = noisy(32);
      expect(decodeFrame(encodeFrame(cells, W, H, MODE_HALFBLOCK, cells), null)).toBeNull();
      expect(decodeFrame(encodeFrame(cells, W, H, MODE_HALFBLOCK, null), null)).not.toBeNull();
    });

    it('costs little: one full frame per interval', () => {
      // The price of self-healing, stated so it cannot drift unnoticed.
      const cells = noisy(33);
      const full = encodeFrame(cells, W, H, MODE_HALFBLOCK).byteLength;
      const delta = encodeFrame(cells, W, H, MODE_HALFBLOCK, cells).byteLength;
      const perInterval = full + delta * (KEYFRAME_INTERVAL - 1);

      expect(perInterval / KEYFRAME_INTERVAL).toBeLessThan(full);
    });
  });

  describe('however the bytes arrive', () => {
    it('decodes a Node Buffer-style view into a shared pool', () => {
      // Socket.IO hands the server a Buffer, which is a WINDOW onto a
      // shared pool at some offset. Reading its `.buffer` gives the pool
      // from byte zero - somebody else's data - so every packet decoded as
      // a bad version and the picture never appeared.
      const cells = noisy(20);
      const packet = new Uint8Array(encodeFrame(cells, W, H, MODE_HALFBLOCK));

      const pool = new Uint8Array(4096);
      const offset = 512;
      pool.set(packet, offset);
      const view = new Uint8Array(pool.buffer, offset, packet.length);

      const decoded = decodeFrame(view);
      expect(decoded).not.toBeNull();
      expect(Array.from(decoded!.cells)).toEqual(Array.from(cells));
    });

    it('reads a delta flag off a pooled view too', () => {
      const cells = noisy(21);
      const packet = new Uint8Array(encodeFrame(cells, W, H, MODE_HALFBLOCK, cells));

      const pool = new Uint8Array(2048);
      pool.set(packet, 100);
      const view = new Uint8Array(pool.buffer, 100, packet.length);

      expect(isDeltaPacket(view)).toBe(true);
    });
  });

  describe('what it costs in practice', () => {
    it('sends a moving picture for a fraction of the markup', () => {
      // A subject moving over a still background, which is what a webcam
      // in a chat window actually is.
      const width = 76;
      const height = 24;
      let previous: Uint8Array | null = null;
      let codecBytes = 0;
      let markupBytes = 0;

      for (let t = 0; t < 20; t++) {
        const cells = new Uint8Array(width * height);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const cx = width / 2 + Math.sin(t / 4) * 6;
            cells[y * width + x] = Math.hypot(x - cx, (y - height / 2) * 2) < 8 ? 0xa3 : 0x70;
          }
        }

        codecBytes += encodeFrame(cells, width, height, MODE_HALFBLOCK, previous).byteLength;
        markupBytes += cellsToTags(cells, width, height, MODE_HALFBLOCK).length;
        previous = cells;
      }

      // An order of magnitude, not a few percent.
      expect(codecBytes).toBeLessThan(markupBytes / 10);
    });
  });
});
