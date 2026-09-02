/**
 * The board's message headers are in TWO layouts, inside the same files.
 *
 * MessageIndexManager wrote msgNumb at offset 1 - a 32-bit LONG at an ODD
 * address, which a 68000 cannot even fetch - and pushed the record's two pad
 * bytes to the end. Self-consistent, and unreadable by AmiExpress, by a real
 * Amiga, or by any 68K door that reads HeaderFile directly. The struct's own
 * accounting in axobjects.e:179-190 spells the real one out:
 * `1+1+4+31+31+31+1+4+4+2 = 110`, the two 1s being pads that align msgNumb
 * and msgDate.
 *
 * Reading every record as the port's layout returned msgNumb 0 for every
 * message the original Amiga wrote - and the new-mail scan, message move and
 * message delete all look a message up BY NUMBER.
 *
 * Measured on this board's 545 messages: Conf3, Conf5 and Conf12 are entirely
 * AmiExpress records, Conf1 and Conf2 are mostly this port's, and Conf2
 * record 130 is a lone AmiExpress record among 159 of the port's - so the
 * question is per RECORD, not per file.
 *
 * Fixtures are real bytes from this board: three records a 68K door wrote and
 * three this port wrote.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';
import { classifyMsgHeaderRecord, portRecordToAmiga } from '../../src/services/msgheader-layout';
import { parseAmigaMsgHeader, AMIGA_MSGHEADER_SIZE } from '../../src/services/amiga-msgheader';
import { messageIndexManager } from '../../src/services/MessageIndexManager';
import { planHeaderFile } from '../../src/scripts/migrate-msgheaders';

const FIX = path.join(__dirname, '..', 'fixtures', 'msgheaders');
const amigaBytes = fs.readFileSync(path.join(FIX, 'amiga-written.HeaderFile'));
const portBytes = fs.readFileSync(path.join(FIX, 'port-written.HeaderFile'));

const read = (buffer: Buffer) => (messageIndexManager as any).parseHeaderFile(buffer);

describe('telling the two layouts apart', () => {
  it('knows a record a 68K door wrote', () => {
    expect(classifyMsgHeaderRecord(amigaBytes, 0)).toBe('amiga');
  });

  it('knows a record this port wrote', () => {
    expect(classifyMsgHeaderRecord(portBytes, 0)).toBe('port');
  });

  it('does not decide by the pad bytes, which hold uninitialised memory', () => {
    // Amiga E does not clear structure padding. Byte 99 of a genuine
    // AmiExpress record in this board's Conf12 is 0x47, left over from
    // whatever was in that memory - requiring the pads to be zero called all
    // 38 of that file's records unidentifiable.
    expect(amigaBytes[99]).not.toBe(0);
    expect(classifyMsgHeaderRecord(amigaBytes, 0)).toBe('amiga');
  });
});

describe('reading a message base that holds both', () => {
  it('numbers the messages a 68K door wrote, instead of calling them all 0', () => {
    const headers = read(amigaBytes);

    expect(headers.map((h: any) => h.msgNumb)).toEqual([1, 2, 3]);
  });

  it('reads their names from where AmiExpress puts them', () => {
    const [first] = read(amigaBytes);

    expect(first.toName).toBe('sandman');
    expect(first.fromName).toBe('AquaPWFail v1.0');
    expect(first.subject).toBe('Password failure!');
  });

  it('still reads the records this port already wrote', () => {
    const headers = read(portBytes);

    expect(headers.map((h: any) => h.msgNumb)).toEqual([1, 2, 3]);
    expect(headers[0].fromName).toBe('tester');
    expect(headers[0].toName).toBe('All');
  });

  it('dates a 68K door\'s message to when it was sent', () => {
    // Read at the port's offset this lands 8 bits out - a different year.
    const [first] = read(amigaBytes);

    expect(new Date(first.msgDate * 1000).getUTCFullYear()).toBe(2026);
  });
});

describe('converting a record to the layout AmiExpress reads', () => {
  it('keeps every field, moving the pads to where they belong', () => {
    const converted = portRecordToAmiga(portBytes, 0);
    const before = read(portBytes)[0];
    const after = parseAmigaMsgHeader(converted, 0);

    expect(after.msgNumb).toBe(before.msgNumb);
    expect(after.toName).toBe(before.toName);
    expect(after.fromName).toBe(before.fromName);
    expect(after.subject).toBe(before.subject);
    expect(after.msgDate).toBe(before.msgDate);
    expect(after.recv).toBe(before.recv);
    expect(converted.length).toBe(AMIGA_MSGHEADER_SIZE);
  });

  it('produces a record that now reads as AmiExpress', () => {
    const converted = portRecordToAmiga(portBytes, 0);

    expect(classifyMsgHeaderRecord(converted, 0)).toBe('amiga');
  });

  it('leaves a converted record alone the second time', () => {
    // A migration that runs twice must not shift the fields twice.
    const once = portRecordToAmiga(portBytes, 0);
    expect(classifyMsgHeaderRecord(once, 0)).toBe('amiga');

    const stillFine = parseAmigaMsgHeader(once, 0);
    expect(stillFine.fromName).toBe('tester');
  });
});

describe('what this port writes now', () => {
  it('writes the layout AmiExpress reads, so a 68K door can read it back', () => {
    const header = {
      status: 0x50, msgNumb: 42, toName: 'sandman', fromName: 'sysop',
      subject: 'Parity', msgDate: 1779033501, recv: 0, extMsgNum: 0,
    };
    const record: Buffer = (messageIndexManager as any).serializeMsgHeader(header);

    expect(classifyMsgHeaderRecord(record, 0)).toBe('amiga');
    // At the offsets AmiExpress reads, not the ones this port used to write.
    expect(record.readInt32BE(2)).toBe(42);
    expect(record.subarray(6, 13).toString('latin1')).toBe('sandman');
    expect(record.readInt32BE(100)).toBe(1779033501);
  });

  it('round-trips through its own reader', () => {
    const header = {
      status: 0x52, msgNumb: 7, toName: 'EALL', fromName: 'SysOp',
      subject: 'Round trip', msgDate: 1779033501, recv: 3, extMsgNum: 9,
    };
    const record: Buffer = (messageIndexManager as any).serializeMsgHeader(header);

    expect(read(record)[0]).toEqual(header);
  });
});

describe('migrating a HeaderFile on disk', () => {
  it('converts the port\'s records and leaves AmiExpress ones alone', () => {
    expect(planHeaderFile(portBytes).report).toMatchObject({
      records: 3, converted: 3, alreadyAmiga: 0, unidentified: [],
    });
    expect(planHeaderFile(amigaBytes).report).toMatchObject({
      records: 3, converted: 0, alreadyAmiga: 3, unidentified: [],
    });
  });

  it('changes the layout and not one message', () => {
    const { out } = planHeaderFile(portBytes);

    expect(read(out)).toEqual(read(portBytes));
  });

  it('is safe to run twice', () => {
    // A second pass must not shift the fields again.
    const once = planHeaderFile(portBytes).out;
    const twice = planHeaderFile(once);

    expect(twice.report.converted).toBe(0);
    expect(twice.out.equals(once)).toBe(true);
  });

  it('reports a record it cannot identify rather than rewriting it', () => {
    // 21 of this board's 545 are structurally odd in both layouts. Guessing
    // at one rewrites somebody's mail.
    const odd = Buffer.alloc(110);
    odd[0] = 0x50;
    odd[36] = 0x53;   // looks like the port's fromName...
    // ...but no toName where either layout puts one.

    const { out, report } = planHeaderFile(odd);

    expect(report.unidentified).toEqual([0]);
    expect(report.converted).toBe(0);
    expect(out.equals(odd)).toBe(true);
  });
});
