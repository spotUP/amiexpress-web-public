/**
 * Regression: a door's hunks must never be loaded on top of the emulator.
 *
 * Background (2026-08-31, DoorRepo):
 *   HunkLoader packs a door's segments upward from 0x2000 and knows nothing
 *   about ExecBase (0x80000), the library stubs, the AllocMem heap
 *   (0x100000), the environment store (0x120000) or the ReadArgs heap
 *   (0x140000). DoorRepo's BSS grew from 0x599f4 to 0x6a7fc between the 20
 *   August build and the current source, which pushed its segments from
 *   ending at 0x06e8fc to ending at 0x085d04 — 24 KB past the LVO table.
 *
 *   HUNK_BSS is ZEROED as it loads, so the door blanked 126 of
 *   exec.library's LVO trap vectors (0x7fcf4-0x7ffe2) before executing a
 *   single instruction. Both builds then ran the identical vbcc startup to
 *   PC 0x214c; the old one went on to AllocVec + StackSwap and into main,
 *   the new one read the blanked memory, closed dos.library and exited
 *   RETURN_FAIL. The emulator logged "VERIFICATION: 230 OK, 126 FAILED!"
 *   and carried on regardless. Two sessions read that as a C regression in
 *   the door and went looking for the wrong commit.
 *
 * Fix:
 *   memory-map.ts owns the addresses and assertDoorSegmentsFit refuses the
 *   load, naming the segment, its span and what it would have destroyed.
 *   DoorLoader calls it BEFORE HunkLoader.load — after load, the damage is
 *   already done.
 */

import {
  assertDoorSegmentsFit,
  reservedRegionsInSpan,
  DoorTooLargeError,
  DOOR_SEGMENT_BASE,
  DOOR_SEGMENT_LIMIT,
  EXEC_BASE_ADDR,
} from '../../src/amiga-emulation/memory-map';

