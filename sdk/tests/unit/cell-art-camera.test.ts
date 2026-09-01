/**
 * The camera over a board bigger than the screen.
 *
 * Camera arithmetic is the kind that looks right and is off by one: the
 * failure modes are a window that runs past the edge of the world and shows
 * a band of nothing, or one that never quite reaches the last column so the
 * far edge of the board is unreachable. Both are pinned here.
 */

import {
  cameraView, cropBuffer, offScreenMarkers, createBuffer, Cell, CellBuffer,
} from '../../engines/graphics/cell-art';

const c = (char: string): Cell => ({ char, fg: 7, bg: 0 });

/** A world whose every cell knows its own coordinates. */
function world(width: number, height: number): CellBuffer {
  const buf = createBuffer(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) buf[y][x] = c(`${x},${y}`);
  }
  return buf;
}

describe('cameraView', () => {
  it('centres the window on the focus', () => {
    const view = cameraView({ width: 100, height: 100 }, { width: 10, height: 10 }, { x: 50, y: 50 });
    expect(view).toEqual({ x: 45, y: 45, width: 10, height: 10 });
  });

  it('never runs off the left or top of the world', () => {
    const view = cameraView({ width: 100, height: 100 }, { width: 10, height: 10 }, { x: 0, y: 0 });
    expect(view.x).toBe(0);
    expect(view.y).toBe(0);
  });

  it('never runs off the right or bottom of the world', () => {
    const view = cameraView({ width: 100, height: 100 }, { width: 10, height: 10 }, { x: 99, y: 99 });
    expect(view.x).toBe(90);
    expect(view.y).toBe(90);
    expect(view.x + view.width).toBe(100);
    expect(view.y + view.height).toBe(100);
  });

  it('reaches the last cell of the world', () => {
    // The off-by-one that makes a board's far edge unreachable.
    const view = cameraView({ width: 13, height: 15 }, { width: 13, height: 12 }, { x: 6, y: 14 });
    expect(view.y + view.height).toBe(15);
  });

  it('does not scroll an axis the world does not fill', () => {
    const view = cameraView({ width: 8, height: 100 }, { width: 16, height: 10 }, { x: 4, y: 50 });
    expect(view.x).toBe(0);
    expect(view.width).toBe(8);      // the window shrinks to the world
    expect(view.y).toBe(45);         // but the tall axis still scrolls
  });

  it('is safe on a world that fits entirely', () => {
    const view = cameraView({ width: 16, height: 11 }, { width: 80, height: 25 }, { x: 8, y: 5 });
    expect(view).toEqual({ x: 0, y: 0, width: 16, height: 11 });
  });

  describe('with a deadzone', () => {
    it('does not move while the focus stays inside it', () => {
      const previous = { x: 45, y: 45 };
      const view = cameraView(
        { width: 100, height: 100 }, { width: 10, height: 10 },
        { x: 47, y: 47 }, { deadzone: 2, previous }
      );
      expect(view.x).toBe(45);
      expect(view.y).toBe(45);
    });

    it('moves just enough once the focus leaves it', () => {
      const previous = { x: 45, y: 45 };
      const view = cameraView(
        { width: 100, height: 100 }, { width: 10, height: 10 },
        { x: 44, y: 45 }, { deadzone: 2, previous }
      );
      expect(view.x).toBe(42);        // focus - deadzone, not re-centred
    });

    it('still clamps to the world', () => {
      const view = cameraView(
        { width: 100, height: 100 }, { width: 10, height: 10 },
        { x: 0, y: 0 }, { deadzone: 3, previous: { x: 2, y: 2 } }
      );
      expect(view.x).toBe(0);
      expect(view.y).toBe(0);
    });
  });
});

describe('cropBuffer', () => {
  it('takes the window out of the world, at the right offset', () => {
    const out = cropBuffer(world(20, 20), { x: 5, y: 7, width: 3, height: 2 });
    expect(out.map(r => r.map(cell => cell?.char).join(' '))).toEqual([
      '5,7 6,7 7,7',
      '5,8 6,8 7,8',
    ]);
  });

  it('produces a buffer of exactly the window size', () => {
    const out = cropBuffer(world(20, 20), { x: 0, y: 0, width: 4, height: 3 });
    expect(out.length).toBe(3);
    expect(out[0].length).toBe(4);
  });

  it('leaves overhang transparent rather than inventing cells', () => {
    const out = cropBuffer(world(4, 4), { x: 2, y: 2, width: 4, height: 4 });
    expect(out[0][0]?.char).toBe('2,2');
    expect(out[0][3]).toBeNull();     // past the right edge of the world
    expect(out[3][0]).toBeNull();     // past the bottom
  });

  it('copies cells rather than sharing them', () => {
    const source = world(4, 4);
    const out = cropBuffer(source, { x: 0, y: 0, width: 2, height: 2 });
    out[0][0]!.char = 'X';
    expect(source[0][0]!.char).toBe('0,0');
  });
});

describe('offScreenMarkers', () => {
  const window = { x: 10, y: 10, width: 10, height: 10 };   // covers 10..19

  it('says nothing about what is on screen', () => {
    expect(offScreenMarkers(window, [{ x: 10, y: 10 }, { x: 19, y: 19 }])).toEqual([]);
  });

  it('names the edge a hidden thing lies past', () => {
    const markers = offScreenMarkers(window, [
      { x: 15, y: 3 },    // above
      { x: 15, y: 40 },   // below
      { x: 2, y: 15 },    // left
      { x: 40, y: 15 },   // right
    ]);
    expect(markers.map(m => m.direction)).toEqual(['n', 's', 'w', 'e']);
  });

  it('names the corners too - it is an eight-way camera', () => {
    const markers = offScreenMarkers(window, [
      { x: 2, y: 2 }, { x: 40, y: 2 }, { x: 2, y: 40 }, { x: 40, y: 40 },
    ]);
    expect(markers.map(m => m.direction)).toEqual(['nw', 'ne', 'sw', 'se']);
  });

  it('reports how far outside a thing is', () => {
    const [marker] = offScreenMarkers(window, [{ x: 15, y: 5 }]);
    expect(marker.distance).toBe(5);   // five rows above the window's top
  });

  it('hands back the caller own item, so a door can draw what it likes', () => {
    const enemy = { x: 40, y: 15, name: 'sno-bee' };
    const [marker] = offScreenMarkers(window, [enemy]);
    expect(marker.item).toBe(enemy);
  });
});
