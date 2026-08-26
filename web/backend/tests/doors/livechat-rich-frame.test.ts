/**
 * The render mode belongs to the viewer, not the sender.
 *
 * Each mode used to have its own cell format - half-block packs two palette
 * colours, braille packs eight mono dots, coloured ASCII packs a ramp step
 * - and none converts to another. So the SENDER chose, one broadcast could
 * only be drawn one way, and cycling the mode changed what other people saw
 * of you rather than what you saw of them. With the self-view gone, the
 * person pressing the key saw nothing happen at all.
 *
 * Sending both planes makes every mode derivable from the same frame.
 */

import {
  richCells,
  richToTags,
  fitRichToTile,
  MODE_HALFBLOCK,
  MODE_BRAILLE,
  MODE_ASCII,
  MODE_ASCII_COLOR,
  type RichFrame,
} from '../../../../Doors/livechat/video-cells';
import {
  encodeRichFrame,
  decodeRichFrame,
  isRichPacket,
} from '../../../../Doors/livechat/video-codec';

const W = 12;
const H = 6;

/** Braille resolution: two pixels across, four down, per cell. */
function picture(t: number) {
  const pw = W * 2;
  const ph = H * 4;
  const data = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4;
      const cx = pw / 2 + Math.sin(t / 3) * 4;
      const bright = Math.hypot(x - cx, y - ph / 2) < 6;
      data[i] = bright ? 230 : 20;
      data[i + 1] = bright ? 140 : 20;
      data[i + 2] = bright ? 120 : 60;
      data[i + 3] = 255;
    }
  }
  return { data, width: pw, height: ph };
}

function plain(text: string): string {
  return text.replace(/\{[^}]*\}/g, '');
}

