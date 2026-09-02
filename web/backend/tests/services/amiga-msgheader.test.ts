/**
 * The msgHeader record as a REAL AmiExpress board writes it.
 *
 * Both this and MessageIndexManager's record are 110 bytes, and they are not
 * the same 110 bytes. Amiga E aligns a LONG to an even offset, so the on-disk
 * record carries a pad after `status` and another after `subject`; the port
 * puts both at the end. The port's version is self-consistent - it writes and
 * reads its own files, and this board's 160 messages are fine - and cannot
 * read a board AmiExpress wrote.
 *
 * Caught by importing the reference-boardBBS reference tree: every message number
 * came back 0, and every name was overlapped by the previous record's tail -
 * "Hamletlund" for Hamlet, after "Tom Englund".
 *
 * The fixture is the first three records of that board's Conf1 HeaderFile,
 * copied byte for byte.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  parseAmigaHeaderFile, parseAmigaMsgHeader, AMIGA_MSGHEADER_SIZE,
} from '../../src/services/amiga-msgheader';

const HEADER_FILE = path.join(__dirname, '..', 'fixtures', 'amiga-board', 'HeaderFile');

describe('reading a real AmiExpress HeaderFile', () => {
  const buffer = fs.readFileSync(HEADER_FILE);

  test('a record is 110 bytes, and the fixture is whole records', () => {
    expect(AMIGA_MSGHEADER_SIZE).toBe(110);
    expect(buffer.length % AMIGA_MSGHEADER_SIZE).toBe(0);
  });

  test('message numbers are the board\'s own, not zero', () => {
    // With the pads at the end, msgNumb read as 0 for every message and the
    // real numbers turned up as control characters at the head of toName.
    expect(parseAmigaHeaderFile(buffer).map(h => h.msgNumb)).toEqual([1, 2, 3]);
  });

  test('a name is a name, not the tail of the record before it', () => {
    const [first, second] = parseAmigaHeaderFile(buffer);

    expect(first.fromName).toBe('Tom Englund');
    expect(second.fromName).toBe('Hamlet');
    // The old layout produced "Hamletlund" here.
    expect(second.fromName).not.toContain('lund');
  });

  test('reads to, from and subject as three separate fields', () => {
    const [first] = parseAmigaHeaderFile(buffer);

    expect(first.toName).toBe('Sandman');
    expect(first.fromName).toBe('Tom Englund');
    expect(first.subject).toBe('Najs nostalgi tripp');
  });

  test('the date is a real date, which is how the alignment was confirmed', () => {
    const dates = parseAmigaHeaderFile(buffer).map(h => new Date(h.msgDate * 1000));

    for (const date of dates) {
      expect(date.getUTCFullYear()).toBe(2017);
    }
    // Sequential within one evening - the shape a real message base has.
    expect(dates[0].getTime()).toBeLessThan(dates[1].getTime());
    expect(dates[1].getTime()).toBeLessThan(dates[2].getTime());
  });

  test('a trailing partial record is ignored rather than read off the end', () => {
    const ragged = Buffer.concat([buffer, Buffer.alloc(40)]);

    expect(parseAmigaHeaderFile(ragged)).toHaveLength(3);
  });

  test('an empty HeaderFile is no messages, not an error', () => {
    expect(parseAmigaHeaderFile(Buffer.alloc(0))).toEqual([]);
  });

  test('reads one record from any offset, so the walk and the record agree', () => {
    const second = parseAmigaMsgHeader(buffer, AMIGA_MSGHEADER_SIZE);

    expect(second).toEqual(parseAmigaHeaderFile(buffer)[1]);
  });
});
