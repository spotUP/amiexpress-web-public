/**
 * A Prompt asked to censor shows `*` for every typed character, and still
 * hands the plain text to its caller. PromptOptions had no mask, so a door
 * asking for a password or a code in a Prompt echoed it in clear.
 */
import { Screen } from '../../engines/ui/blessed/core/screen';
import { Prompt } from '../../engines/ui/blessed/widgets/prompt';

function open(censor?: boolean): { screen: any; prompt: any } {
  const screen: any = new Screen({ title: 'prompt', width: 80, height: 24 } as any);
  const prompt: any = new Prompt({
    parent: screen,
    width: 44,
    border: { type: 'line' },
    text: 'Code:',
    tags: false,
    ...(censor === undefined ? {} : { censor }),
  } as any);
  prompt.showInput(undefined, undefined, () => undefined);
  return { screen, prompt };
}

const type = (screen: any, text: string): void => {
  for (const ch of text) screen.program.emit('keypress', ch, { name: ch, full: ch });
};

/** What the input field paints, row by row. */
function painted(screen: any, prompt: any): string {
  screen.render();
  const c = prompt.inputField._getCoords();
  const rows: string[] = [];
  for (let y = c.yi; y < c.yl; y++) {
    const row = screen.buffer[y];
    rows.push(row ? row.slice(c.xi, c.xl).map((cell: [number, string]) => cell[1]).join('') : '');
  }
  return rows.join('\n');
}

describe('Prompt censor', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('paints typed characters as * and returns the plain text', () => {
    let prompt: any;
    ({ screen, prompt } = open(true));
    type(screen, 'hunter2');
    const shown = painted(screen, prompt);
    expect(shown).toContain('******');
    expect(shown).not.toMatch(/hunter/);
    expect(prompt.getValue()).toBe('hunter2');
  });

  it('submits the plain text, not the mask', () => {
    let prompt: any;
    ({ screen, prompt } = open(true));
    const submitted: string[] = [];
    prompt.on('submit', (v: string) => submitted.push(v));
    type(screen, 'abc');
    screen.program.emit('keypress', '\r', { name: 'enter', full: 'enter' });
    expect(submitted).toEqual(['abc']);
  });

  it('without censor the text still shows in clear', () => {
    let prompt: any;
    ({ screen, prompt } = open());
    type(screen, 'hello');
    expect(painted(screen, prompt)).toContain('hello');
  });
});