describe('assertDoorSegmentsFit — a door may not be loaded over the emulator (regression)', () => {
  /** DoorRepo built from current source, 2026-08-31. The binary that failed. */
  const DOORREPO_BROKEN = [
    { type: 'CODE', address: 0x2008, size: 0x18df4 }, // ends 0x1adfc
    { type: 'DATA', address: 0x1ae08, size: 0x3c },
    { type: 'DATA', address: 0x1af08, size: 0x348 },
    { type: 'DATA', address: 0x1b308, size: 0xc },
    { type: 'DATA', address: 0x1b408, size: 0x14 },
    { type: 'BSS', address: 0x1b508, size: 0x6a7fc }, // ends 0x85d04
  ];

  /** DoorRepo's 20 August build — the one that runs. */
  const DOORREPO_WORKING = [
    { type: 'CODE', address: 0x2008, size: 0x127f8 }, // ends 0x14800
    { type: 'DATA', address: 0x14808, size: 0x3c },
    { type: 'DATA', address: 0x14908, size: 0x33c },
    { type: 'DATA', address: 0x14d08, size: 0xc },
    { type: 'DATA', address: 0x14e08, size: 0x14 },
    { type: 'BSS', address: 0x14f08, size: 0x599f4 }, // ends 0x6e8fc
  ];

  test('rejects the DoorRepo build whose BSS reached 0x85d04', () => {
    expect(() => assertDoorSegmentsFit(DOORREPO_BROKEN, 'doorrepo.amiga')).toThrow(
      DoorTooLargeError,
    );
  });

  test('accepts the 20 August DoorRepo build that runs', () => {
    expect(() =>
      assertDoorSegmentsFit(DOORREPO_WORKING, 'doorrepo.amiga'),
    ).not.toThrow();
  });

  test('the message names the door, the offending segment and its span', () => {
    let message = '';
    try {
      assertDoorSegmentsFit(DOORREPO_BROKEN, 'doorrepo.amiga');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('doorrepo.amiga');
    expect(message).toContain('segment 5 (BSS)');
    expect(message).toContain('0x1b508-0x85d04');
  });

  test('the message names what the load would have overwritten', () => {
    let message = '';
    try {
      assertDoorSegmentsFit(DOORREPO_BROKEN, 'doorrepo.amiga');
    } catch (err) {
      message = (err as Error).message;
    }
    // The exact damage taken in the incident: the 126 blanked exec vectors,
    // and ExecBase itself 24 KB further up. It stopped short of dos.library.
    expect(message).toContain('exec.library LVO jump table');
    expect(message).toContain('ExecBase');
    expect(message).not.toContain('dos.library');
  });

  test('a segment that runs further names every region it would destroy', () => {
    let message = '';
    try {
      assertDoorSegmentsFit(
        [{ type: 'BSS', address: 0x1b508, size: 0x130000 }], // ends 0x14b508
        'huge.amiga',
      );
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('dos.library');
    expect(message).toContain('the AllocMem heap');
    expect(message).toContain('environment variable structures');
    expect(message).toContain('the ReadArgs heap');
  });

  test('the ceiling sits BELOW ExecBase, because the LVO vectors do too', () => {
    // The vectors are at negative offsets from the library base — the lowest
    // exec one observed in the incident was 0x7fcf4. A limit of 0x80000
    // would have let the broken build through.
    expect(DOOR_SEGMENT_LIMIT).toBeLessThan(EXEC_BASE_ADDR);
    expect(DOOR_SEGMENT_LIMIT).toBeLessThan(0x7fcf4);
  });

  test('a segment ending exactly at the limit is allowed; one byte more is not', () => {
    const exact = [{ type: 'BSS', address: 0x2008, size: DOOR_SEGMENT_LIMIT - 0x2008 }];
    expect(() => assertDoorSegmentsFit(exact, 'edge.amiga')).not.toThrow();

    const oneOver = [
      { type: 'BSS', address: 0x2008, size: DOOR_SEGMENT_LIMIT - 0x2008 + 1 },
    ];
    expect(() => assertDoorSegmentsFit(oneOver, 'edge.amiga')).toThrow(
      DoorTooLargeError,
    );
  });

  test('accepts an ordinary small door', () => {
    const segments = [
      { type: 'CODE', address: 0x2008, size: 21844 },
      { type: 'DATA', address: 0x7608, size: 384 },
      { type: 'BSS', address: 0x7808, size: 8344 },
    ];
    expect(() => assertDoorSegmentsFit(segments, 'doorsmenu')).not.toThrow();
  });

  test('accepts an empty segment list rather than throwing on nothing', () => {
    expect(() => assertDoorSegmentsFit([], 'empty.amiga')).not.toThrow();
  });

  test('sizes a segment from data.length when it carries no size field', () => {
    const segments = [
      { type: 'BSS', address: 0x2008, data: { length: 0x200000 } },
    ];
    expect(() => assertDoorSegmentsFit(segments, 'buffer-shape')).toThrow(
      DoorTooLargeError,
    );
  });

  test('reports the offending segment even when a later one is smaller', () => {
    // The check must find the highest end, not the last segment.
    const segments = [
      { type: 'BSS', address: 0x2008, size: 0x180000 },
      { type: 'DATA', address: 0x2008, size: 0x10 },
    ];
    let message = '';
    try {
      assertDoorSegmentsFit(segments, 'ordering');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('segment 0 (BSS)');
  });

  test('reservedRegionsInSpan is empty inside the door region', () => {
    expect(reservedRegionsInSpan(DOOR_SEGMENT_BASE, DOOR_SEGMENT_LIMIT)).toEqual(
      [],
    );
  });

  test('reservedRegionsInSpan lists regions lowest-first', () => {
    const names = reservedRegionsInSpan(DOOR_SEGMENT_BASE, 0x141000);
    expect(names[0]).toBe('exec.library LVO jump table');
    expect(names[1]).toBe('ExecBase');
    expect(names[names.length - 1]).toBe('the ReadArgs heap');
  });
});
