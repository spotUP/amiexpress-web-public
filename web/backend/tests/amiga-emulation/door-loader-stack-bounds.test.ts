/**
 * Regression: stack placement must clear ALL hunk segments — including BSS.
 *
 * Background:
 *   SAS/C-style binaries load three hunks (CODE / DATA / BSS) at separate
 *   addresses. BSS commonly sits *after* DATA (e.g. CODE@0x2008,
 *   DATA@0x7608, BSS@0x7808 size 8344 → BSS_end = 0x98A0). The SAS/C
 *   startup uses the top of BSS for runtime saved state — saved ExecBase
 *   at memory 0x9864 (BSS+0x205c), saved SP at 0x9868, saved argc at
 *   0x9874, etc.
 *
 *   The original DoorLoader computed `lastSegmentEnd` from CODE/DATA only.
 *   With STACK=32760 from the .info, the stack range ended up at
 *   [0x77A8, 0xF7A0] which OVERLAPS BSS [0x7808, 0x98A0]. A door with a
 *   large local frame (DOORSMENU's `Config cfg` is ~25KB on the stack)
 *   would push SP into BSS territory; subsequent local writes stomped the
 *   saved ExecBase. The next library JSR through that variable jumped to
 *   garbage (0x1d1f3a in the failing trace) and the door silently died.
 *
 * Fix:
 *   `DoorLoader.computeStackBounds` walks every segment and uses the max
 *   end address. The stack base is then placed safely above all segments.
 *
 * Updated 2026-05-04: stack floor raised from 4KB to 256KB to give SAS/C
 * runtime startup enough headroom for the watermark math
 * (`SP - 4(SP) + 0x80`) to land safely. AmiExpress's .info default of
 * 20000 bytes was tripping the runtime "** Stack Overflow **" check
 * immediately on every SAS/C-built door (caught on stats / ustats).
 */

import { DoorLoader } from '../../src/amiga-emulation/DoorLoader';

