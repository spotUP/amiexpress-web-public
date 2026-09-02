/**
 * A question dialog's buttons are visible, not just clickable.
 *
 * Reported live 2026-09-02, from CARD LOBBY's "Private Table?" prompt: "it
 * doesn't look like a standard dialog and there are no buttons", then "I can
 * click the invisible buttons in that dialog".
 *
 * Both halves of that are one mismatch. Question lays its two buttons out in
 * a ONE-row container - deliberately, since the buttons stopped drawing
 * frames around themselves - but a `Button` is `touchFriendly` by default,
 * and that runs its height through `enforceMinTouchHeight`, which silently
 * promotes anything under three rows to three. Two three-row buttons inside
 * a one-row box are clipped to nothing, while their own coordinates still
 * hit-test: invisible, and clickable, exactly as reported.
 *
 * `inline: true` is the widget's own way of saying "compact, not a touch
 * target", and it turns the promotion off.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { Question } from '../../engines/ui/blessed/widgets/question';

function paintedText(writes: string[]): string {
  return writes.join('')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
}

describe("a question dialog's buttons", () => {
  let screen: any;
  let writes: string[];

  beforeEach(() => {
    writes = [];
    screen = new Screen({
      title: 'question', width: 80, height: 24,
      output: (d: string) => writes.push(d),
    } as any);
  });

  afterEach(() => screen?.destroy());

  it('are no taller than the row that holds them', () => {
    const q: any = new Question({ parent: screen, title: ' Private Table? ' } as any);
    q.ask('Create a private table?');

    const container = q.children.find((c: any) => c.children?.length === 2);
    expect(container).toBeDefined();

    const containerHeight = container.position.height;
    for (const button of container.children) {
      expect(button.position.height).toBeLessThanOrEqual(containerHeight);
    }
  });

  it('paint their labels', () => {
    const q: any = new Question({ parent: screen, title: ' Private Table? ' } as any);
    q.ask('Create a private table?');

    const painted = paintedText(writes);
    expect(painted).toContain('Yes');
    expect(painted).toContain('No');
  });

  it('still answer when pressed', () => {
    const q: any = new Question({ parent: screen, title: ' Private Table? ' } as any);
    let answer: boolean | undefined;
    q.ask('Create a private table?', (a: boolean) => { answer = a; });

    const container = q.children.find((c: any) => c.children?.length === 2);
    container.children[0].emit('press');

    expect(answer).toBe(true);
  });
});
