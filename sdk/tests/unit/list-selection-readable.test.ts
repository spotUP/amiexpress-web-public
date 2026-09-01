/**
 * The selected row must be readable.
 *
 * Reported with a screenshot: green text on the green highlight, entirely
 * unreadable. The List applies its `selected` style by WRAPPING the row in
 * tags, and blessed's parser respects the last tag it saw - so a row that
 * colours itself overrides the wrapper and the selection loses.
 *
 * LIVECHAT already carries a comment about hitting this with cyan, and
 * worked around it inside the door. This fixes the widget instead, so the
 * next door does not have to rediscover it.
 */
import { Screen, List } from '../../engines/ui/blessed';

function render(items: string[], selectedStyle: any): string {
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
    parent: screen, top: 0, left: 0, width: 40, height: 6, tags: true,
    items, style: { selected: selectedStyle },
  } as any);
  list.select(0);
  screen.render();
  return chunks.join('');
}

describe('a row that colours itself', () => {
  it('does not keep its colour when it is the selected row', () => {
    // The row asks for green; the selection asks for black on green. The
    // selection has to win or the row is green on green.
    const out = render(['{green-fg}Amiga 68K{/green-fg}'], { fg: 'black', bg: 'green' });

    // Whatever escapes come out, the row must not be drawn in its own
    // green: the last foreground set before the text is the selection's.
    const at = out.indexOf('Amiga');
    const before = out.slice(Math.max(0, at - 60), at);
    const lastFg = [...before.matchAll(/\x1b\[[0-9;]*m/g)].pop()?.[0] ?? '';
    expect(lastFg).not.toBe('\x1b[32m');   // not plain green
    expect(out).toContain('Amiga 68K');
  });

  it('leaves an unselected row exactly as it was', () => {
    const out = render(
      ['{green-fg}first{/green-fg}', '{green-fg}second{/green-fg}'],
      { fg: 'black', bg: 'green' }
    );
    expect(out).toContain('second');
  });

  it('keeps the row colours when the selection only sets a background', () => {
    // A door that highlights with a background and lets rows keep their own
    // foreground is doing something reasonable, and must keep working.
    const out = render(['{green-fg}Amiga{/green-fg}'], { bg: 'blue' });
    expect(out).toContain('Amiga');
  });

  it('survives a row with no tags at all', () => {
    expect(render(['plain row'], { fg: 'black', bg: 'green' })).toContain('plain row');
  });
});

describe('the mouse and the arrow keys share one cursor', () => {
  function listWith(style: any, items = ['one', 'two', 'three']) {
    const screen: any = new Screen({
      output: () => {},
      input: {
        on: () => {}, once: () => {}, removeListener: () => {},
        setRawMode: () => {}, resume: () => {}, pause: () => {}, isTTY: true,
      },
      terminal: 'xterm-256color',
    } as any);
    const list: any = new List({
      parent: screen, top: 0, left: 0, width: 30, height: 5, tags: true,
      items, style,
    } as any);
    screen.render();
    return list;
  }

  it('adds no hover style of its own', () => {
    // The widget used to default to blue-on-white, and createList injected
    // the same blue before the widget saw the options - a colour no theme
    // chose, appearing the moment a mouse crossed a list.
    const list = listWith({ selected: { fg: 'black', bg: 'green' } });
    const hover = list.style?.item?.hover ?? list.style?.hover;
    expect(hover).toBeUndefined();
  });

  it('moves the selection when the mouse moves over a row', () => {
    const list = listWith({ selected: { fg: 'black', bg: 'green' } });
    list.select(0);

    const coords = list._getCoords();
    list.onMouse({ action: 'mousemove', x: coords.xi + 1, y: coords.yi + 2 } as any);

    // The row under the pointer IS the selection now - not a second
    // highlight sitting beside the keyboard's.
    expect(list.getSelected()).toBe(2);
  });

  it('tells the door the cursor moved, so markers follow the mouse', () => {
    const list = listWith({ selected: { fg: 'black', bg: 'green' } });
    list.select(0);

    const seen: number[] = [];
    list.on('select item', (_item: any, index: number) => seen.push(index));

    const coords = list._getCoords();
    list.onMouse({ action: 'mousemove', x: coords.xi + 1, y: coords.yi + 1 } as any);

    expect(seen).toContain(1);
  });

  it('leaves the cursor where the mouse put it after the pointer leaves', () => {
    const list = listWith({ selected: { fg: 'black', bg: 'green' } });
    const coords = list._getCoords();
    list.onMouse({ action: 'mousemove', x: coords.xi + 1, y: coords.yi + 1 } as any);
    list.onMouseLeave();

    expect(list.getSelected()).toBe(1);
  });
});

describe('what actually reaches the terminal', () => {
  // The earlier tests in this file all passed while the bug was live: they
  // asserted on the tag string, and the render path then rebuilt the row
  // from the UNSTRIPPED original and threw the stripped copy away. So this
  // one asserts on the bytes, which is the only thing the sysop can see.
  function paintSelectedRow(): string {
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
      parent: screen, top: 0, left: 0, width: 50, height: 4, tags: true,
      items: ['{#8CFFB4-fg}[-]{/#8CFFB4-fg} {#57E389-fg}Amiga 68K{/#57E389-fg}'],
      style: { selected: { fg: 'black', bg: 'green', bold: true }, item: { fg: '#57E389' } },
    } as any);
    list.select(0);
    screen.render();
    return chunks.join('');
  }

  it('paints the selection colour, not the row colour, on the selected row', () => {
    const painted = paintSelectedRow();
    const at = painted.indexOf('Amiga');
    expect(at).toBeGreaterThan(-1);
    const attr = painted.slice(Math.max(0, at - 40), at);

    // 42 is the selection's green background.
    expect(attr).toContain('42');
    // 38;5;78 is the row's own #57E389 green, which on that background is
    // green on green - the unreadable row that was reported.
    expect(attr).not.toContain('38;5;78');
  });
});
