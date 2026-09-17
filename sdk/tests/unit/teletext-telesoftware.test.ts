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
import { pageBlock, decodeBlock, decodeChain, inspectProgram, repairTerminator, RAISE_CODE, LOWER_CODE, PAGE_BLOCK_BYTES } from '../../teletext/telesoftware';
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

describe('bytes the stream cannot say plainly', () => {
  /*
   * Every one of these cost the same thing, and it is worth naming once: a
   * tokenised BASIC program is a linked list of byte lengths, so a SINGLE
   * byte lost or invented anywhere desynchronises every record after it.
   * All eleven recovered games answered `Bad program` while the first
   * thirty-nine lines of GOMOKU decoded perfectly.
   */
  // Only the leading bytes: the rest of a 1024-byte block is the spaces an
  // untransmitted packet stands in for.
  const payload = (stream: number[], take = 1): number[] =>
    Array.from(decodeBlock(pageBlock(page([...startBlock(1, 1), ...stream]))).data.subarray(0, take));

  it('reads an escape followed by itself as the escape character', () => {
    // GOMOKU sends `7C 7C` for the low byte of BASIC line number 380.
    expect(payload([ESC, ESC])[0]).toBe(ESC);
  });

  it('reads an escaped operator code as that byte, not as the operator', () => {
    // In 7-bit mode the operators live in the LONE table, so the stream
    // cannot send them bare as data - it escapes them, and the escape
    // table's default entry is identity.
    expect(payload([ESC, RAISE_CODE])[0]).toBe(RAISE_CODE);
    expect(payload([ESC, LOWER_CODE])[0]).toBe(LOWER_CODE);
  });

  it('takes an operator operand through the escape too', () => {
    // GOMOKU sends BASIC line 440 as `60 7C 60 31`: raise, whose operand is
    // the escaped literal 0x60, giving 0xB8. Read with a plain byte fetch
    // it raises the ESCAPE character instead and then swallows the length
    // byte into a second operator.
    expect(payload([RAISE_CODE, ESC, RAISE_CODE, 0x31], 2)).toEqual([0x60 + 88, 0x31]);
  });

  it('lowers modulo 256, which is what makes the end-of-program marker', () => {
    // 87 lowered by 88 is 0xFF under 256 and 0xFE under the 255 the
    // specification extract states. The byte before it is 0x0D, so the pair
    // is BASIC's end marker - and 0xFE walks straight past the end of the
    // program into the page's filler graphics.
    expect(payload([LOWER_CODE, 0x65, LOWER_CODE, 0x57], 2)).toEqual([0x0d, 0xff]);
  });
});

describe('what a decoded program turns out to be', () => {
  /** A tokenised line: 0x0D, line number, total length, then the payload. */
  const basicLine = (number: number, body: number[]): number[] =>
    [0x0d, (number >> 8) & 0xff, number & 0xff, body.length + 4, ...body];

  const tokenised = (count: number): number[] => {
    const out: number[] = [];
    for (let i = 1; i <= count; i++) out.push(...basicLine(i * 10, [0xf1, 0x41]));
    return [...out, 0x0d, 0xff];
  };

  it('knows a tokenised program, and that its line chain reaches the end', () => {
    const shape = inspectProgram(Uint8Array.from(tokenised(6)));
    expect(shape.kind).toBe('tokenised');
    expect(shape.lines).toBe(6);
    expect(shape.terminated).toBe(true);
    expect(shape.brokeAt).toBeNull();
  });

  it('says where a broken line chain stops', () => {
    const bytes = tokenised(6);
    // Overstate the fifth line's length by one byte. Every record after it
    // is then read from the wrong offset - which is the entire failure mode
    // this decoder was built to rule out.
    bytes[4 * 6 + 3] += 1;
    const shape = inspectProgram(Uint8Array.from(bytes));
    expect(shape.kind).toBe('tokenised');
    expect(shape.terminated).toBe(false);
    expect(shape.brokeAt).toBeGreaterThan(0);
  });

  it('knows BASIC source from documentation by its line numbers', () => {
    const text = (body: string): Uint8Array =>
      Uint8Array.from([...body].map(c => c.charCodeAt(0)));
    expect(inspectProgram(text('10 REM SNAKE\r20 MODE 7\r30 END\r')).kind).toBe('source');
    expect(inspectProgram(text('TELESOFTWARE\rThe programs on this page\rare broadcast weekly.\r')).kind).toBe('text');
  });
});

