/**
 * A dismissed dialog gives focus back to what held it.
 *
 * Message, Question and Prompt focusPush themselves and then trap focus. The
 * trap saved whatever was focused at that moment - the dialog itself - and
 * restored it on release, so after WHIP's "title cannot be empty" message was
 * dismissed the caller's next key went to a hidden message instead of the
 * title field (2026-09-28). Screen.trapFocus now never saves focus that lies
 * inside the trap.
 */
import { Screen, Box } from '../../engines/ui/blessed';
import { Message } from '../../engines/ui/blessed/widgets/message';
import { Question } from '../../engines/ui/blessed/widgets/question';

function aScreenWithAField(): { screen: any; field: any } {
  const screen: any = new Screen({ width: 80, height: 24 } as any);
  const field: any = new Box({ parent: screen, top: 1, left: 1, width: 20, height: 1, keyable: true } as any);
  field.focus();
  return { screen, field };
}

describe('a dismissed dialog', () => {
  it('a message hands focus back to the field it interrupted', () => {
    const { screen, field } = aScreenWithAField();
    const message = new Message({ parent: screen } as any);

    message.display('Title cannot be empty');
    expect(screen.getFocused()).not.toBe(field);
    message.hide();

    expect(screen.getFocused()).toBe(field);
    screen.destroy();
  });

  it('a question does too', () => {
    const { screen, field } = aScreenWithAField();
    const question: any = new Question({ parent: screen } as any);

    question.ask?.('Delete it?', () => {});
    question.hide();
    question.releaseTrap?.();

    expect(screen.getFocused()).toBe(field);
    screen.destroy();
  });
});
