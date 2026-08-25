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
import { readHatAxis } from '../../../../packages/terminal/src/utils/gamepad-manager';

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

  it('finds the hat wherever the pad puts it', () => {
    // Axis 9 is the usual home, but the layout is the device's choice.
    expect(readHatAxis([0, 0, 0, 0, UP])).toMatchObject({ up: true });
    expect(readHatAxis([0, 0, 0, 0, 0, 0, DOWN])).toMatchObject({ down: true });
  });

  it('ignores a resting stick sitting on a later axis', () => {
    const restingAxes = [0, 0, 0, 0, 0, 0, 0, 0, 0, CENTRED];

    expect(readHatAxis(restingAxes)).toBeNull();
  });
});
