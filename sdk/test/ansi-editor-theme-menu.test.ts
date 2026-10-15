/**
 * The editor's View > Theme item.
 *
 * "all typescript doors with menus could have a theme menu that let's the
 * user change blessed theme inside the doors on the fly" (sysop,
 * 2026-09-02). ANSI EDITOR, MAIL COMPOSER and the SPRITE STUDIO all draw the
 * same ANSIEditor widget, so the item lives in the widget rather than three
 * times over in the doors.
 *
 * The item appears only for a host that passed a `themeHost`: an item that
 * cannot work is worse than no item.
 */

import { describe, it, expect } from '@jest/globals';
import { Screen, ANSIEditor } from '../engines/ui/blessed';
import { themeById } from '../engines/ui/theme';

/** The labels in the widget's View dropdown. */
function viewItems(editor: any): string[] {
  return (editor.viewMenu?.items ?? []).map((item: any) => item.label);
}

describe('ANSIEditor View menu', () => {
  it('offers Theme when the host passed a bbs', () => {
    const screen = new Screen({ smartCSR: true } as any);
    const editor: any = new ANSIEditor({
      parent: screen, width: 40, height: 20, showMenuBar: true,
      themeHost: { getTheme: () => themeById('classic') },
    } as any);

    expect(viewItems(editor)).toContain('Theme...');
    screen.destroy();
  });

  it('leaves it out when there is no host to ask', () => {
    const screen = new Screen({ smartCSR: true } as any);
    const editor: any = new ANSIEditor({
      parent: screen, width: 40, height: 20, showMenuBar: true,
    } as any);

    expect(viewItems(editor)).not.toContain('Theme...');
    screen.destroy();
  });

  it('re-tints the editor and tells the host, when the item is chosen', async () => {
    const screen = new Screen({ smartCSR: true } as any);
    const classic = themeById('classic');
    const applied: string[] = [];
    const editor: any = new ANSIEditor({
      parent: screen, width: 40, height: 20, showMenuBar: true,
      themeHost: { getTheme: () => classic },
      onThemeChange: (theme: any) => applied.push(theme.id),
    } as any);

    const frame: any = editor.children?.[0];
    if (frame?.style) frame.style.fg = classic.tokens.ink;

    const item = editor.viewMenu.items.find((i: any) => i.label === 'Theme...');
    item.action();
    await new Promise((resolve) => setTimeout(resolve, 60));

    screen.program.emit('keypress', null, { name: 'down', full: 'down' });
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(applied.length).toBe(1);
    if (frame?.style) {
      expect(frame.style.fg).toBe(themeById(applied[0]).tokens.ink);
    }

    screen.program.emit('keypress', null, { name: 'escape', full: 'escape' });
    await new Promise((resolve) => setTimeout(resolve, 60));
    screen.destroy();
  });
});
