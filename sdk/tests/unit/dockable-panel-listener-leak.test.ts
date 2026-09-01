/**
 * DockablePanel must not leak screen-level listeners past destroy().
 *
 * Traced live in the sprite-editor door's final fix-wave review
 * (2026-09-01, Important 2): bindScreenEvents() (dockable-panel.ts)
 * registered `screen.on('mousemove'|'mouseup'|'resize', <anonymous
 * closure>)` directly, bypassing the SDK's tracked `_slisteners`
 * (element.ts's onScreenEvent/_slisteners). Element.destroy()'s
 * _unbindScreenEvents() only removes what is in `_slisteners`, so these
 * three survived destroy() forever, each still closing over a destroyed
 * panel. The sprite-editor's EditScreen builds four panels per editor
 * open and destroys them on exit - +4 permanent mousemove listeners per
 * open. This repo has a documented door-freeze class caused by a mouse-
 * move flood (see project_door_freeze_invariants), which is why a
 * leaked mousemove listener specifically matters, not just memory.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { DockablePanel } from '../../engines/ui/blessed/widgets/dockable-panel';

function makeScreen(): any {
  return new Screen({ title: 'panel-leak', width: 80, height: 24 } as any);
}

function makePanel(screen: any): any {
  return new DockablePanel({
    parent: screen,
    title: ' Panel ',
    top: 1,
    left: 1,
    width: 20,
    height: 10,
    dockPosition: 'float',
    border: { type: 'line' },
  } as any);
}

describe('DockablePanel screen-listener lifecycle', () => {
  let screen: any;

  afterEach(() => screen?.destroy());

  it('leaves the screen listener count exactly where it found it, after destroy', () => {
    screen = makeScreen();
    const baseline = {
      mousemove: screen.listenerCount('mousemove'),
      mouseup: screen.listenerCount('mouseup'),
      resize: screen.listenerCount('resize'),
    };

    const panel = makePanel(screen);
    // The panel must actually have registered something, or this test
    // would pass vacuously.
    expect(screen.listenerCount('mousemove')).toBeGreaterThan(baseline.mousemove);
    expect(screen.listenerCount('mouseup')).toBeGreaterThan(baseline.mouseup);
    expect(screen.listenerCount('resize')).toBeGreaterThan(baseline.resize);

    panel.destroy();

    expect(screen.listenerCount('mousemove')).toBe(baseline.mousemove);
    expect(screen.listenerCount('mouseup')).toBe(baseline.mouseup);
    expect(screen.listenerCount('resize')).toBe(baseline.resize);
  });

  it('does not accumulate listeners across repeated open/close cycles', () => {
    // The exact production shape: EditScreen builds four panels per
    // editor open and destroys them on exit - this proves N cycles leave
    // the SAME count as one cycle, not a growing one.
    screen = makeScreen();
    const baseline = screen.listenerCount('mousemove');

    for (let i = 0; i < 4; i++) {
      const panel = makePanel(screen);
      panel.destroy();
    }

    expect(screen.listenerCount('mousemove')).toBe(baseline);
  });

  it('a destroyed panel never runs its mousemove handler again', () => {
    // Not just a count check: prove the closure itself is gone by
    // observing it can no longer touch the (destroyed) panel's state -
    // put the panel mid-drag, destroy it, and confirm the drag handler
    // that closure would have called never fires.
    screen = makeScreen();
    const panel = makePanel(screen);
    (panel as any).isDragging = true;
    const handleDragSpy = jest.spyOn(panel as any, 'handleDrag');

    panel.destroy();
    screen.emit('mousemove', { x: 5, y: 5 });

    expect(handleDragSpy).not.toHaveBeenCalled();
  });
});
