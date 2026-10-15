/**
 * End-to-end regression: high-bit Amiga ANSI bytes survive every layer
 * between disk and JS string used by socket.emit('ansi-output', ...).
 *
 * Reported by user 2026-05-03: live BBS rendered `·` (U+00B7) as `��`
 * (two U+FFFD glyphs) on Conf9/Screens/flt.txt and Screens/flt/00X.flt.
 * Unit tests of the decoder showed clean output — this test pins the
 * full server-side pipeline (raw read → iconv decode → UTF-8 wire bytes
 * → JSON round-trip) so any regression at any stage fails here.
 *
 * The remaining mojibake reports must therefore live in the *frontend*
 * pipeline (socket.io receive, modem-emulator chunking, xterm.js write).
 */

import * as fs from 'fs';
import * as path from 'path';
import { readAmigaTextFileWithTransforms } from '../../src/utils/amiga-text-decode.util';

describe('amiga-text-decode end-to-end byte preservation', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');

  function highBitCount(buf: Buffer, byteValue: number): number {
    let n = 0;
    for (let i = 0; i < buf.length; i++) if (buf[i] === byteValue) n++;
    return n;
  }

  function utf8PairCount(buf: Buffer, b1: number, b2: number): number {
    let n = 0;
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i] === b1 && buf[i + 1] === b2) n++;
    }
    return n;
  }

  // Each file we check ships in the repo as Amiga BBS data.
  const cases: Array<{ rel: string; codepoint: number; utf8: [number, number]; rawByte: number }> = [
    {
      rel: 'Conf9/Screens/flt.txt',
      codepoint: 0xb7,         // ·
      utf8: [0xc2, 0xb7],
      rawByte: 0xb7,
    },
    {
      rel: 'Screens/flt/002.flt',
      codepoint: 0xb7,
      utf8: [0xc2, 0xb7],
      rawByte: 0xb7,
    },
  ];

  for (const c of cases) {
    it(`preserves 0x${c.rawByte.toString(16)} through the full pipeline (${c.rel})`, () => {
      const filePath = path.join(repoRoot, c.rel);
      if (!fs.existsSync(filePath)) {
        // File missing — skip rather than fail (template data may not be present in CI).
        return;
      }

      // Stage 1: raw file bytes
      const raw = fs.readFileSync(filePath);
      const rawCount = highBitCount(raw, c.rawByte);
      expect(rawCount).toBeGreaterThan(0); // Sanity: file actually has the byte we care about

      // Stage 2: decoded JS string via the new pipeline
      const { text } = readAmigaTextFileWithTransforms(filePath);
      const decodedCount = (text.match(new RegExp(String.fromCharCode(c.codepoint), 'g')) || []).length;
      const fffdCount = (text.match(/�/g) || []).length;
      expect(fffdCount).toBe(0);
      expect(decodedCount).toBe(rawCount);

      // Stage 3: UTF-8 wire bytes (what socket.io serializes)
      const wire = Buffer.from(text, 'utf-8');
      const pairCount = utf8PairCount(wire, c.utf8[0], c.utf8[1]);
      expect(pairCount).toBe(rawCount);

      // Stage 4: JSON round-trip (what socket.io effectively does for strings)
      const roundTripped = JSON.parse(JSON.stringify(text));
      const rtCount = (roundTripped.match(new RegExp(String.fromCharCode(c.codepoint), 'g')) || []).length;
      const rtFffd = (roundTripped.match(/�/g) || []).length;
      expect(rtFffd).toBe(0);
      expect(rtCount).toBe(rawCount);
    });
  }
});
