/**
 * With colour off the board strips every SGR, so focus, active tab, caret,
 * selection and palette state that colour alone showed must draw a character.
 * One case per widget: marker present with `colour: false`, absent otherwise.
 */
import {
  Screen, Button, Checkbox, RadioButton, Textbox, AutocompleteTextbox, TabPanel, MenuBar, PetsciiEditor,
} from '../../engines/ui/blessed';
import { Listbar } from '../../engines/ui/blessed/widgets/listbar';
import { DockablePanel } from '../../engines/ui/blessed/widgets/dockable-panel';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';

function makeScreen(colour: boolean): any {
  const chunks: string[] = [];
  const screen: any = new Screen({
    output: (c: string) => { chunks.push(c); },
    input: {
      on: () => {}, once: () => {}, removeListener: () => {},
      setRawMode: () => {}, resume: () => {}, pause: () => {}, isTTY: true,
    },
    terminal: 'xterm-256color',
    colour,
  } as any);
  screen.drawn = () => chunks.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  return screen;
}

/** The element's laid-out text, tags and SGR stripped. */
function text(el: any): string {
  return String(el.getContent()).replace(/\{[^}]*\}/g, '');
}

/** The laid-out lines of each button, as the renderer reads them. */
function shown(buttons: any[]): string {
  return buttons.map((b) => b.getVisibleLines().join('')).join('|');
}

/** Run a case with colour off and on. */
function both(build: (screen: any) => () => string, off: RegExp): void {
  const offScreen = makeScreen(false);
  expect(build(offScreen)()).toMatch(off);
  const onScreen = makeScreen(true);
  expect(build(onScreen)()).not.toMatch(off);
}

describe('colour-off focus markers', () => {
  it('button: focused is [Label], unfocused is padded', () => {
    both((screen) => {
      const b: any = new Button({ parent: screen, top: 0, left: 0, width: 12, height: 3, content: 'OK', tags: true } as any);
      screen.render();
      b.focus();
      screen.render();
      return () => screen.drawn();
    }, /\[OK\]/);
    const screen = makeScreen(false);
    new Button({ parent: screen, top: 0, left: 0, width: 12, height: 3, content: 'OK', tags: true } as any);
    screen.render();
    expect(screen.drawn()).not.toMatch(/\[OK\]/);
  });

  it('tabpanel: the active tab is bracketed', () => {
    both((screen) => {
      const t: any = new TabPanel({
        parent: screen, top: 0, left: 0, width: 40, height: 10,
        tabs: [{ label: 'One', content: new Button({ content: 'x' } as any) }, { label: 'Two', content: new Button({ content: 'y' } as any) }],
      } as any);
      screen.render();
      return () => shown(t.tabButtons);
    }, /\[One\]/);
  });

  it('listbar: the selected item is bracketed', () => {
    both((screen) => {
      const l: any = new Listbar({ parent: screen, top: 0, left: 0, width: 40, height: 1, items: { a: { text: 'Alpha' }, b: { text: 'Beta' } } } as any);
      screen.render();
      return () => shown([...l.items.values()].map((x: any) => x.button));
    }, /\[Alpha\]/);
  });

  it('menu-bar: the focused menu is bracketed', () => {
    both((screen) => {
      const m: any = new MenuBar({ parent: screen, screen, items: [{ label: 'File', items: [] }, { label: 'Edit', items: [] }] } as any);
      screen.render();
      m.menuButtons[0].emit('focus');
      return () => m.menuButtons.map((x: any) => text(x)).join('|');
    }, /\[File\]/);
  });

  it('dockable-panel: the active tab is bracketed', () => {
    both((screen) => {
      const a: any = new DockablePanel({ parent: screen, top: 0, left: 0, width: 30, height: 8, label: 'Alpha' } as any);
      const b: any = new DockablePanel({ parent: screen, top: 0, left: 0, width: 30, height: 8, label: 'Beta' } as any);
      a.mergeWith(b);
      screen.render();
      return () => shown(a.tabButtons);
    }, /\[Tab 1\]/);
  });

  it('checkbox: focus swaps [ ] for < >', () => {
    both((screen) => {
      const c: any = new Checkbox({ parent: screen, top: 0, left: 0, width: 20, height: 1, text: 'Opt' } as any);
      screen.render();
      c.focus();
      return () => text(c);
    }, /</);
  });

  it('radiobutton: focus swaps ( ) for < >', () => {
    both((screen) => {
      const r: any = new RadioButton({ parent: screen, top: 0, left: 0, width: 20, height: 1, text: 'Opt' } as any);
      screen.render();
      r.focused = true;
      r.emit('focus');
      return () => text(r);
    }, /</);
  });

  it('textbox: selection adds [N selected]', () => {
    both((screen) => {
      const t: any = new Textbox({ parent: screen, top: 0, left: 0, width: 30, height: 1, label: 'Name', value: 'hello world' } as any);
      screen.render();
      t.focus();
      t.selectAll();
      return () => String(t.options.label ?? '');
    }, /\[11 selected\]/);
  });

  it('autocomplete-textbox: the real cursor is targeted', () => {
    const screen = makeScreen(false);
    const spy = jest.spyOn(screen, 'setCursorTarget');
    const t: any = new AutocompleteTextbox({ parent: screen, top: 0, left: 0, width: 30, height: 1, value: 'ab' } as any);
    screen.render();
    t.focus();
    t._updateContent();
    expect(spy).toHaveBeenCalled();
    const onScreen = makeScreen(true);
    const spyOn = jest.spyOn(onScreen, 'setCursorTarget');
    const u: any = new AutocompleteTextbox({ parent: onScreen, top: 0, left: 0, width: 30, height: 1, value: 'ab' } as any);
    onScreen.render();
    u.focus();
    u._updateContent();
    const fromHelper = spyOn.mock.calls.length;
    expect(fromHelper).toBeLessThanOrEqual(spy.mock.calls.length);
  });

  it('petscii-editor: swatches carry digits and the pen is named', () => {
    both((screen) => {
      const e: any = new PetsciiEditor({ parent: screen, top: 0, left: 0, width: 40, height: 25 } as any);
      return () => e.toolsText();
    }, /Pen: \w \w+/);
  });

  it('ansi-editor: swatches carry index digits and the selected tool is marked', () => {
    both((screen) => {
      const e: any = new ANSIEditor({ parent: screen, canvasWidth: 4, canvasHeight: 2 } as any);
      screen.render();
      e.updateSidebarToolSelection();
      return () => e.colorPalette.children.map((c: any) => text(c)).join('') + '|' + e.toolPanel.children.map((c: any) => text(c)).join('|');
    }, /f.*>/);
  });
});
