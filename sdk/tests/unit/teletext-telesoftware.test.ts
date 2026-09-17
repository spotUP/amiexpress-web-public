/**
 * Telesoftware, decoded.
 *
 * These pin the parts that were wrong before they were right. The one that
 * matters most is the last: the 7-bit overlay adds the raising and lowering
 * operators to the LONE table, so a bare 0x7E is the lowering command with
 * no escape before it. Honouring them only after an escape left every
 * 8-bit byte encoded - programs decoded to printable text carrying over a
 * thousand literal tildes and not one line ending, which looks like success
 * until you try to load one.
 */
import { pageBlock, decodeBlock, decodeChain, RAISE_CODE, LOWER_CODE, PAGE_BLOCK_BYTES } from '../../teletext/telesoftware';
import type { TeletextLine } from '../../teletext/packet27';

const ESC = 0x7c;

function line(packetNumber: number, bytes: number[]): TeletextLine {
  const data = new Uint8Array(40).fill(0x20);
  bytes.forEach((b, i) => { if (i < 40) data[i] = b; });
  return { magazine: 7, packetNumber, data };
}

function ascii(text: string): number[] {
  return [...text].map(c => c.charCodeAt(0));
}

/** A page whose first row carries a telesoftware stream. */
function page(stream: number[]): TeletextLine[] {
  const rows: TeletextLine[] = [line(0, ascii('        TELESOFT'))];
  for (let i = 0; i < stream.length; i += 40) {
    rows.push(line(1 + i / 40, stream.slice(i, i + 40)));
  }
  return rows;
}

/** Start of block: 7-bit disordered, block number then count. */
function startBlock(number: number, count: number): number[] {
  return [ESC, 0x42, ...ascii('2'), ...ascii('1'), ...ascii(number.toString(16)), ...ascii('1'), ...ascii(count.toString(16))];
}

describe('the page block', () => {
  it('is always 1024 bytes, whatever was transmitted', () => {
    expect(pageBlock(page([])).length).toBe(PAGE_BLOCK_BYTES);
  });

  it('takes the centre 24 bytes of the header, then 40 per row', () => {
    const block = pageBlock([line(0, ascii('12345678ABCDEFGH')), line(1, ascii('ROWONE'))]);
    // Header columns 0-7 are page number and control bits, not data.
    expect(String.fromCharCode(...block.subarray(0, 8))).toBe('ABCDEFGH');
    expect(String.fromCharCode(...block.subarray(24, 30))).toBe('ROWONE');
  });

  it('treats an untransmitted packet as spaces', () => {
    // 1985 Ceefax sent packets 1-23 and nothing above, and the spec counts
    // what was never sent as spaces - which is why those pages decode at
    // all.
    const block = pageBlock([line(0, []), line(1, ascii('X'))]);
    expect(block[24 + 40]).toBe(0x20);
    expect(block[PAGE_BLOCK_BYTES - 1]).toBe(0x20);
  });
});

describe('reading a block', () => {
  it('reads the block number and count', () => {
    const r = decodeBlock(pageBlock(page(startBlock(2, 5))));
    expect(r.blockNumber).toBe(2);
    expect(r.blockCount).toBe(5);
  });

  it('reads the title', () => {
    const stream = [...startBlock(1, 1), ESC, 0x61, ...ascii('1'), ...ascii('5'), ...ascii('SNAKE')];
    expect(decodeBlock(pageBlock(page(stream))).title).toBe('SNAKE');
  });

  it('keeps payload bytes and stops at end of block', () => {
    const stream = [...startBlock(1, 1), ...ascii('DATA'), ESC, 0x63, ...ascii('IGNORED')];
    const r = decodeBlock(pageBlock(page(stream)));
    expect(String.fromCharCode(...r.data).startsWith('DATA')).toBe(true);
    expect(String.fromCharCode(...r.data)).not.toContain('IGNORED');
  });

  it('ignores everything before a block starts', () => {
    const r = decodeBlock(pageBlock(page([...ascii('PREAMBLE'), ...startBlock(1, 1), ...ascii('IN')])));
    expect(String.fromCharCode(...r.data)).not.toContain('PREAMBLE');
  });
});

describe('the raising and lowering operators', () => {
  it('lowers a bare byte, with no escape in front of it', () => {
    // THE BUG THIS EXISTS FOR. The 7-bit overlay adds these to the lone
    // table, so they act on their own. 101 lowered by 88 is 13 - the
    // carriage return at the end of every BASIC line.
    const stream = [...startBlock(1, 1), LOWER_CODE, 'e'.charCodeAt(0)];
    const r = decodeBlock(pageBlock(page(stream)));
    expect(Array.from(r.data.subarray(0, 1))).toEqual([0x0d]);
  });

  it('raises a bare byte', () => {
    const stream = [...startBlock(1, 1), RAISE_CODE, 0x30];
    expect(decodeBlock(pageBlock(page(stream))).data[0]).toBe((0x30 + 88) % 255);
  });

  it('does not eat them before a block has started', () => {
    const r = decodeBlock(pageBlock(page([LOWER_CODE, 'e'.charCodeAt(0), ...startBlock(1, 1), ...ascii('A')])));
    const text = String.fromCharCode(...r.data);
    // The payload starts at 'A'; the rest of a 1024-byte block is the
    // spaces an untransmitted packet stands in for, which belong there.
    expect(text.startsWith('A')).toBe(true);
    expect(text).not.toContain('\r');
  });
});

describe('a chain of pages', () => {
  it('assembles blocks in order into one program', () => {
    const one = page([...startBlock(1, 2), ESC, 0x61, ...ascii('16'), ...ascii('TWOBIT'), ...ascii('FIRST')]);
    const two = page([...startBlock(2, 2), ESC, 0x61, ...ascii('16'), ...ascii('TWOBIT'), ...ascii('SECOND')]);
    const [program] = decodeChain([{ lines: two }, { lines: one }]);
    expect(program.title).toBe('TWOBIT');
    expect(program.complete).toBe(true);
    const text = String.fromCharCode(...program.data);
    expect(text.indexOf('FIRST')).toBeLessThan(text.indexOf('SECOND'));
  });

  it('knows when a program is missing a block', () => {
    const only = page([...startBlock(1, 3), ESC, 0x61, ...ascii('14'), ...ascii('PART')]);
    const [program] = decodeChain([{ lines: only }]);
    expect(program.complete).toBe(false);
    expect(program.blockCount).toBe(3);
  });
});
