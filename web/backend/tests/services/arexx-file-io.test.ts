// @ts-nocheck
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AREXXFileIO } from '../../src/services/arexx-file-io';

// Regression for the interpreter's file abstraction being LINE-oriented
// (readLines: string[] + a line-index cursor) when rexxsupport.library's
// Seek/ReadCh are BYTE-oriented operations against arbitrary content,
// binary included. AmiExpress doors use exactly this idiom against
// fixed-record files: `Seek(h,-234,'C')` walks backward one 234-byte
// record at a time. Against the old line-based approximation, any
// negative byte offset was silently wrong, and once a Seek clamped to a
// boundary the loop could settle into reading the SAME bytes forever -
// which is what hung the ACCV103 door in production (see
// arexx-runaway-watchdog.test.ts for the process-wide fallout of that).

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arexx-fileio-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeFixture(name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'latin1');
  return p;
}

describe('Seek/ReadCh are byte-accurate, not line-accurate', () => {
  test('reads the exact bytes at an absolute offset, embedded newlines and all', () => {
    // Binary-shaped content: real newline BYTES embedded mid-record, the
    // way a packed Amiga structure would have them. A line-based reader
    // would treat these as line breaks and never return them together.
    const content = 'AAAA\nBBBB\rCCCCDDDD';
    writeFixture('bin.dat', content);
    const io = new AREXXFileIO(dir);
    expect(io.open('H', 'bin.dat', 'R')).toBe(1);

    expect(io.seek('H', 10, 'B')).toBe(10); // "CCCCDDDD" starts at byte 10
    expect(io.readch('H', 4)).toBe('CCCC');
    expect(io.readch('H', 4)).toBe('DDDD');
  });

  test('Seek from the end walks backward through fixed-size binary records', () => {
    // The exact shape of the AccEd.Rexx idiom this fix targets: a
    // fixed-record file where a 2-byte count sits at a known offset from
    // the end of each record, and the door walks backward one record at
    // a time until it finds a nonzero count.
    const RECORD = 8; // 2-byte count header + 6-byte payload
    const records = ['\x00\x00rec000', '\x00\x00rec001', '\x00\x03rec002'];
    writeFixture('records.dat', records.join(''));
    const io = new AREXXFileIO(dir);
    io.open('H', 'records.dat', 'R');

    // Seek(-8,'E') lands at the start of the LAST record (24 bytes total,
    // -8 -> byte 16, the start of "\x00\x03rec002").
    io.seek('H', -RECORD, 'E');
    const count = io.readch('H', 2);
    expect(count.charCodeAt(0)).toBe(0);
    expect(count.charCodeAt(1)).toBe(3); // nonzero - the real record
  });

  test('walking backward through zero-count records eventually terminates on a real one', () => {
    const RECORD = 8; // 2-byte count header + 6-byte payload
    const records = ['\x00\x00rec000', '\x00\x00rec001', '\x00\x05rec002'];
    writeFixture('records.dat', records.join(''));
    const io = new AREXXFileIO(dir);
    io.open('H', 'records.dat', 'R');

    io.seek('H', -RECORD, 'E');
    let count = 0;
    let iterations = 0;
    do {
      const bytes = io.readch('H', 2);
      count = bytes.length === 2 ? bytes.charCodeAt(1) : 0;
      io.seek('H', -RECORD - 2, 'C'); // back up a full record from where readch left us
      iterations++;
    } while (count === 0 && iterations < 10);

    expect(count).toBe(5);
    expect(iterations).toBeLessThan(10); // found it, didn't exhaust the safety cap
  });

  test('an unopened handle never fabricates progress: Seek/ReadCh both no-op cleanly', () => {
    const io = new AREXXFileIO(dir);
    // 'NOPE' was never open()'d - exactly ACCV103's Open() failing
    // silently on a legacy path this BBS no longer has.
    expect(io.seek('NOPE', -148, 'E')).toBe(0);
    expect(io.readch('NOPE', 2)).toBe('');
    expect(io.eof('NOPE')).toBe(1);
  });

  test('Seek clamps at both ends rather than going negative or past EOF', () => {
    writeFixture('short.dat', 'ABCDE');
    const io = new AREXXFileIO(dir);
    io.open('H', 'short.dat', 'R');

    expect(io.seek('H', -999, 'B')).toBe(0);
    expect(io.seek('H', 999, 'E')).toBe(5);
    expect(io.eof('H')).toBe(1);
  });

  test('ReadCh advances the SAME cursor Seek moves - no drift between the two', () => {
    writeFixture('abc.dat', 'ABCDEFGHIJ');
    const io = new AREXXFileIO(dir);
    io.open('H', 'abc.dat', 'R');

    expect(io.readch('H', 3)).toBe('ABC');
    expect(io.seek('H', 0, 'C')).toBe(3); // current position after the read
    expect(io.readch('H', 3)).toBe('DEF');
  });
});

