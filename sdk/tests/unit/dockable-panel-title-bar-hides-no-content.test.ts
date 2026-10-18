/**
 * "the first line of the chat log is hidden under the Chat heading" (the
 * sysop, 2026-10-18).
 *
 * A DockablePanel that can move draws a one-row title bar (its drag handle)
 * as the first row inside its border. Every caller placed its content at
 * top 0 of the panel, which is that same row, so the bar was drawn over the
 * content's first line. LIVECHAT worked around it by offsetting its log by
 * hand; the panel now reserves the row itself, so content at top 0 starts
 * below the bar and '100%' fills only what is left. A static panel has no
 * bar and must not move its content.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { Box } from '../../engines/ui/blessed/widgets/box';
import { DockablePanel } from '../../engines/ui/blessed/widgets/dockable-panel';

function rows(screen: any): string[] {
  return screen.buffer.map((row: Array<[number, string]>) => row.map(cell => cell[1]).join(''));
}

function openPanel(movable: boolean): { screen: any; panel: any; content: any } {
  const screen: any = new Screen({ title: 'title-bar', width: 40, height: 12 } as any);
  const panel: any = new DockablePanel({
    parent: screen,
    title: ' Chat ',
    top: 0,
    left: 0,
    width: 30,
    height: 10,
    border: { type: 'line' },
    draggable: movable,
    resizable: movable,
  } as any);
  const content: any = new Box({
    parent: panel,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    content: 'FIRST LINE\nsecond\nthird\nfourth\nfifth\nsixth\nseventh\nLAST LINE',
  } as any);
  screen.render();
  return { screen, panel, content };
}

describe('a movable panel title bar', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('hides no content placed at top 0', () => {
    const opened = openPanel(true);
    screen = opened.screen;
    const lines = rows(screen);
    const heading = lines.findIndex(r => r.includes(' Chat '));
    const first = lines.findIndex(r => r.includes('FIRST LINE'));
    expect(heading).toBe(1);
    expect(first).toBe(heading + 1);
  });

  it("and '100%' fills only the rows below the bar, so the last line still shows", () => {
    const opened = openPanel(true);
    screen = opened.screen;
    // 10 rows - 2 border rows - 1 title row
    expect(opened.content.height).toBe(7);
    expect(opened.content.atop).toBe(2);
  });

  it('leaves the content of a static panel (no title bar) at its first row', () => {
    const opened = openPanel(false);
    screen = opened.screen;
    expect(opened.content.atop).toBe(1);
    expect(opened.content.height).toBe(8);
    expect(rows(screen)[1]).toContain('FIRST LINE');
  });
});
