/**
 * A duplicate is refused at the ZFILE, not after the bytes have arrived.
 *
 * express's ZMODEM receiver asks `zmdupecheck` about the name in the ZFILE
 * header (zmodem.e:2571, express.e:16831) and answers ZSKIP when it says yes
 * (zmodem.e:2725) - the file is never sent. This port received every byte of
 * a file it already had and then filed it as a duplicate: the outcome was
 * right and the caller's minutes were spent for nothing.
 *
 * WHAT THESE DRIVE. `handleInput`, the method both byte transports and the
 * browser bridge push caller bytes into, with a stubbed child process in
 * place of `rz` - so what is asserted is what reaches rz's stdin and what
 * reaches the caller's terminal, which is the whole of the behaviour.
 *
 * The frames are hand-built rather than captured because the CRCs are not
 * read: the screen locates the frame and the NAME, and forwards or drops the
 * bytes untouched. Nothing here re-encodes a subpacket, which is why there is
 * no CRC to get wrong.
 */
process.env.SKIP_DB_INIT = '1';

import { LrzszTransferManager } from '../../src/services/lrzsz-transfer.service';

/** `*` ZDLE 'A' ZDLE 'D' - a ZBIN frame whose type byte is ZFILE (0x04). */
const ZFILE_PREFIX = [0x2a, 0x18, 0x41, 0x18, 0x44];
/** ZDLE ZCRCW - "no more data until the receiver answers". */
const ZCRCW_TERM = [0x18, 0x6b];

/**
 * One ZFILE frame: the prefix, the six header bytes that follow the type,
 * the name subpacket, the terminator and a two-byte CRC.
 */
function zfileFrame(name: string): Buffer {
  const header = [0x30, 0x30, 0x30, 0x30, 0x11, 0x22]; // pos(4) + CRC16(2)
  const info = Buffer.from(`${name}\0${1024} 0 0 0 1 1024\0`, 'latin1');
  return Buffer.concat([
    Buffer.from(ZFILE_PREFIX),
    Buffer.from(header),
    info,
    Buffer.from(ZCRCW_TERM),
    Buffer.from([0x33, 0x44]),
  ]);
}

