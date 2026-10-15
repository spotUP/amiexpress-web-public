/**
 * Regression: List.setItems() must invalidate the cached _lines so that a
 * subsequent _updateContent() does a full rebuild — not a fast-path
 * selection-marker swap that leaves the OLD items rendered.
 *
 * Bug surfaced in livechat's FormatPicker (and EmojiPicker, both built on
 * CategoryPicker which calls List.setItems on tab switch). User clicks
 * "Effects", _loadCategory("Effects") runs, setItems fires with new
 * items, but selected stays at 0 and previousSelected was also 0, so
 * _updateContent's fast path returns "no update needed" without
 * regenerating _lines. User keeps seeing Colors content until a
 * mouse-wheel scroll forces a real selection change and full rebuild.
 *
 * Fix: setItems clears (this as any)._lines = undefined before
 * _updateContent so the fast path's `if (lines && ...)` check fails
 * and a full rebuild always runs after an items swap.
 */
import { List, Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

describe('List.setItems re-render', () => {
  it('regenerates rendered lines when items array is replaced (FormatPicker tab switch repro)', () => {
    const screen = new Screen({ title: 'List setItems test', width: 80, height: 24 });
    const list = new List({
      parent: screen,
      top: 0,
      left: 0,
      width: 30,
      height: 10,
      items: ['Red', 'Green', 'Blue', 'Yellow'],
      tags: false,
    });

    (list as any)._updateContent();
    list.select(0);

    const initialLines = (list as any)._lines as string[] | undefined;
    expect(initialLines).toBeDefined();
    expect(initialLines!.length).toBeGreaterThan(0);
    expect(initialLines!.join('\n')).toMatch(/Red/);

    list.setItems(['Bold', 'Italic', 'Underline']);

    const after = (list as any)._lines as string[] | undefined;
    expect(after).toBeDefined();
    expect(after!.join('\n')).toMatch(/Bold/);
    expect(after!.join('\n')).not.toMatch(/Red/);

    screen.destroy();
  });

  it('rebuilds even when previousSelected and selected are both 0 (fast-path early-return trap)', () => {
    const screen = new Screen({ title: 'Same-index test', width: 80, height: 24 });
    const list = new List({
      parent: screen,
      width: 30,
      height: 10,
      items: ['One', 'Two', 'Three'],
      tags: false,
    });
    (list as any)._updateContent();
    // After construction selected=0, previousSelected=0 by default — exactly
    // the configuration that triggers the fast path's "selection didn't
    // change" early return at list.ts:196-199.

    list.setItems(['Alpha', 'Beta', 'Gamma']);

    const lines = (list as any)._lines as string[] | undefined;
    const joined = (lines || []).join('\n');
    expect(joined).toMatch(/Alpha/);
    expect(joined).toMatch(/Beta/);
    expect(joined).toMatch(/Gamma/);
    expect(joined).not.toMatch(/One/);
    expect(joined).not.toMatch(/Two/);
    expect(joined).not.toMatch(/Three/);

    screen.destroy();
  });

  it('shrinking the items array still produces correct lines (no leftover entries)', () => {
    const screen = new Screen({ title: 'Shrink test', width: 80, height: 24 });
    const list = new List({
      parent: screen,
      width: 30,
      height: 10,
      items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      tags: false,
    });
    (list as any)._updateContent();

    list.setItems(['X', 'Y']);

    const lines = (list as any)._lines as string[] | undefined;
    expect(lines).toBeDefined();
    expect(lines!.length).toBe(2);
    expect(lines![0]).toMatch(/X/);
    expect(lines![1]).toMatch(/Y/);

    screen.destroy();
  });
});
