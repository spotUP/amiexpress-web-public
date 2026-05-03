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
 */

import { DoorLoader } from '../../src/amiga-emulation/DoorLoader';

describe('DoorLoader.computeStackBounds — stack must clear all segments (regression)', () => {
  test('places stack above BSS when BSS is the highest segment (DOORSMENU shape)', () => {
    // Realistic DOORSMENU layout: BSS extends past DATA.
    const segments = [
      { type: 'CODE', address: 0x2008, size: 21844 }, // ends at 0x755c
      { type: 'DATA', address: 0x7608, size: 384 },   // ends at 0x7788
      { type: 'BSS',  address: 0x7808, size: 8344 },  // ends at 0x98A0
    ];

    const { stackBaseAddr, stackSizeBytes } = DoorLoader.computeStackBounds(
      segments,
      32760, // .info STACK=32760
    );

    // Stack base must be strictly above every segment end (with the small gap)
    for (const seg of segments) {
      const segEnd = seg.address + seg.size;
      expect(stackBaseAddr).toBeGreaterThanOrEqual(segEnd);
    }
    // Specifically: above BSS (the bug was placing it on top of BSS)
    expect(stackBaseAddr).toBeGreaterThanOrEqual(0x98a0);
    // Sanity: alignment is 8 and the requested size was honored
    expect(stackBaseAddr % 8).toBe(0);
    expect(stackSizeBytes).toBe(32760);
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
      { type: 'CODE', address: 0x2008, data: { length: 0x1000 } } as any,
      { type: 'DATA', address: 0x4000, data: { length: 0x200 } } as any,
    ];

    const { stackBaseAddr } = DoorLoader.computeStackBounds(segments, 4096);

    // CODE ends at 0x3008, DATA at 0x4200 → stack must be above 0x4200.
    expect(stackBaseAddr).toBeGreaterThanOrEqual(0x4200);
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

  test('clamps tiny configured stacks to 4KB minimum', () => {
    const segments = [{ type: 'CODE', address: 0x2008, size: 0x100 }];
    const { stackSizeBytes } = DoorLoader.computeStackBounds(segments, 1000);
    expect(stackSizeBytes).toBe(4096);
  });

  test('defaults to 64KB when configStack is undefined', () => {
    const segments = [{ type: 'CODE', address: 0x2008, size: 0x100 }];
    const { stackSizeBytes } = DoorLoader.computeStackBounds(segments, undefined);
    expect(stackSizeBytes).toBe(65536);
  });

  test('falls back to a non-zero base for empty segment lists', () => {
    const { stackBaseAddr } = DoorLoader.computeStackBounds([], 4096);
    // 0x10000 fallback + 32 gap, aligned to 8
    expect(stackBaseAddr).toBeGreaterThanOrEqual(0x10000);
  });

  test('with STACK=32760 the door has 32KB of headroom strictly above all segments (DOORSMENU end-to-end shape)', () => {
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

    // 25KB Config struct (DOORSMENU's `Config cfg`) on the stack must not
    // reach back into BSS. SP starts at top, drops by ~25KB during
    // load_config — stays inside the stack region.
    const SP_AFTER_25KB_LOCAL = stackTop - 25 * 1024;
    expect(SP_AFTER_25KB_LOCAL).toBeGreaterThanOrEqual(0x98a0);
  });
});
