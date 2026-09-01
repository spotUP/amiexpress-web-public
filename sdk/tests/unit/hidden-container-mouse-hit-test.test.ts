/**
 * A hidden container's children must not stay mouse-live.
 *
 * Traced live in the sprite-editor door's final fix-wave review
 * (2026-09-01, Critical 1): `hide()` (element.ts) sets `_hidden`/`visible`
 * on THAT element only - `visible` is a plain field, not ancestor-aware,
 * and `_getCoords()` has no hidden check of its own. Screen's mouse
 * hit-testing (`_rebuildMouseIndex` and `getElementsAt`'s tree-walk
 * fallback, screen.ts) filtered hidden elements OUT of the index/result,
 * but the tree walk itself (`walk()`) recursed into `el.children`
 * unconditionally regardless of what the filter callback did - so a
 * hidden container's children stayed indexed at their last-known
 * coordinates and kept firing mouse events for whatever now covered
 * them, even though rendering already skips a hidden parent's whole
 * subtree (element.ts's renderElement()/_renderElement()).
 *
 * These tests drive the real hit-test path (Screen's private
 * getElementsAt, reached the same way other SDK tests reach into Screen
 * internals - see question-trap.test.ts) rather than asserting on the
 * hidden/visible flags themselves, so a future regression that restores
 * the stale-index bug fails here even if the flags still look right.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { Box } from '../../engines/ui/blessed/widgets/box';

function makeScreen(): any {
  return new Screen({ title: 'hidden-container-hit-test', width: 80, height: 24 } as any);
}

/** The real, private hit-test Screen uses to route every mouse event. */
function elementsAt(screen: any, x: number, y: number): any[] {
  return screen.getElementsAt(x, y);
}

describe('mouse hit-testing against a hidden container', () => {
  let screen: any;

  afterEach(() => screen?.destroy());

  it('does not return a hidden container itself', () => {
    screen = makeScreen();
    const container = new Box({
      parent: screen, top: 0, left: 0, width: 10, height: 3, mouse: true,
    } as any);

    container.hide();

    expect(elementsAt(screen, 2, 1)).not.toContain(container);
  });

  it('does not return a hidden container\'s CHILDREN either', () => {
    // The actual bug: the child, not just the parent, stayed hit-testable.
    screen = makeScreen();
    const container = new Box({
      parent: screen, top: 0, left: 0, width: 10, height: 3, mouse: true,
    } as any);
    const child = new Box({
      parent: container, top: 0, left: 0, width: 10, height: 3, mouse: true,
    } as any);

    container.hide();

    const hits = elementsAt(screen, 2, 1);
    expect(hits).not.toContain(child);
    expect(hits).not.toContain(container);
  });

  it('does not return a GRANDCHILD of a hidden container', () => {
    screen = makeScreen();
    const container = new Box({
      parent: screen, top: 0, left: 0, width: 10, height: 3, mouse: true,
    } as any);
    const child = new Box({
      parent: container, top: 0, left: 0, width: 10, height: 3, mouse: true,
    } as any);
    const grandchild = new Box({
      parent: child, top: 0, left: 0, width: 10, height: 3, mouse: true,
    } as any);

    container.hide();

    expect(elementsAt(screen, 2, 1)).not.toContain(grandchild);
  });

  it('restores the children once the container is shown again', () => {
    // The mouse index is a cache, invalidated on render() rather than on
    // every hide()/show() (a deliberate perf choice - see
    // _rebuildMouseIndex's doc comment: rebuilding on every visibility
    // flip walked the whole tree even while nothing ever queries the
    // index). A door always calls screen.render() after changing what is
    // hidden/shown (app.ts's own hide/show lists end in a render()), so
    // this drives the real invalidation trigger rather than querying a
    // cache nothing has told to refresh.
    screen = makeScreen();
    const container = new Box({
      parent: screen, top: 0, left: 0, width: 10, height: 3, mouse: true,
    } as any);
    const child = new Box({
      parent: container, top: 0, left: 0, width: 10, height: 3, mouse: true,
    } as any);

    container.hide();
    expect(elementsAt(screen, 2, 1)).not.toContain(child);

    container.show();
    screen.render();
    expect(elementsAt(screen, 2, 1)).toContain(child);
  });

  it('does not fire a mouse event on a hidden container\'s child (the real dispatch path)', () => {
    // Same bug, exercised through the public program.emit('mouse', ...)
    // path handleMouseEvent uses in production, not the private
    // getElementsAt helper directly.
    screen = makeScreen();
    const container = new Box({
      parent: screen, top: 0, left: 0, width: 10, height: 3, mouse: true,
    } as any);
    const child = new Box({
      parent: container, top: 0, left: 0, width: 10, height: 3, mouse: true,
    } as any);
    const onMouseOver = jest.fn();
    child.on('mouseover', onMouseOver);

    container.hide();
    screen.program.emit('mouse', { x: 2, y: 1, action: 'mousemove' });

    expect(onMouseOver).not.toHaveBeenCalled();
  });

  it('still hits a SIBLING at the same coordinates once the container is hidden', () => {
    // The exploit shape from the door report: a hidden element's stale
    // hit-box shadows whatever now legitimately occupies that space.
    screen = makeScreen();
    const container = new Box({
      parent: screen, top: 0, left: 0, width: 10, height: 3, mouse: true,
    } as any);
    new Box({ parent: container, top: 0, left: 0, width: 10, height: 3, mouse: true } as any);

    container.hide();
    const sibling = new Box({
      parent: screen, top: 0, left: 0, width: 10, height: 3, mouse: true,
    } as any);

    expect(elementsAt(screen, 2, 1)).toEqual([sibling]);
  });
});