describe('putting back an end marker the tape destroyed', () => {
  const basicLine = (number: number, body: number[]): number[] =>
    [0x0d, (number >> 8) & 0xff, number & 0xff, body.length + 4, ...body];

  const program = (count: number, from = 10): number[] => {
    const out: number[] = [];
    for (let i = 1; i <= count; i++) out.push(...basicLine(from + i * 10, [0xf1, 0x41]));
    return out;
  };

  it('repairs the one byte, when the program has ended', () => {
    /*
     * These are a BASIC program, then 0x0D 0xFF, then a blob the program
     * copies to &7C00 - MODE 7 screen memory - to draw its title. SNAKE and
     * GALAXY decode perfectly except for that single marker byte, which came
     * off the tape as 0x80 and 0xCC; without it the machine says `Bad
     * program` for a program that is entirely there.
     */
    const blob = [0xa2, 0x00, 0x48, 0x98, 0xc9, 0x03, 0x30, 0x06];
    const damaged = Uint8Array.from([...program(8), 0x0d, 0x80, ...blob]);
    expect(inspectProgram(damaged).terminated).toBe(false);

    const { data, repaired } = repairTerminator(damaged);
    expect(repaired).toBe(true);
    expect(inspectProgram(data).terminated).toBe(true);
    // One byte, and only one: the blob the program needs is untouched.
    expect(data.length).toBe(damaged.length);
    expect(Array.from(data.subarray(-blob.length))).toEqual(blob);
  });

  it('REFUSES when real program follows, rather than truncating it', () => {
    /*
     * BREAKOU's damage is a corrupted line HEADER with ten more records
     * after it. Treating that as an end marker would silently cut a game in
     * half - worse than leaving it honestly marked as damaged.
     */
    const damaged = Uint8Array.from([
      ...program(6),
      0x0d, 0x80, 0x23, 0x26, 0x46, 0x46,
      ...program(10, 500),
      0x0d, 0xff,
    ]);
    const { data, repaired } = repairTerminator(damaged);
    expect(repaired).toBe(false);
    expect(data).toBe(damaged);
  });

  it('repairs when what follows RESTARTS at a lower line number', () => {
    /*
     * BREAKOUT. Its 112 lines run 10 to 1120 in tens and end in ENDPROC -
     * a whole program - and then a SECOND run of records begins again at
     * 1020. BASIC line numbers ascend strictly within one program, so
     * records that restart lower are a different thing entirely, not a
     * continuation. Counting them as one made this file look unrepairable
     * when its only fault was the same single destroyed end marker as
     * Snake's and Galaxy's.
     */
    const damaged = Uint8Array.from([
      ...program(8, 1000),          // lines 1010..1080
      0x0d, 0x80,                   // the marker, destroyed
      ...program(10, 100),          // a second run, starting again at 110
      0x0d, 0xff,
    ]);
    const { data, repaired } = repairTerminator(damaged);
    expect(repaired).toBe(true);
    const shape = inspectProgram(data);
    expect(shape.terminated).toBe(true);
    expect(shape.lines).toBe(8);
  });

  it('leaves a program that already ends alone', () => {
    const whole = Uint8Array.from([...program(6), 0x0d, 0xff]);
    expect(repairTerminator(whole).repaired).toBe(false);
  });

  it('will not call a line number above BASIC’s limit a record', () => {
    // Without this bound the walk reads SNAKE's damaged marker as "line
    // 32902" and reports the break 114 bytes late, inside the machine code.
    const damaged = Uint8Array.from([...program(5), 0x0d, 0x80, 0x86, 0x72, 0xa2, 0x00]);
    expect(inspectProgram(damaged).lines).toBe(5);
  });
});
