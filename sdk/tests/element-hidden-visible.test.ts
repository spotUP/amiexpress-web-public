/**
 * `hidden` / `visible` desync regression tests.
 *
 * Symptom (GRANDMASTER lobby, 2026-08-25, reported live): the lobby's Bots
 * button never appeared, so a solo host had no way to add an AI opponent.
 * It reported `hidden === false`, sat at valid coordinates, belonged to the
 * render tree - and still painted nothing.
 *
 * Root cause: Element carried TWO independent flags, and renderElement()
 * tested both:
 *
 *     if (!this.visible || this.hidden) return;
 *
 * The constructor's `hidden: true` option routed through hide(), which
 * clears `hidden = true` AND `visible = false`. Revealing the button later
 * with the obvious `button.hidden = false` (what setAsHost() did) flipped
 * only ONE of them - `visible` stayed false forever, so the element was
 * "not hidden" yet permanently unpaintable.
 *
 * Fix: `hidden` is now an accessor that routes assignment through
 * show()/hide(), so the two flags cannot drift apart.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Screen, Box } from '../engines/ui/blessed';

function paintedRow(screen: any, y: number): string {
  const row = screen.buffer[y];
  if (!row) return '<no row>';
  return row.map((c: [number, string]) => c[1]).join('').replace(/\s+$/, '');
}

describe('Element hidden/visible', () => {
  let screen: Screen;

  beforeEach(() => {
    screen = new Screen({ title: 'Hidden Visible Test' });
  });

  afterEach(() => {
    if (screen && !screen.destroyed) screen.destroy();
  });

  it('keeps visible in sync when hidden is assigned directly', () => {
    const box: any = new Box({ parent: screen, top: 3, left: 1, width: 12, height: 1, content: 'HI', hidden: true } as any);

    expect(box.hidden).toBe(true);
    expect(box.visible).toBe(false);

    box.hidden = false;

    expect(box.hidden).toBe(false);
    expect(box.visible).toBe(true);

    box.hidden = true;

    expect(box.hidden).toBe(true);
    expect(box.visible).toBe(false);
  });

  it('actually paints an element revealed via `hidden = false`', () => {
    // Exactly the lobby's Bots button lifecycle: born hidden, revealed later.
    const box: any = new Box({ parent: screen, top: 3, left: 1, width: 12, height: 1, content: 'BOTS', hidden: true } as any);

    screen.render();
    expect(paintedRow(screen, 3)).not.toContain('BOTS');

    box.hidden = false;
    screen.render();

    expect(paintedRow(screen, 3)).toContain('BOTS');
  });

  it('stops painting an element hidden via `hidden = true`', () => {
    const box: any = new Box({ parent: screen, top: 3, left: 1, width: 12, height: 1, content: 'BOTS' } as any);

    screen.render();
    expect(paintedRow(screen, 3)).toContain('BOTS');

    box.hidden = true;
    screen.render();

    expect(paintedRow(screen, 3)).not.toContain('BOTS');
  });

  it('still supports the show()/hide() methods', () => {
    const box: any = new Box({ parent: screen, top: 3, left: 1, width: 12, height: 1, content: 'BOTS' } as any);

    box.hide();
    expect(box.hidden).toBe(true);
    expect(box.visible).toBe(false);

    box.show();
    expect(box.hidden).toBe(false);
    expect(box.visible).toBe(true);
  });

  it('does not recurse or double-fire when assigning the value it already has', () => {
    const box: any = new Box({ parent: screen, top: 3, left: 1, width: 12, height: 1, content: 'BOTS' } as any);
    let hideEvents = 0;
    box.on('hide', () => { hideEvents++; });

    box.hidden = false;          // already false - must be a no-op
    expect(hideEvents).toBe(0);

    box.hidden = true;
    box.hidden = true;           // repeat - must not fire again
    expect(hideEvents).toBe(1);
  });
});
