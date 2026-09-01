/**
 * A host can add its own menus to the editor's menu bar.
 *
 * The sprite studio's whole problem was that it could not: the widget's menu
 * bar was a fixed list at hardcoded column offsets, so a door wanting Frame
 * and Animation menus had to draw a SECOND menu bar above the editor's own
 * and switch the editor's off. That is what made SPRITED read as two
 * applications bolted together - reported by the sysop looking at it.
 *
 * The offsets are now derived from the labels instead of written down, which
 * is also a latent bug fixed: the literals only happened to match the labels'
 * lengths, so renaming ' Select ' to ' Sel ' would have overlapped the next
 * button.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';

function makeScreen(): any {
  return new Screen({ title: 'host-menus', responsive: true, width: 100, height: 40 } as any);
}

/** The menu bar's buttons, in bar order, as { label, left }. */
function menuButtons(editor: any): Array<{ label: string; left: number }> {
  return (editor.menuBar.children as any[])
    .filter(c => typeof c.content === 'string' && c.content.trim().length > 0)
    .map(c => ({ label: c.content as string, left: c.position.left as number }))
    .sort((a, b) => a.left - b.left);
}

describe('ANSIEditor host-supplied menus', () => {
  let screen: any;
  beforeEach(() => { screen = makeScreen(); });
  afterEach(() => screen?.destroy());

  it('shows only its own menus when the host adds none', () => {
    const editor: any = new ANSIEditor({ parent: screen, showMenuBar: true } as any);
    const labels = menuButtons(editor).map(b => b.label.trim());
    expect(labels).toEqual(['File', 'Edit', 'Layer', 'Select', 'Colors', 'View', 'Help']);
  });

  it('lays its own menus out from the labels, not from hardcoded offsets', () => {
    const editor: any = new ANSIEditor({ parent: screen, showMenuBar: true } as any);
    const buttons = menuButtons(editor);
    let expected = 0;
    for (const b of buttons) {
      expect(b.left).toBe(expected);
      expected += b.label.length;
    }
  });

  it('appends host menus to the bar', () => {
    const editor: any = new ANSIEditor({
      parent: screen,
      showMenuBar: true,
      extraMenus: [
        { label: 'Frame', items: [{ label: 'Next Frame', action: () => {} }] },
        { label: 'Animation', items: [{ label: 'Next Animation', action: () => {} }] },
      ],
    } as any);
    const labels = menuButtons(editor).map(b => b.label.trim());
    expect(labels).toEqual([
      'File', 'Edit', 'Layer', 'Select', 'Colors', 'View', 'Help', 'Frame', 'Animation',
    ]);
  });

  it('keeps host menus from overlapping its own', () => {
    const editor: any = new ANSIEditor({
      parent: screen,
      showMenuBar: true,
      extraMenus: [{ label: 'Frame', items: [{ label: 'x', action: () => {} }] }],
    } as any);
    const buttons = menuButtons(editor);
    for (let i = 1; i < buttons.length; i++) {
      expect(buttons[i].left).toBeGreaterThanOrEqual(buttons[i - 1].left + buttons[i - 1].label.length);
    }
  });

  it('runs a host menu item’s action when it is selected', () => {
    let ran = 0;
    const editor: any = new ANSIEditor({
      parent: screen,
      showMenuBar: true,
      extraMenus: [{ label: 'Frame', items: [{ label: 'Next Frame', action: () => { ran++; } }] }],
    } as any);
    // Through the dropdown the widget built, not through the array we passed -
    // proving the action survived being turned into a menu.
    const dropdown = editor.extraMenuDropdowns[0];
    expect(dropdown).toBeDefined();
    dropdown.selectItem(0);
    expect(ran).toBe(1);
  });
});