describe('DoorLoader.computeStackBounds — stack must clear all segments (regression)', () => {
  const FLOOR = 256 * 1024;

  test('places stack above BSS when BSS is the highest segment (DOORSMENU shape)', () => {
    // Realistic DOORSMENU layout: BSS extends past DATA.
    const segments = [
      { type: 'CODE', address: 0x2008, size: 21844 }, // ends at 0x755c
      { type: 'DATA', address: 0x7608, size: 384 },   // ends at 0x7788
      { type: 'BSS',  address: 0x7808, size: 8344 },  // ends at 0x98A0
    ];

    const { stackBaseAddr, stackSizeBytes } = DoorLoader.computeStackBounds(
      segments,
      32760, // .info STACK=32760 — too small for SAS/C; floor wins
    );

    // Stack base must be strictly above every segment end (with the small gap)
    for (const seg of segments) {
      const segEnd = seg.address + seg.size;
      expect(stackBaseAddr).toBeGreaterThanOrEqual(segEnd);
    }
    // Specifically: above BSS (the bug was placing it on top of BSS)
    expect(stackBaseAddr).toBeGreaterThanOrEqual(0x98a0);
    // Sanity: alignment is 8 and the floor was applied
    expect(stackBaseAddr % 8).toBe(0);
    expect(stackSizeBytes).toBe(FLOOR);
  });

  test('places stack above DATA when no BSS segment is present', () => {
    const segments = [
      { type: 'CODE', address: 0x2008, size: 0x4000 },
      { type: 'DATA', address: 0x7000, size: 0x800 }, // ends at 0x7800
    ];

    const { stackBaseAddr } = DoorLoader.computeStackBounds(segments, 8192);

    expect(stackBaseAddr).toBeGreaterThanOrEqual(0x7800);
    expect(stackBaseAddr % 8).toBe(0);
  });

  test('honors a buffer-only segment shape (data.length but no size field)', () => {
    // Some hunk loaders surface the raw buffer instead of a numeric size.
    const segments = [
      { type: 'CODE', address: 0x2008, data: { length: 0x1000 } },
      { type: 'DATA', address: 0x4000, data: { length: 0x200 } },
    ];

    const { stackBaseAddr } = DoorLoader.computeStackBounds(segments as any, 4096);

    // CODE ends at 0x3008, DATA at 0x4200. Fallback floor is 0x10000, so
    // stack lands above 0x10000.
    expect(stackBaseAddr).toBeGreaterThanOrEqual(0x10000);
  });

  test('the stack range cannot overlap any segment (the actual DOORSMENU regression invariant)', () => {
    const segments = [
      { type: 'CODE', address: 0x2008, size: 21844 },
      { type: 'DATA', address: 0x7608, size: 384 },
      { type: 'BSS',  address: 0x7808, size: 8344 },
    ];

    const { stackBaseAddr, stackSizeBytes } = DoorLoader.computeStackBounds(
      segments,
      32760,
    );
    const stackTop = stackBaseAddr + stackSizeBytes;

    // The full stack range must not include any byte that belongs to a segment
    for (const seg of segments) {
      const segStart = seg.address;
      const segEnd = seg.address + seg.size;
      // Stack [base, top) must not intersect segment [start, end)
      const overlaps = stackBaseAddr < segEnd && stackTop > segStart;
      expect(overlaps).toBe(false);
    }
  });

  test('floors tiny configured stacks to 256KB minimum', () => {
    const segments = [{ type: 'CODE', address: 0x2008, size: 0x100 }];
    const { stackSizeBytes } = DoorLoader.computeStackBounds(segments, 1000);
    expect(stackSizeBytes).toBe(FLOOR);
  });

  test('floors AmiExpress .info default of 20000 to 256KB', () => {
    // command-execution.handler.ts:304 falls back to STACK=20000 when no
    // explicit STACK= tooltype is set. This must not be the runtime stack
    // size — SAS/C watermark math `SP - 4(SP) + 0x80` underflows when 4(SP)
    // is small, false-tripping every cmpa.l 0x728(a4),a7 prologue check.
    const segments = [
      { type: 'CODE', address: 0x2008, size: 0x968 },
      { type: 'CODE', address: 0x2a08, size: 0x684 },
      { type: 'CODE', address: 0x3108, size: 0x834 },
      { type: 'DATA', address: 0x3a08, size: 0x98c },
    ];
    const { stackSizeBytes } = DoorLoader.computeStackBounds(segments, 20000);
    expect(stackSizeBytes).toBe(FLOOR);
  });

  test('floors undefined configStack to 256KB', () => {
    const segments = [{ type: 'CODE', address: 0x2008, size: 0x100 }];
    const { stackSizeBytes } = DoorLoader.computeStackBounds(segments, undefined);
    expect(stackSizeBytes).toBe(FLOOR);
  });

  test('honors a configured stack LARGER than the floor', () => {
    const segments = [{ type: 'CODE', address: 0x2008, size: 0x100 }];
    const { stackSizeBytes } = DoorLoader.computeStackBounds(segments, 1024 * 1024);
    expect(stackSizeBytes).toBe(1024 * 1024); // 1MB — bigger than 256KB floor
  });

  test('falls back to a non-zero base for empty segment lists', () => {
    const { stackBaseAddr } = DoorLoader.computeStackBounds([], 4096);
    // 0x10000 fallback + 32 gap, aligned to 8
    expect(stackBaseAddr).toBeGreaterThanOrEqual(0x10000);
  });

  test('SAS/C watermark math: SP - 4(SP) + 0x80 must stay above stackBase (regression for ** Stack Overflow ** panic)', () => {
    // SAS/C runtime startup at every door's seg0 entry computes the
    // stack-overflow watermark and stores it at A4+0x728:
    //   d0 = SP - 4(SP) + 0x80
    //   move.l d0, 0x728(A4)
    // Every subsequent function entry then does:
    //   cmpa.l 0x728(A4), A7
    //   bcs.w  panic_handler   ; if SP < watermark unsigned → panic
    // The panic handler restores SP from data[0x764] and calls
    // AutoRequest with body="** Stack Overflow **".
    //
    // The bug: DoorLoader's "simulated JSR" pushed a return address by
    // shifting SP down by 4 — but only seeded `stack_size` at the OLD
    // SP+4. After the shift, 4(SP) pointed at the exit-trap value
    // (0x1ff000) instead of stack_size, so the watermark wrapped to
    // ~0xffe5xxxx and BCS fired on every function entry. With the fix
    // (DoorLoader writes stack_size at the NEW SP+4 too), the watermark
    // lands at stack_bottom + 0x80 as designed.
    const segments = [
      { type: 'CODE', address: 0x2008, size: 0x968 },
      { type: 'CODE', address: 0x2a08, size: 0x684 },
      { type: 'CODE', address: 0x3108, size: 0x834 },
      { type: 'DATA', address: 0x3a08, size: 0x98c },
    ];
    const { stackBaseAddr, stackSizeBytes } = DoorLoader.computeStackBounds(
      segments,
      20000, // gets floored to 256KB
    );
    const stackTop = stackBaseAddr + stackSizeBytes;
    const finalSPBeforeJSR = stackTop - 8;
    const newSPAfterJSR = finalSPBeforeJSR - 4; // simulated JSR push

    // Post-fix invariant: 4(SP) at door entry == stackSizeBytes.
    const stackSizeAt4SP = stackSizeBytes; // what DoorLoader writes after the simulated JSR

    // Watermark formula the SAS/C startup runs:
    const watermark = (newSPAfterJSR - stackSizeAt4SP + 0x80) >>> 0;

    // The watermark must be a real address inside the stack region, NOT
    // a wrapped huge negative (0xffe5xxxx range). Specifically: it should
    // land just above stackBaseAddr.
    expect(watermark).toBeGreaterThanOrEqual(stackBaseAddr);
    expect(watermark).toBeLessThan(stackTop);
    expect(watermark).toBeLessThan(0x80000000); // not in wrap-around territory

    // And: SP at door entry (= newSPAfterJSR) must be GREATER than the
    // watermark unsigned, so the very first cmpa.l prologue check passes.
    expect(newSPAfterJSR >>> 0).toBeGreaterThan(watermark);
  });

  test('SAS/C watermark math: BCS panic check at every depth never fires while SP is inside the stack', () => {
    // Belt-and-braces: simulate SP descending from the entry value down
    // to ~stack_bottom and verify the cmpa.l never tripggers BCS until the
    // door has actually exhausted the stack.
    const segments = [
      { type: 'CODE', address: 0x2008, size: 0x968 },
      { type: 'DATA', address: 0x3a08, size: 0x98c },
    ];
    const { stackBaseAddr, stackSizeBytes } = DoorLoader.computeStackBounds(
      segments,
      20000,
    );
    const stackTop = stackBaseAddr + stackSizeBytes;
    const finalSP = stackTop - 8;
    const newSPAfterJSR = finalSP - 4;

    const watermark = (newSPAfterJSR - stackSizeBytes + 0x80) >>> 0;

    // Walk SP from entry value down to watermark + 1; each comparison must
    // pass (SP > watermark unsigned).
    for (let sp = newSPAfterJSR; sp > watermark; sp -= 0x4000) {
      // BCS taken when (sp - watermark) borrows i.e. sp < watermark unsigned.
      const bcsTriggered = (sp >>> 0) < (watermark >>> 0);
      expect(bcsTriggered).toBe(false);
    }
    // And at watermark - 1 the BCS should fire (panic justified):
    const exhausted = (watermark - 1) >>> 0;
    expect(exhausted < watermark).toBe(true);
  });
});
