/**
 * Art streamed a chunk at a time must arrive as the art.
 *
 * Reported 2026-09-02 with two screenshots of the same screen: "the ansi
 * renders correct in the admin ui now, but incorrect in the bbs". The admin
 * hands the browser one string; the board hands it 256 bytes at a time.
 *
 * Both paced writers - modem emulation and the slow-scroll effect - budget in
 * BYTES, because that is what a baud rate is, and then sliced the UTF-8 buffer
 * at exactly that many bytes and decoded each slice on its own. A block
 * character is three bytes, so every `░` that straddled a boundary arrived as
 * two halves and rendered as two replacement characters. The same code took
 * deliberate care never to split an ESCAPE sequence, and split the art
 * instead.
 */
process.env.SKIP_DB_INIT = '1';

import { utf8ChunkEnd } from '../../src/utils/utf8-chunk.util';

/** What a paced writer does: take a byte budget at a time, decode each piece. */
function streamInChunks(text: string, budget: number): string {
  const buffer = Buffer.from(text, 'utf-8');
  let out = '';
  let offset = 0;
  while (offset < buffer.length) {
    const end = utf8ChunkEnd(buffer, offset, budget);
    out += buffer.subarray(offset, end).toString('utf-8');
    offset = end;
  }
  return out;
}

/** The old way, kept to show what it did to the art. */
function streamSplittingBytes(text: string, budget: number): string {
  const buffer = Buffer.from(text, 'utf-8');
  let out = '';
  for (let offset = 0; offset < buffer.length; offset += budget) {
    out += buffer.subarray(offset, offset + budget).toString('utf-8');
  }
  return out;
}

// The characters ANSI art is mostly made of, three UTF-8 bytes each.
const art = '\x1b[31m' + '░▒▓█'.repeat(400) + '\x1b[0m';

describe('streaming art through a byte budget', () => {
  it('delivers exactly what went in, at every budget', () => {
    // Every budget from 1 to 40: a three-byte character lands across a
    // boundary at some of them and not others, and none may corrupt it.
    for (let budget = 1; budget <= 40; budget++) {
      expect(streamInChunks(art, budget)).toBe(art);
    }
  });

  it('delivers it at the sizes the two writers actually use', () => {
    expect(streamInChunks(art, 256)).toBe(art);   // modem emulation
    expect(streamInChunks(art, 128)).toBe(art);   // slow-scroll frames
  });

  it('is what splitting on bytes got wrong', () => {
    // The bug, reproduced: the same art comes back with replacement
    // characters in it.
    const broken = streamSplittingBytes(art, 256);

    expect(broken).not.toBe(art);
    expect(broken).toContain('�');
  });

  it('never stalls on a character wider than the budget', () => {
    // A one-byte budget cannot fit `░` at all; taking it whole is the only
    // way forward, and an infinite loop is the alternative.
    expect(streamInChunks('░░░', 1)).toBe('░░░');
  });

  it('leaves plain ASCII exactly where the budget says', () => {
    expect(utf8ChunkEnd(Buffer.from('hello world'), 0, 5)).toBe(5);
  });

  it('stops at the end of the buffer rather than past it', () => {
    const buffer = Buffer.from('hi');

    expect(utf8ChunkEnd(buffer, 0, 999)).toBe(buffer.length);
  });
});
