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
 * Tests are source-grep style: the lrzsz service pulls in node child
 * processes and can't be unit-loaded under jest without a heavy mock
 * harness. The patterns below are tight enough to fail on accidental
 * removal but loose enough to survive cosmetic refactors.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('lrzsz protocol patches (MuffinTerm interop)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'services', 'lrzsz-transfer.service.ts'),
    'utf8'
  );

  // Patch 1 (the ZRINIT CANFC32 clear) was WITHDRAWN on 2026-09-23 (e7e1f9836):
  // it changed what the sender was told and not what `rz` verified, so the two
  // disagreed about every subpacket. The sysop ruled the MuffinTerm case is not
  // the board's to paper over (bbf529b6d). The rule now - ZRINIT reaches the
  // caller as `rz` wrote it - is tested where it lives,
  // tests/lrzsz-transport-pipeline.test.ts.

  describe('Patch 2: ZFILE subpacket ZCRCE → ZCRCW rewrite (inbound)', () => {
    test('rewriteMuffintermZfile helper exists', () => {
      expect(src).toMatch(/rewriteMuffintermZfile/);
    });

    test('detects ZBIN ZFILE prefix 2a 18 41 18 44', () => {
      // *\x18A\x18D — start of a ZBIN-framed ZFILE header.
      expect(src).toMatch(/0x2a,\s*0x18,\s*0x41,\s*0x18,\s*0x44/);
    });

    test('scans for ZDLE+ZCRCE terminator 0x18 0x68', () => {
      expect(src).toMatch(/0x18\s*&&[\s\S]{0,80}?0x68/);
    });

    test('emits ZCRCW marker 0x6b in place of ZCRCE', () => {
      expect(src).toMatch(/ZCRCW\s*=\s*0x6b/);
    });

    test('recomputes CRC16 using the CCITT polynomial 0x1021', () => {
      // Standard CCITT bitwise — produces values lrzsz's updcrc accepts.
      expect(src).toMatch(/0x1021/);
    });

    test('runs inside handleInput (the inbound wire path)', () => {
      // Bumped from 500 to 2500 chars — handleInput grew an LRZSZ_DEBUG
      // dump + tee-to-file block between entry and the rewrite call.
      expect(src).toMatch(/handleInput[\s\S]{0,2500}?rewriteMuffintermZfile/);
    });

    test('only fires for upload direction', () => {
      // Downloads (sz, BBS-to-client) never produce ZFILE inbound bytes,
      // and ZCRCE in OTHER subpackets (ZDATA etc) is legitimate.
      expect(src).toMatch(/direction\s*===\s*['"]upload['"][\s\S]{0,200}?rewriteMuffintermZfile/);
    });

    test('buffers fragmented chunks via inboundBuf', () => {
      // TCP can fragment a 148-byte ZFILE across multiple chunks; the
      // rewrite needs the whole subpacket to compute CRC.
      expect(src).toMatch(/inboundBuf/);
    });
  });

  describe('Patch 3: Upload cwd snapshot diff (file count integrity)', () => {
    test('preTransferFiles set is initialized', () => {
      expect(src).toMatch(/preTransferFiles\s*:\s*Set<string>/);
    });

    test('snapshot fires at start() for upload direction', () => {
      expect(src).toMatch(/start\(\)[\s\S]{0,800}?preTransferFiles\.add/);
    });

    test('finish() diffs against preTransferFiles instead of returning whole readdir', () => {
      // The earlier bug: `received = fs.readdirSync(cwd).map(...)` —
      // returned EVERY file in the playpen, including stragglers from
      // prior failed sessions ("31 files, 1032k" symptom). The fix
      // filters by preTransferFiles.has(n).
      expect(src).toMatch(/preTransferFiles\.has/);
    });

    test('no longer maps every readdir entry into received[]', () => {
      // If this pattern reappears, the snapshot diff was undone.
      expect(src).not.toMatch(/received\s*=\s*fs\.readdirSync\(cwd\)\.map/);
    });
  });
});
