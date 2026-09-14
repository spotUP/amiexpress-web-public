/**
 * A PETSCII surface holds what was drawn on it.
 *
 * The artist studio can edit ANSI and RIP; PETSCII was view-only, and this is
 * the model the editor draws on. Every operation is PURE - it returns a new
 * surface and leaves the one it was given alone - which is what lets undo be
 * a stack of 2 KB snapshots rather than a byte log.
 *
 * The surface IS a `PetsciiMachineState`, deliberately: `writeSeq` already
 * saves one and `PetsciiMachine.feed` already produces one, so there is no
 * adapter in either direction. An adapter is where a round trip goes wrong.
 */
import {
  blankSurface, cloneSurface, surfaceFromBytes, stamp, stampChar, colorize,
  floodFill, typeChar, liftRegion, stampRegion, setBackground, setCharsetBank,
  clearSurface, type PetsciiBrush, type PetsciiSurface,
} from '../../petscii/editor-surface';
import { writeSeq } from '../../petscii/seq-writer';

const WHITE_A: PetsciiBrush = { screenCode: 0x01, color: 1, reverse: false };
const RED_B: PetsciiBrush = { screenCode: 0x02, color: 2, reverse: false };

const at = (s: PetsciiSurface, x: number, y: number) => ({
  code: s.screen[y * s.cols + x],
  color: s.colorRam[y * s.cols + x],
});

describe('a PETSCII surface holds what was drawn on it', () => {
  it('stamps a glyph and its colour', () => {
    expect(at(stamp(blankSurface(), 3, 4, WHITE_A), 3, 4)).toEqual({ code: 0x01, color: 1 });
  });

  it('leaves the surface it was given alone', () => {
    const before = blankSurface();
    stamp(before, 3, 4, WHITE_A);
    expect(at(before, 3, 4).code).toBe(0x20);
  });

  it('sets the reverse bit from the brush', () => {
    expect(at(stamp(blankSurface(), 0, 0, { ...WHITE_A, reverse: true }), 0, 0).code).toBe(0x81);
  });

  it('ignores a stamp outside the surface', () => {
    const before = blankSurface();
    expect(stamp(before, 40, 0, WHITE_A)).toBe(before);
    expect(stamp(before, 0, 25, WHITE_A)).toBe(before);
    expect(stamp(before, -1, 0, WHITE_A)).toBe(before);
  });

  it('stampChar keeps the colour that was already there', () => {
    const s = stampChar(stamp(blankSurface(), 1, 1, RED_B), 1, 1, WHITE_A);
    expect(at(s, 1, 1)).toEqual({ code: 0x01, color: 2 });
  });

  it('colorize keeps the glyph that was already there', () => {
    const s = colorize(stamp(blankSurface(), 1, 1, RED_B), 1, 1, 7);
    expect(at(s, 1, 1)).toEqual({ code: 0x02, color: 7 });
  });

  it('a flood fill does not cross a colour boundary', () => {
    // A black space and a white space look identical and are not the same
    // cell - which is what a PETSCII artist means by "the same".
    let s = blankSurface();
    s = colorize(s, 1, 0, 1);
    s = floodFill(s, 0, 0, RED_B);
    expect(at(s, 0, 0).code).toBe(0x02);
    expect(at(s, 1, 0).code).toBe(0x20);
  });

  it('a flood fill spreads across every matching cell', () => {
    const s = floodFill(blankSurface(), 0, 0, RED_B);
    expect(at(s, 39, 24).code).toBe(0x02);
  });

  it('a flood fill onto its own brush changes nothing and terminates', () => {
    const filled = floodFill(blankSurface(), 0, 0, RED_B);
    const again = floodFill(filled, 0, 0, RED_B);
    expect([...again.screen]).toEqual([...filled.screen]);
  });

  it('typing converts a PETSCII byte with the shared table', () => {
    const { surface } = typeChar(blankSurface(), 0, 0, 0x41, 1, false);
    expect(at(surface, 0, 0).code).toBe(0x01);
  });

  it('typing wraps to the next row at the last column', () => {
    expect(typeChar(blankSurface(), 39, 0, 0x41, 1, false).cursor).toEqual({ x: 0, y: 1 });
  });

  it('typing in the last cell stays put, because an editor does not scroll its own art away', () => {
    expect(typeChar(blankSurface(), 39, 24, 0x41, 1, false).cursor).toEqual({ x: 39, y: 24 });
  });

  it('lifts a region and stamps it somewhere else', () => {
    let s = stamp(blankSurface(), 0, 0, WHITE_A);
    s = stamp(s, 1, 0, RED_B);
    const region = liftRegion(s, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(region).toMatchObject({ cols: 2, rows: 1 });
    const pasted = stampRegion(blankSurface(), 10, 10, region);
    expect(at(pasted, 10, 10)).toEqual({ code: 0x01, color: 1 });
    expect(at(pasted, 11, 10)).toEqual({ code: 0x02, color: 2 });
  });

  it('lifts a region however the corners were dragged', () => {
    const s = stamp(blankSurface(), 0, 0, WHITE_A);
    const backwards = liftRegion(s, { x: 1, y: 0 }, { x: 0, y: 0 });
    expect(backwards.cols).toBe(2);
    expect(backwards.screen[0]).toBe(0x01);
  });

  it('clips a region stamped over the edge instead of wrapping it', () => {
    const region = liftRegion(stamp(blankSurface(), 0, 0, WHITE_A), { x: 0, y: 0 }, { x: 1, y: 0 });
    const pasted = stampRegion(blankSurface(), 39, 0, region);
    expect(at(pasted, 39, 0).code).toBe(0x01);
    expect(at(pasted, 0, 1).code).toBe(0x20); // never wrapped onto the next row
  });

  it('setBackground sets the border too, because a C64 ties them', () => {
    const s = setBackground(blankSurface(), 6);
    expect(s.background).toBe(6);
    expect(s.border).toBe(6);
  });

  it('switching bank keeps every cell', () => {
    const after = setCharsetBank(stamp(blankSurface(), 5, 5, WHITE_A), 1);
    expect(after.charsetBank).toBe(1);
    expect(at(after, 5, 5)).toEqual({ code: 0x01, color: 1 });
  });

  it('clearing leaves a blank screen and keeps the background', () => {
    const s = clearSurface(setBackground(stamp(blankSurface(), 2, 2, WHITE_A), 6));
    expect(at(s, 2, 2).code).toBe(0x20);
    expect(s.background).toBe(6);
  });

  it('surfaceFromBytes reads a .seq back into a surface', () => {
    const back = surfaceFromBytes(writeSeq(stamp(blankSurface(), 0, 0, WHITE_A)));
    expect(at(back, 0, 0)).toEqual({ code: 0x01, color: 1 });
  });

  it('a clone is equal and separate', () => {
    const a = stamp(blankSurface(), 0, 0, WHITE_A);
    const b = cloneSurface(a);
    b.screen[0] = 0x20;
    expect(a.screen[0]).toBe(0x01);
  });
});
