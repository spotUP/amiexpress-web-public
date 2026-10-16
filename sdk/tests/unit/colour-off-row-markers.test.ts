/**
 * With ANSI colour off the board strips every SGR, so state shown by colour
 * alone needs a character. One widget per `it`: the marker is there with
 * colour off and absent with colour on. (Plan: colour-aware SDK, P2.4.)
 */
import { Screen, ListTable, ProgressBar, ColorPicker, List } from '../../engines/ui/blessed';
import { DropdownMenu } from '../../engines/ui/blessed/widgets/dropdown-menu';
import { ContextMenu } from '../../engines/ui/blessed/widgets/contextmenu';

function makeScreen(colour: boolean, chunks: string[] = []): any {
  return new Screen({
    colour,
    output: (s: string) => { chunks.push(s); },
    input: {
      on: () => {}, once: () => {}, removeListener: () => {},
      setRawMode: () => {}, resume: () => {}, pause: () => {}, isTTY: true,
    },
    terminal: 'xterm-256color',
  } as any);
}

const plain = (s: string) => s.replace(/\{[^}]*\}/g, '');
const content = (w: any): string => plain(w.getContent ? w.getContent() : w.content);

describe('colour-off character markers', () => {
  it('listtable: selected row carries a caret', () => {
    for (const colour of [false, true]) {
      const t: any = new ListTable({
        parent: makeScreen(colour), top: 0, left: 0, width: 30, height: 6,
        headers: ['Name'], rows: [['alpha'], ['beta']], columnWidths: [10], interactive: true,
      } as any);
      const rows = content(t).split('\n');
      // The caret takes the cell's padding: the name stays whole.
      expect(rows.some((r) => /^\|>[> ]alpha /.test(r))).toBe(!colour);
      expect(rows.some((r) => r.includes('alpha'))).toBe(true);
    }
  });

  it('dropdown-menu: disabled entry gets a dash in the caret column', () => {
    for (const colour of [false, true]) {
      const m: any = new DropdownMenu({
        parent: makeScreen(colour),
        items: [{ label: 'Open' }, { label: 'Save', disabled: true }],
      } as any);
      expect(content(m).includes(' -Save')).toBe(!colour);
    }
  });

  it('contextmenu: disabled entry gets a dash in the caret column', () => {
    for (const colour of [false, true]) {
      const m: any = new ContextMenu({
        parent: makeScreen(colour),
        items: [{ label: 'Open' }, { label: 'Save', disabled: true }],
      } as any);
      expect(content(m).includes(' -Save')).toBe(!colour);
    }
  });

  it('progressbar: the fill is drawn with #', () => {
    for (const colour of [false, true]) {
      const p: any = new ProgressBar({
        parent: makeScreen(colour), top: 0, left: 0, width: 22, height: 3, filled: 50,
      } as any);
      p.setProgress(50);
      expect(content(p).includes('#')).toBe(!colour);
    }
  });

  it('colorpicker: swatches hold their index and the label names the pen', () => {
    for (const colour of [false, true]) {
      const c: any = new ColorPicker({ parent: makeScreen(colour), color: 'green' } as any);
      expect(c.colorButtons[2].getContent().trim()).toBe(colour ? '' : '2');
    }
  });

  it('list: the scroll thumb is # on a | track', () => {
    for (const colour of [false, true]) {
      const chunks: string[] = [];
      const screen = makeScreen(colour, chunks);
      new List({
        parent: screen, top: 0, left: 0, width: 20, height: 5,
        items: Array.from({ length: 30 }, (_, i) => `row ${i}`),
      } as any);
      screen.render();
      const out = chunks.join('');
      expect(out.includes('#')).toBe(!colour);
      expect(out.includes('|')).toBe(!colour);
    }
  });
});
