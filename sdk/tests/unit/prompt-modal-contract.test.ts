/**
 * The Prompt dialog's two contracts, both reported from the live board on
 * 2026-09-07 against the ACHIEVE door's "Your email" prompt:
 *
 *  1. "then i type @ in the achievement door to register my mail it exits" -
 *     the dialog never trapped focus, so the door's own
 *     `screen.key(['q','Q','escape'])` quit binding saw every keystroke the
 *     caller typed into the field. Escape (meaning "close this dialog") and
 *     any `q` in an address quit the door instead.
 *  2. "the buttons are overlapping the text ... only the active button should
 *     have the .---------. frame" - the door asked for a 10-row dialog, the
 *     children need 12, and the button box was drawn on top of the input
 *     field from its 7th column on. Both buttons were also framed and filled
 *     at once, so neither looked like the one Enter would press.
 */
import { Screen } from '../../engines/ui/blessed/core/screen';
import { Prompt, PROMPT_MIN_HEIGHT } from '../../engines/ui/blessed/widgets/prompt';

function makeScreen(): any {
  return new Screen({ title: 'prompt', width: 80, height: 24 } as any);
}

/** The dialog the ACHIEVE door opens, at the size it asks for. */
function emailPrompt(screen: any, height?: number): any {
  return new Prompt({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 44,
    ...(height === undefined ? {} : { height }),
    border: { type: 'line' },
    label: ' Your email ',
    text: 'A code will be mailed there.\nAddress:',
    tags: false,
  } as any);
}

const coordsOf = (el: any) => el._getCoords();

/**
 * One keystroke, entering the way a real one does: the Program emits it and
 * Screen._handleKey routes it. Emitting on the screen itself would bypass the
 * very dispatch under test and pass on broken code.
 */
const press = (screen: any, name: string): void => {
  screen.program.emit('keypress', name, { name, full: name });
};

describe('the dialog holds the screen while it is up', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it("a door's own quit key does not fire while the caller types", () => {
    screen = makeScreen();
    let quits = 0;
    screen.key(['q', 'Q', 'escape'], () => { quits += 1; });

    const prompt = emailPrompt(screen);
    prompt.showInput(undefined, undefined, () => undefined);

    // The screen consults its focus trap before its own key handlers.
    expect(screen.getFocusTrap()).toBe(prompt);

    press(screen, 'q');
    press(screen, 'escape');
    expect(quits).toBe(0);
  });

  it('hands the keys back when the dialog closes', () => {
    screen = makeScreen();
    let quits = 0;
    screen.key(['q'], () => { quits += 1; });

    const prompt = emailPrompt(screen);
    prompt.showInput(undefined, undefined, () => undefined);
    prompt.hide();

    expect(screen.isFocusTrapped()).toBe(false);
    press(screen, 'q');
    expect(quits).toBe(1);
  });
});

describe('the dialog is tall enough for what is inside it', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('refuses a height its own children cannot fit into', () => {
    screen = makeScreen();
    const prompt = emailPrompt(screen, 10); // what the ACHIEVE door asked for
    expect(prompt.height).toBe(PROMPT_MIN_HEIGHT);
  });

  it('keeps a height that is big enough', () => {
    screen = makeScreen();
    expect(emailPrompt(screen, 16).height).toBe(16);
  });

  it('never draws the buttons over the input field, at either height', () => {
    for (const asked of [undefined, 10, 12, 16]) {
      screen = makeScreen();
      const prompt = emailPrompt(screen, asked);
      prompt.showInput(undefined, undefined, () => undefined);
      screen.render();

      const input = coordsOf((prompt as any).inputField);
      const buttons = coordsOf((prompt as any).buttonBox);
      // yl is exclusive: the input's last row must be above the buttons' first.
      expect({ asked, overlaps: input.yl > buttons.yi }).toEqual({ asked, overlaps: false });

      screen.destroy();
      screen = null;
    }
  });

  it('shows every character of an email address, the @ included', () => {
    screen = makeScreen();
    const prompt = emailPrompt(screen, 10);
    prompt.showInput(undefined, undefined, () => undefined);
    (prompt as any).inputField.setValue('caller@example.com');
    screen.render();

    const input = coordsOf((prompt as any).inputField);
    const painted: string[] = [];
    for (let y = input.yi; y < input.yl; y++) {
      const row = screen.buffer[y];
      painted.push(row ? row.slice(input.xi, input.xl).map((c: [number, string]) => c[1]).join('') : '');
    }
    expect(painted.join('\n')).toContain('caller@example.com');
  });
});

describe('only the active button is framed', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('idle buttons are the role colour on black, with the frame in the background', () => {
    screen = makeScreen();
    const prompt = emailPrompt(screen);
    for (const [button, colour] of [
      [(prompt as any).okButton, 'green'],
      [(prompt as any).cancelButton, 'red'],
    ] as const) {
      expect(button.style.bg).toBe('black');
      expect(button.style.fg).toBe(colour);
      expect(button.style.border?.fg).toBe('black');
      expect(button.style.focus?.bg).toBe(colour);
      expect(button.style.focus?.border?.fg).toBe(colour);
    }
  });

  it('gives Cancel room for its own label', () => {
    screen = makeScreen();
    const prompt = emailPrompt(screen);
    const cancel = (prompt as any).cancelButton;
    // width - 2 border - 2 padding must hold '[ Cancel ]'.
    expect(cancel.width - 4).toBeGreaterThanOrEqual('[ Cancel ]'.length);
  });
});
