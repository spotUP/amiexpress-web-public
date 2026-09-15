/**
 * Two things the sysop hit the moment he used the ANSI editor for real
 * (2026-09-15): "the select marker is not removed when i am not in select
 * mode" and "the default mode should be type not draw".
 *
 * They are the same kind of fault - a mode whose state outlives the mode - and
 * both are about what the editor is FOR. These screens are mostly text with
 * art around it, so typing is what it is opened to do; and the marquee is the
 * select tool's cursor, not a permanent mark on the canvas.
 */
import { describe, expect, it } from 'vitest';
import { createSurface, withTool } from '../pages/screen-editor-state';
import { getSelection } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/tools/drawing-tools';

const blank = () =>
  Array.from({ length: 5 }, () =>
    Array.from({ length: 10 }, () => ({ char: ' ', fg: 7, bg: 0 } as never)));

describe('a freshly opened screen', () => {
  it('opens in Type, not Draw', () => {
    // Opening in a painting tool means the first thing an artist types lands
    // as brush strokes.
    expect(createSurface(blank()).tool).toBe('text');
  });
});

describe('leaving select mode', () => {
  /*
   * `getSelection` hands back the SDK's own live SelectionData for this
   * state - the very object `clearSelection` nulls out - so writing a
   * committed rect into it is exactly the state the select tool leaves
   * behind, without driving pointer events through the canvas.
   */
  const withMarquee = () => {
    const s = createSurface(blank());
    const data = getSelection(s.state) as unknown as Record<string, unknown>;
    data.startPoint = { x: 1, y: 1 };
    data.endPoint = { x: 4, y: 3 };
    data.bounds = { x1: 1, y1: 1, x2: 4, y2: 3 };
    return s;
  };
  const marqueeOf = (s: ReturnType<typeof createSurface>) =>
    (getSelection(s.state) as unknown as { bounds: unknown }).bounds;

  it('has a selection while select is the tool', () => {
    // The guard for the test below: if this stopped selecting, the next
    // assertion would pass for the wrong reason.
    const s = withTool(withMarquee(), 'select');
    expect(marqueeOf(s)).toBeTruthy();
  });

  it('drops the marquee when another tool is chosen', () => {
    const s = withTool({ ...withMarquee(), tool: 'select' }, 'draw');
    expect(marqueeOf(s)).toBeFalsy();
  });

  it('drops it for typing too, which is where the sysop saw it', () => {
    const s = withTool({ ...withMarquee(), tool: 'select' }, 'text');
    expect(marqueeOf(s)).toBeFalsy();
  });

  it('keeps it while staying inside select', () => {
    // Re-clicking Select must not wipe the artist's own rectangle.
    const s = withTool({ ...withMarquee(), tool: 'select' }, 'select');
    expect(marqueeOf(s)).toBeTruthy();
  });

  it('changes the tool it was asked for', () => {
    expect(withTool(createSurface(blank()), 'box').tool).toBe('box');
  });
});
