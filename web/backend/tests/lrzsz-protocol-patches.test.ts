/**
 * Regression tests for lrzsz-transfer.service.ts protocol patches.
 *
 * Three patches the BBS applies to make lrzsz interoperate with strict
 * vs lenient ZMODEM clients, documented and pinned here so a future
 * refactor that removes them surfaces the symptom they were added for:
 *
 * 1. ZRINIT CANFC32 clear — WITHDRAWN 2026-09-23 (e7e1f9836); see the note
 *    where its tests used to be.
 *
 * 2. ZFILE subpacket ZCRCE → ZCRCW rewrite — MuffinTerm terminates the
 *    ZFILE name subpacket with ZCRCE (frame-ends marker). Per Forsberg
 *    the correct marker is ZCRCW (ACK expected) since sender must wait
 *    for receiver's ZRPOS before sending data. lrzsz strict-rejects
 *    ZCRCE as a protocol violation. Rewrite + CRC recompute makes
 *    MuffinTerm uploads work with strict rz.
 *
 * 3. Upload cwd snapshot diff — earlier code took readdirSync(cwd) at
 *    finish() time as the "received" list, which inflated counts with
 *    every pre-existing file in the playpen (the "31 files, 1032k" bug
 *    from a fresh repro). Snapshot at start(), diff at finish().
 *
 * These drive the real `LrzszTransferManager`. Patch 2 goes through
 * `handleInput` with a stubbed child stdin (the technique of
 * tests/services/lrzsz-zskip.test.ts) and asserts the exact bytes rz would
 * receive, CRC included, computed here by an independent CRC16/XMODEM.
 * Patch 3 goes through `start()` with `child_process.spawn` replaced by a
 * fake child, so no rz is ever run: the fake child "closes" with exit 0 and
 * the test reads the `received` list `onComplete` is handed.
 */
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const spawned: any[] = [];
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: () => {
    const proc: any = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = { write: () => true, end: () => undefined };
    proc.kill = () => true;
    spawned.push(proc);
    return proc;
  },
}));

import { LrzszTransferManager } from '../src/services/lrzsz-transfer.service';

/** CRC16/XMODEM (poly 0x1021, init 0) - what lrzsz's updcrc checks. */
function crc16(bytes: number[]): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

const ZFILE_PREFIX = [0x2a, 0x18, 0x41, 0x18, 0x44]; // `*` ZDLE 'A' ZDLE 'D'
const HEADER_REST = [0x00, 0x00, 0x00, 0x00, 0x55, 0x66]; // ZF0-3 + header CRC
const ZCRCE = 0x68;
const ZCRCW = 0x6b;

/** A ZFILE frame as MuffinTerm sends it: subpacket terminated ZDLE ZCRCE. */
function muffintermZfile(name: string): { frame: Buffer; info: number[] } {
  const info = [...Buffer.from(`${name}\0${1024} 0 0 0 1 1024\0`, 'latin1')];
  const oldCrc = crc16([...info, ZCRCE]);
  const frame = Buffer.from([
    ...ZFILE_PREFIX, ...HEADER_REST, ...info, 0x18, ZCRCE, (oldCrc >> 8) & 0xff, oldCrc & 0xff,
  ]);
  return { frame, info };
}

function makeManager(direction: 'upload' | 'download', transportType: 'telnet' | 'ssh') {
  const toChild: Buffer[] = [];
  const manager = new LrzszTransferManager({
    session: { nodeId: 1 } as never,
    transport: { type: transportType, send: () => undefined },
    direction,
    paths: ['/tmp/does-not-matter'],
  });
  (manager as any).proc = { stdin: { write: (buf: Buffer) => { toChild.push(Buffer.from(buf)); return true; } } };
  return { manager, toChild };
}