describe('rich frames', () => {
  it('reads only pixels that exist', () => {
    // The encoder samples a 2x4 grid per cell, so the canvas must be sized
    // for THAT grid. It used to be sized per render mode - 1x2 for
    // half-block - and sampling 2x4 from a 1x2 buffer runs off the end of
    // every row. Undefined pixels read as 0, and the picture arrived as
    // horizontal streaks (screenshot 2026-08-26).
    //
    // A buffer of the RIGHT size produces no zero-luminance artefacts from
    // a uniformly bright picture.
    const pw = W * 2;
    const ph = H * 4;
    const data = new Uint8ClampedArray(pw * ph * 4);
    data.fill(255);

    const frame = richCells({ data, width: pw, height: ph } as any, W, H);

    // Every cell fully lit: all eight dots set, nothing sampled off the end.
    expect(Array.from(frame.dots).every(v => v === 0xff)).toBe(true);
  });

  it('produces both planes, one byte each per cell', () => {
    const frame = richCells(picture(0) as any, W, H);

    expect(frame.dots.length).toBe(W * H);
    expect(frame.colors.length).toBe(W * H);
  });

  describe('every mode from one frame', () => {
    const frame = richCells(picture(0) as any, W, H);

    it('draws half-blocks with colour', () => {
      const drawn = richToTags(frame, W, H, MODE_HALFBLOCK);
      expect(drawn).toContain('▀');
      expect(drawn).toContain('-fg}');
      expect(drawn).toContain('-bg}');
    });

    it('draws braille from the dot plane', () => {
      const drawn = plain(richToTags(frame, W, H, MODE_BRAILLE));
      for (const ch of drawn.replace(/\n/g, '')) {
        expect(ch.charCodeAt(0)).toBeGreaterThanOrEqual(0x2800);
        expect(ch.charCodeAt(0)).toBeLessThanOrEqual(0x28ff);
      }
    });

    it('draws plain ascii with no colour at all', () => {
      const drawn = richToTags(frame, W, H, MODE_ASCII);
      expect(drawn).not.toContain('-fg}');
      expect(drawn).toMatch(/[ .:\-=+*#%@]/);
    });

    it('draws coloured ascii with colour but no background', () => {
      const drawn = richToTags(frame, W, H, MODE_ASCII_COLOR);
      expect(drawn).toContain('-fg}');
      expect(drawn).not.toContain('-bg}');
    });

    it('gives every mode the same shape', () => {
      for (const mode of [MODE_HALFBLOCK, MODE_BRAILLE, MODE_ASCII, MODE_ASCII_COLOR]) {
        const rows = richToTags(frame, W, H, mode).split('\n');
        expect(rows).toHaveLength(H);
        for (const row of rows) expect(plain(row)).toHaveLength(W);
      }
    });

    it('makes the modes actually look different', () => {
      // If two modes render identically the feature is decorative.
      const seen = new Set([
        plain(richToTags(frame, W, H, MODE_HALFBLOCK)),
        plain(richToTags(frame, W, H, MODE_BRAILLE)),
        plain(richToTags(frame, W, H, MODE_ASCII)),
      ]);
      expect(seen.size).toBe(3);
    });
  });

  describe('on the wire', () => {
    it('round-trips both planes', () => {
      const frame = richCells(picture(1) as any, W, H);
      const decoded = decodeRichFrame(encodeRichFrame(frame, W, H));

      expect(decoded).not.toBeNull();
      expect(Array.from(decoded!.frame.dots)).toEqual(Array.from(frame.dots));
      expect(Array.from(decoded!.frame.colors)).toEqual(Array.from(frame.colors));
    });

    it('marks itself as carrying both planes', () => {
      expect(isRichPacket(encodeRichFrame(richCells(picture(2) as any, W, H), W, H))).toBe(true);
    });

    it('sends almost nothing when the picture is still', () => {
      const frame = richCells(picture(3) as any, W, H);
      const packet = encodeRichFrame(frame, W, H, frame);

      expect(packet.byteLength).toBeLessThan(30);
    });

    it('reconstructs a moved picture from a delta', () => {
      const before = richCells(picture(4) as any, W, H);
      const after = richCells(picture(7) as any, W, H);

      const decoded = decodeRichFrame(encodeRichFrame(after, W, H, before), before);

      expect(Array.from(decoded!.frame.dots)).toEqual(Array.from(after.dots));
      expect(Array.from(decoded!.frame.colors)).toEqual(Array.from(after.colors));
    });

    it('refuses a delta with no base rather than drawing rubbish', () => {
      const frame = richCells(picture(5) as any, W, H);
      expect(decodeRichFrame(encodeRichFrame(frame, W, H, frame), null)).toBeNull();
    });

    it('decodes from a pooled view, as the server hands it over', () => {
      const frame = richCells(picture(6) as any, W, H);
      const packet = new Uint8Array(encodeRichFrame(frame, W, H));
      const pool = new Uint8Array(8192);
      pool.set(packet, 333);

      const decoded = decodeRichFrame(new Uint8Array(pool.buffer, 333, packet.length));
      expect(decoded).not.toBeNull();
      expect(Array.from(decoded!.frame.dots)).toEqual(Array.from(frame.dots));
    });

    it('stays cheap despite carrying two planes', () => {
      // Two bytes a cell against the markup's twenty-four per colour change.
      const frame = richCells(picture(8) as any, W, H);
      const packet = encodeRichFrame(frame, W, H);
      const markup = richToTags(frame, W, H, MODE_HALFBLOCK);

      expect(packet.byteLength).toBeLessThan(markup.length);
    });
  });

  describe('scaling', () => {
    it('scales both planes together', () => {
      const frame: RichFrame = richCells(picture(9) as any, W, H);
      const scaled = fitRichToTile(frame, W, H, W * 2, H * 2);

      expect(scaled.dots.length).toBe(W * 2 * H * 2);
      expect(scaled.colors.length).toBe(W * 2 * H * 2);
    });

    it('still draws a full tile after scaling', () => {
      const frame = richCells(picture(10) as any, W, H);
      const scaled = fitRichToTile(frame, W, H, 30, 14);
      const rows = richToTags(scaled, 30, 14, MODE_HALFBLOCK).split('\n');

      expect(rows).toHaveLength(14);
      for (const row of rows) expect(plain(row)).toHaveLength(30);
    });
  });
});