describe('readln keeps its old line-splitting behaviour exactly', () => {
  // The byte-cursor rewrite must not change readln()'s observable
  // behaviour for the text-file (config/log) use case every other door
  // already relies on - only Seek/ReadCh's UNITS were wrong.

  test('a normal multi-line file reads back line by line', () => {
    writeFixture('lines.txt', 'foo\nbar\nbaz\n');
    const io = new AREXXFileIO(dir);
    io.open('H', 'lines.txt', 'R');
    expect(io.readln('H')).toBe('foo');
    expect(io.readln('H')).toBe('bar');
    expect(io.readln('H')).toBe('baz');
  });

  test('a trailing newline yields one extra empty read before EOF (writeln symmetry)', () => {
    writeFixture('trail.txt', 'foo\nbar\n');
    const io = new AREXXFileIO(dir);
    io.open('H', 'trail.txt', 'R');
    expect(io.readln('H')).toBe('foo');
    expect(io.eof('H')).toBe(0);
    expect(io.readln('H')).toBe('bar');
    expect(io.eof('H')).toBe(0);
    expect(io.readln('H')).toBe('');
    expect(io.eof('H')).toBe(1);
    expect(io.readln('H')).toBe(''); // stays '' past EOF, never throws
  });

  test('no trailing newline: the last line is delivered with EOF, no phantom empty read', () => {
    writeFixture('notrail.txt', 'foo\nbar');
    const io = new AREXXFileIO(dir);
    io.open('H', 'notrail.txt', 'R');
    expect(io.readln('H')).toBe('foo');
    expect(io.eof('H')).toBe(0);
    expect(io.readln('H')).toBe('bar');
    expect(io.eof('H')).toBe(1);
  });

  test('an empty file yields exactly one empty readln, then EOF', () => {
    writeFixture('empty.txt', '');
    const io = new AREXXFileIO(dir);
    io.open('H', 'empty.txt', 'R');
    expect(io.eof('H')).toBe(0);
    expect(io.readln('H')).toBe('');
    expect(io.eof('H')).toBe(1);
  });

  test('CRLF, LF and bare CR all count as line breaks', () => {
    writeFixture('mixed.txt', 'a\r\nb\nc\rd');
    const io = new AREXXFileIO(dir);
    io.open('H', 'mixed.txt', 'R');
    expect(io.readln('H')).toBe('a');
    expect(io.readln('H')).toBe('b');
    expect(io.readln('H')).toBe('c');
    expect(io.readln('H')).toBe('d');
    expect(io.eof('H')).toBe(1);
  });

  test('a full write-then-read round trip through writeln/readln is unaffected', () => {
    const io = new AREXXFileIO(dir);
    io.open('W', 'roundtrip.txt', 'W');
    io.writeln('W', 'first');
    io.writeln('W', 'second');
    io.close('W');

    const io2 = new AREXXFileIO(dir);
    io2.open('R', 'roundtrip.txt', 'R');
    expect(io2.readln('R')).toBe('first');
    expect(io2.readln('R')).toBe('second');
    expect(io2.readln('R')).toBe('');
    expect(io2.eof('R')).toBe(1);
  });
});