describe('lrzsz protocol patches (MuffinTerm interop)', () => {
  // Patch 1 (the ZRINIT CANFC32 clear) was WITHDRAWN on 2026-09-23 (e7e1f9836):
  // it changed what the sender was told and not what `rz` verified, so the two
  // disagreed about every subpacket. The sysop ruled the MuffinTerm case is not
  // the board's to paper over (bbf529b6d). The rule now - ZRINIT reaches the
  // caller as `rz` wrote it - is tested where it lives,
  // tests/lrzsz-transport-pipeline.test.ts.

  describe('Patch 2: ZFILE subpacket ZCRCE → ZCRCW rewrite (inbound)', () => {
    test('a telnet upload hands rz the ZFILE ending ZDLE ZCRCW with a recomputed CRC16', () => {
      const { manager, toChild } = makeManager('upload', 'telnet');
      const { frame, info } = muffintermZfile('DEMO.LHA');

      manager.handleInput(frame);

      const newCrc = crc16([...info, ZCRCW]);
      const expected = Buffer.from([
        ...ZFILE_PREFIX, ...HEADER_REST, ...info, 0x18, ZCRCW, (newCrc >> 8) & 0xff, newCrc & 0xff,
      ]);
      // The CRC bytes of this frame need no ZDLE escape, so the frame is exact.
      expect(expected.slice(-2).some((b) => b === 0x18 || b === 0x10 || b === 0x11 || b === 0x13)).toBe(false);
      expect(Buffer.concat(toChild)).toEqual(expected);
    });

    test('a ZFILE split across two chunks is buffered until the whole subpacket is in', () => {
      // TCP can fragment a 148-byte ZFILE across multiple chunks; the
      // rewrite needs the whole subpacket to compute CRC.
      const { manager, toChild } = makeManager('upload', 'telnet');
      const { frame, info } = muffintermZfile('SPLIT.LHA');
      const cut = ZFILE_PREFIX.length + HEADER_REST.length + 4;

      manager.handleInput(frame.slice(0, cut));
      expect(toChild).toEqual([]);

      manager.handleInput(frame.slice(cut));
      const out = Buffer.concat(toChild);
      const newCrc = crc16([...info, ZCRCW]);
      expect([...out.slice(-4)]).toEqual([0x18, ZCRCW, (newCrc >> 8) & 0xff, newCrc & 0xff]);
      expect(out.length).toBe(frame.length);
    });

    test('a download never rewrites inbound bytes', () => {
      // Downloads (sz, BBS-to-client) never produce ZFILE inbound bytes,
      // and ZCRCE in OTHER subpackets (ZDATA etc) is legitimate.
      const { manager, toChild } = makeManager('download', 'telnet');
      const { frame } = muffintermZfile('DEMO.LHA');

      manager.handleInput(frame);

      expect(Buffer.concat(toChild)).toEqual(frame);
    });
  });

  describe('Patch 3: Upload cwd snapshot diff (file count integrity)', () => {
    let dir: string;
    beforeEach(() => {
      spawned.length = 0;
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lrzsz-playpen-'));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    test('received[] lists only files rz wrote during THIS transfer, not the playpen stragglers', () => {
      // The earlier bug: `received = fs.readdirSync(cwd).map(...)` -
      // returned EVERY file in the playpen, including stragglers from
      // prior failed sessions ("31 files, 1032k" symptom).
      fs.writeFileSync(path.join(dir, 'STRAGGLER.LHA'), 'old');
      fs.writeFileSync(path.join(dir, 'OLDER.TXT'), 'old');
      let received: string[] | null = null;
      const manager = new LrzszTransferManager({
        session: { nodeId: 1 } as never,
        transport: { type: 'web', send: () => undefined },
        direction: 'upload',
        paths: [dir],
        onComplete: (_ok, detail) => { received = detail.received; },
      });

      manager.start();
      expect(spawned).toHaveLength(1);
      fs.writeFileSync(path.join(dir, 'NEW.LHA'), 'new bytes');
      spawned[0].emit('close', 0, null);

      expect(received).toEqual([path.join(dir, 'NEW.LHA')]);
    });
  });
});
