/**
 * A confirmation dialog holds the keyboard until it is answered.
 *
 * Reported live 2026-08-26: "I can still navigate to the menu with arrow
 * keys when the LiveChat quit dialog is showing."
 *
 * The dialog pushed focus and filtered some keys, but never set
 * screen.focusTrap - which is the thing Screen consults when deciding where
 * an arrow key may move focus. So the arrows walked out of the dialog and
 * into the menu bar behind it while the question was still waiting.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { Question } from '../../engines/ui/blessed/widgets/question';
import { Box } from '../../engines/ui/blessed/widgets/box';

function makeScreen(): any {
  return new Screen({ title: 'question', width: 80, height: 24 } as any);
}

describe('a question that is waiting for an answer', () => {
  let screen: any;

  afterEach(() => screen?.destroy());

  it('traps focus while it is up', () => {
    screen = makeScreen();
    const behind = new Box({ parent: screen, width: 10, height: 3, focusable: true } as any);
    behind.focus();

    const question: any = new Question({ parent: screen, width: 40 } as any);
    question.ask('Quit?');

    expect((screen as any).focusTrap).toBe(question);
  });

  it('does not let an arrow key move focus to what is behind it', () => {
    screen = makeScreen();
    const behind = new Box({ parent: screen, width: 10, height: 3, focusable: true } as any);
    behind.focus();

    const question: any = new Question({ parent: screen, width: 40 } as any);
    question.ask('Quit?');

    (screen as any)._handleKey('', { name: 'down', full: 'down' });
    (screen as any)._handleKey('', { name: 'right', full: 'right' });

    const focused = (screen as any)._focused;
    expect(focused === question || focused?.hasAncestor?.(question)).toBe(true);
  });

  it('gives the trap back once answered', () => {
    // A dialog that never releases would jail the door for good.
    screen = makeScreen();
    const question: any = new Question({ parent: screen, width: 40 } as any);
    question.ask('Quit?');

    question.yesButton.emit('press');

    expect((screen as any).focusTrap).toBeNull();
  });

  it('releases on the negative answer too', () => {
    screen = makeScreen();
    const question: any = new Question({ parent: screen, width: 40 } as any);
    question.ask('Quit?');

    question.noButton.emit('press');

    expect((screen as any).focusTrap).toBeNull();
  });
});
