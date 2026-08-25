/**
 * Hat-switch D-pads.
 *
 * Reported live 2026-08-25 with an 8BitDo NES30 Pro over USB: "the D-pad and
 * everything works in a joypad testing app, but I can't bind the D-pad in
 * GMASTER". A tester shows raw axes, which is exactly the difference - a pad
 * the browser cannot fit to the standard layout has no buttons 12-15 and
 * reports its D-pad as a single hat axis instead, so deriving the D-pad from
 * those buttons produced nothing at all to bind.
 *
 * The hat holds one of eight positions spaced 2/7 apart starting at -1 for
 * up and running clockwise, and rests OUTSIDE that range when centred.
 */

import { describe, it, expect } from 'vitest';
import { readHatAxis, normalizeAxis, isHatAxis } from '../../../../packages/terminal/src/utils/gamepad-manager';

/** The eight hat positions, as the browser reports them. */
const UP = -1;
const UP_RIGHT = -1 + (2 / 7) * 1;
const RIGHT = -1 + (2 / 7) * 2;
const DOWN_RIGHT = -1 + (2 / 7) * 3;
const DOWN = -1 + (2 / 7) * 4;
const DOWN_LEFT = -1 + (2 / 7) * 5;
const LEFT = -1 + (2 / 7) * 6;
const UP_LEFT = -1 + (2 / 7) * 7;
const CENTRED = 3.2857142857142856;

/** A pad with two sticks and a hat on axis 9, like the reported one. */
function axesWithHat(hat: number): number[] {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0, hat];
}

describe('reading a hat-switch D-pad', () => {
  it('reads the four straight directions', () => {
    expect(readHatAxis(axesWithHat(UP))).toMatchObject({ up: true, down: false });
    expect(readHatAxis(axesWithHat(DOWN))).toMatchObject({ down: true, up: false });
    expect(readHatAxis(axesWithHat(LEFT))).toMatchObject({ left: true, right: false });
    expect(readHatAxis(axesWithHat(RIGHT))).toMatchObject({ right: true, left: false });
  });

  it('reads the diagonals as both of their directions', () => {
    expect(readHatAxis(axesWithHat(UP_RIGHT))).toMatchObject({ up: true, right: true });
    expect(readHatAxis(axesWithHat(DOWN_RIGHT))).toMatchObject({ down: true, right: true });
    expect(readHatAxis(axesWithHat(DOWN_LEFT))).toMatchObject({ down: true, left: true });
    expect(readHatAxis(axesWithHat(UP_LEFT))).toMatchObject({ up: true, left: true });
  });

  it('reports nothing when the hat is centred', () => {
    // A centred hat rests outside [-1, 1]; without this it would decode to
    // the same position as "up" and the menu would scroll forever.
    expect(readHatAxis(axesWithHat(CENTRED))).toBeNull();
  });

  it('leaves a pad with only sticks alone', () => {
    // Sticks live on axes 0-3 and must never be mistaken for a hat.
    expect(readHatAxis([0.5, -0.5, 0, 0])).toBeNull();
  });

  it('finds the hat at the end of the axis list', () => {
    expect(readHatAxis([0, 0, 0, 0, UP])).toMatchObject({ up: true });
    expect(readHatAxis([0, 0, 0, 0, 0, 0, DOWN])).toMatchObject({ down: true });
  });

  it('ignores a trigger-style axis resting at -1', () => {
    // From a real 8BitDo NES30 Pro dump: AXIS 3 and AXIS 4 rest at -1.00000
    // while the hat is AXIS 9. Treating -1 on an early axis as a hat would
    // read as a D-pad permanently held UP.
    const nes30 = [0.00392, -0.00392, 0, -1, -1, 0, 0, 0, 0, CENTRED];

    expect(readHatAxis(nes30)).toBeNull();
  });

  it('ignores a resting stick sitting on a later axis', () => {
    const restingAxes = [0, 0, 0, 0, 0, 0, 0, 0, 0, CENTRED];

    expect(readHatAxis(restingAxes)).toBeNull();
  });
});

describe('axes that do not rest at zero', () => {
  // From the reporter's 8BitDo NES30 Pro dump: AXIS 3 and AXIS 4 read
  // -1.00000 untouched, and AXIS 9 (the hat) reads 3.28571. Reported raw,
  // axis 3 looked permanently pushed - anything bound to it fired forever,
  // and the binder captured the resting axis instead of the pressed one.
  it('reports an untouched axis as centred, wherever it rests', () => {
    expect(normalizeAxis(-1, -1)).toBe(0);
    expect(normalizeAxis(0, 0)).toBe(0);
  });

  it('reports a pressed axis as deflected', () => {
    // -1 at rest going to +1 pressed is a full deflection.
    expect(normalizeAxis(1, -1)).toBe(1);
    expect(normalizeAxis(0, -1)).toBe(1);
  });

  it('leaves ordinary sticks exactly as they were', () => {
    expect(normalizeAxis(0.5, 0)).toBe(0.5);
    expect(normalizeAxis(-0.5, 0)).toBe(-0.5);
  });

  it('never reports more than a full deflection', () => {
    expect(normalizeAxis(1, -1)).toBeLessThanOrEqual(1);
    expect(normalizeAxis(-1, 1)).toBeGreaterThanOrEqual(-1);
  });

  it('knows a hat from a stick by where it rests', () => {
    expect(isHatAxis(3.28571)).toBe(true);
    expect(isHatAxis(1.28571)).toBe(true);
    expect(isHatAxis(0)).toBe(false);
    expect(isHatAxis(-1)).toBe(false);
  });
});