function makeManager(isDuplicate: (name: string) => boolean | Promise<boolean>) {
  const toCaller: Buffer[] = [];
  const toChild: Buffer[] = [];
  const manager = new LrzszTransferManager({
    session: { nodeId: 1 } as never,
    // Not telnet: the MuffinTerm ZCRCE rewrite is a serial-line workaround
    // and would rewrite these frames before the screen ever saw them.
    transport: { type: 'ssh', send: (data: Buffer) => { toCaller.push(Buffer.from(data)); } },
    direction: 'upload',
    paths: ['/tmp/does-not-matter'],
    isDuplicate,
  });
  (manager as any).proc = { stdin: { write: (buf: Buffer) => { toChild.push(Buffer.from(buf)); return true; } } };
  return { manager, toCaller, toChild };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** The hex ZSKIP header: `**` ZDLE 'B' then "05" and a zero position. */
const isZskip = (buf: Buffer): boolean =>
  buf.length >= 6 &&
  buf[0] === 0x2a && buf[1] === 0x2a && buf[2] === 0x18 && buf[3] === 0x42 &&
  buf.slice(4, 6).toString('ascii') === '05' &&
  buf.slice(6, 14).toString('ascii') === '00000000';

describe('a file the board already has', () => {
  it('is answered with ZSKIP and never reaches rz', async () => {
    const { manager, toCaller, toChild } = makeManager((name) => name === 'DUPE.LHA');

    manager.handleInput(zfileFrame('DUPE.LHA'));
    await flush();

    expect(toChild).toEqual([]);
    expect(toCaller.length).toBe(1);
    expect(isZskip(toCaller[0])).toBe(true);
  });

  it('is named in the completion detail, the way express lists skipdFiles', async () => {
    const { manager } = makeManager(() => true);

    manager.handleInput(zfileFrame('ALREADY.LHA'));
    await flush();

    expect((manager as any).skippedFiles).toEqual(['ALREADY.LHA']);
  });
});

describe('a file the board does not have', () => {
  it('reaches rz byte for byte, and nothing is sent to the caller', async () => {
    const { manager, toCaller, toChild } = makeManager(() => false);
    const frame = zfileFrame('NEW.LHA');

    manager.handleInput(frame);
    await flush();

    expect(Buffer.concat(toChild)).toEqual(frame);
    expect(toCaller).toEqual([]);
  });

  it('is screened even when the frame arrives in two pieces', async () => {
    const { manager, toCaller, toChild } = makeManager((name) => name === 'SPLIT.LHA');
    const frame = zfileFrame('SPLIT.LHA');
    const cut = ZFILE_PREFIX.length + 8;

    manager.handleInput(frame.slice(0, cut));
    await flush();
    // Nothing has been decided, so nothing has moved in either direction.
    expect(toChild).toEqual([]);
    expect(toCaller).toEqual([]);

    manager.handleInput(frame.slice(cut));
    await flush();

    expect(toChild).toEqual([]);
    expect(isZskip(toCaller[0])).toBe(true);
  });
});

describe('what the screen must not touch', () => {
  it('passes file DATA through even when it contains the ZFILE prefix bytes', async () => {
    // `2a 18 41 18 44` is five bytes a compressed archive can produce by
    // chance. Screening the whole stream for them would hold a caller's file
    // hostage waiting for a subpacket terminator that never comes, so the
    // screen stops looking once a ZFILE has been ACCEPTED - data is what
    // follows an accepted file, and nothing else may be read as a frame.
    //
    // This used to accept the file by SKIPPING it, which is the one case
    // where data does NOT follow: after a ZSKIP the sender's next move is
    // another ZFILE, and the screen now stays armed for it. Screening only
    // the first file of a batch is what let two duplicates onto the live
    // board on 2026-09-08 - see the batch tests at the bottom of this file.
    const { manager, toCaller, toChild } = makeManager(() => false);

    manager.handleInput(zfileFrame('FIRST.LHA')); // accepted: data follows
    await flush();
    toCaller.length = 0;
    toChild.length = 0;

    const data = Buffer.concat([
      Buffer.from([0x2a, 0x18, 0x43, 0x18, 0x44]), // ZBIN32 ZFILE by accident
      Buffer.from('some compressed bytes', 'latin1'),
      Buffer.from(ZFILE_PREFIX),                   // ...and ZBIN too
    ]);
    manager.handleInput(data);
    await flush();

    expect(Buffer.concat(toChild)).toEqual(data);
    expect(toCaller).toEqual([]);
  });

  it('accepts the file when the duplicate rule throws', async () => {
    const { manager, toCaller, toChild } = makeManager(() => {
      throw new Error('the database is down');
    });
    const frame = zfileFrame('RULE-BROKE.LHA');

    manager.handleInput(frame);
    await flush();

    // The caller keeps his upload; the post-transfer filing still catches a
    // duplicate the way it always did.
    expect(Buffer.concat(toChild)).toEqual(frame);
    expect(toCaller).toEqual([]);
  });

  it('leaves a download stream alone entirely', async () => {
    const toCaller: Buffer[] = [];
    const toChild: Buffer[] = [];
    const manager = new LrzszTransferManager({
      session: { nodeId: 1 } as never,
      transport: { type: 'ssh', send: (d: Buffer) => { toCaller.push(Buffer.from(d)); } },
      direction: 'download',
      paths: ['/tmp/file.lha'],
      isDuplicate: () => true,
    });
    (manager as any).proc = { stdin: { write: (b: Buffer) => { toChild.push(Buffer.from(b)); return true; } } };

    const frame = zfileFrame('WHATEVER.LHA');
    manager.handleInput(frame);
    await flush();

    expect(Buffer.concat(toChild)).toEqual(frame);
    expect(toCaller).toEqual([]);
  });
});

/**
 * The live failure of 2026-09-08, and the reason it looked like the duplicate
 * check was broken when the check itself was fine.
 *
 * The screen answers ZSKIP ITSELF - rz never sees the frame. So rz does not
 * advance, and never emits the fresh ZRINIT that `processStdoutChunk` re-arms
 * `expectingZfile` on. Every file after the first was forwarded unscreened.
 * On the board a batch of three refused ABS_PD1.LHA and then took
 * ABS-PLC2.LHA and ABS-DRIN.LHA in full, both duplicates; the sysop saw a
 * ZSKIP in the log for a name he had not sent last and concluded, reasonably,
 * that nothing was being checked.
 *
 * express asks zmdupecheck at EVERY ZFILE (zmodem.e:2571).
 */
describe('every file in the batch, not just the first', () => {
  /** rz's ZRINIT as a hex header - what re-arms the screen in normal flow. */
  const zrinit = (): Buffer => Buffer.concat([
    Buffer.from([0x2a, 0x2a, 0x18, 0x42]),
    Buffer.from('0100000023', 'ascii'),
    Buffer.from([0x0d, 0x8a, 0x11]),
  ]);

  function askedNames(isDuplicate: (n: string) => boolean) {
    const asked: string[] = [];
    const made = makeManager((name) => { asked.push(name); return isDuplicate(name); });
    return { ...made, asked };
  }

  it('keeps screening after it has skipped one - no ZRINIT comes back', async () => {
    // THE REGRESSION. Both are duplicates; both must be refused. Before the
    // fix the second was never even asked about, because the ZSKIP that
    // refused the first is what stopped rz advancing.
    const { manager, asked, toChild } = askedNames(() => true);

    manager.handleInput(zfileFrame('FIRST.LHA'));
    await flush();
    manager.handleInput(zfileFrame('SECOND.LHA'));
    await flush();

    expect(asked).toEqual(['FIRST.LHA', 'SECOND.LHA']);
    expect(toChild).toEqual([]); // neither reached rz
  });

  it('still screens the next file after one was ACCEPTED and rz asked again', async () => {
    // The path that always worked, pinned so the fix cannot break it: a file
    // that is forwarded transfers, and rz's own ZRINIT re-arms the screen.
    const { manager, asked } = askedNames((name) => name === 'SECOND.LHA');

    manager.handleInput(zfileFrame('FIRST.LHA'));
    await flush();
    (manager as any).processStdoutChunk(zrinit());
    await flush();
    manager.handleInput(zfileFrame('SECOND.LHA'));
    await flush();

    expect(asked).toEqual(['FIRST.LHA', 'SECOND.LHA']);
  });

  it('re-arms on a ZRINIT that shares its chunk with rz chatter', async () => {
    // `isLoneZrinit` caps the chunk at 28 bytes, so a ZRINIT arriving with
    // anything after it is not "lone". The arming must not depend on that.
    const { manager, asked } = askedNames((name) => name === 'SECOND.LHA');

    manager.handleInput(zfileFrame('FIRST.LHA'));
    await flush();
    (manager as any).processStdoutChunk(
      Buffer.concat([zrinit(), Buffer.from('rz: ready for the next one\r\n', 'ascii')])
    );
    await flush();
    manager.handleInput(zfileFrame('SECOND.LHA'));
    await flush();

    expect(asked).toEqual(['FIRST.LHA', 'SECOND.LHA']);
  });

  it('refuses the third as readily as the first', async () => {
    // The live batch was three files. Nothing about the count may matter.
    const { manager, asked, toChild } = askedNames(() => true);

    for (const name of ['ABS_PD1.LHA', 'ABS-PLC2.LHA', 'ABS-DRIN.LHA']) {
      manager.handleInput(zfileFrame(name));
      await flush();
    }

    expect(asked).toEqual(['ABS_PD1.LHA', 'ABS-PLC2.LHA', 'ABS-DRIN.LHA']);
    expect(toChild).toEqual([]);
  });
});
