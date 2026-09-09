/**
 * A preselected row is visible on the first paint.
 *
 * select() scrolled to keep the row visible, but the constructor only
 * tracked the index: a short list (WHIP's 3-row assignee picker) painted
 * row zero while selected pointed at row two, so a new task opened with
 * "(Unassigned)" showing for a creator who was really selected (2026-09-09).
 *
 * Driven: a real List on a fake-output Screen, reading the paint back.
 */
import { Screen, List } from '../../engines/ui/blessed';

function renderList(items: string[], selected: number): string {
  const chunks: string[] = [];
  const screen: any = new Screen({
    output: (s: string) => { chunks.push(s); },
    input: {
      on: () => {}, once: () => {}, removeListener: () => {},
      setRawMode: () => {}, resume: () => {}, pause: () => {}, isTTY: true,
    },
    terminal: 'xterm-256color',
  } as any);
  const list: any = new List({
    parent: screen, top: 0, left: 0, width: 30, height: 3,
    border: { type: 'line' },
    items, selected,
    keys: false, mouse: false,
  } as any);
  screen.render();
  list.destroy();
  screen.destroy();
  return chunks.join('');
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

describe('a list built with a selected index', () => {
  it('paints the selected row, not row zero', () => {
    const out = stripAnsi(renderList(['(Unassigned)', 'ace', 'spot'], 2));
    expect(out).toContain('spot');
  });

  it('still paints row zero when selected there', () => {
    const out = stripAnsi(renderList(['(Unassigned)', 'ace', 'spot'], 0));
    expect(out).toContain('(Unassigned)');
  });
});
