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
 *
 * IT CAME BACK AT FORTY COLUMNS (the sysop, 2026-09-23, on LIVE CHAT's quit
 * dialog: "no buttons here in petscii mode"). The constructor was not the only
 * thing that sets a button's height: `_setMobileLayout` and
 * `_setDesktopLayout` both re-assign one when the breakpoint changes, and both
 * asked for three rows in the same one-row container. A C64 screen is 40
 * columns, which is the xxs breakpoint, so every PETSCII caller got the
 * mobile branch and the invisible buttons back. The row is ONE row at every
 * width - a terminal has no touch target - so neither branch sets a height
 * any more.
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

  it('are still there after the screen narrows to a C64', () => {
    // The dialog is built once when the door starts; the screen then becomes
    // 40 columns, which is the xxs breakpoint - "mobile" - and that is the
    // branch that used to put three-row buttons back in the one-row box.
    const wide: any = new Screen({
      title: 'question', width: 80, height: 25, responsive: true,
      output: (d: string) => writes.push(d),
    } as any);
    try {
      const q: any = new Question({ parent: wide, width: 45, title: ' Confirm ' } as any);
      wide.resize(40, 25);
      writes.length = 0;
      q.ask('Are you sure you want to quit LiveChat?');

      const container = q.children.find((c: any) => c.children?.length === 2);
      for (const button of container.children) {
        expect(button.position.height).toBeLessThanOrEqual(container.position.height);
      }
      expect(paintedText(writes)).toContain('Yes');
      expect(paintedText(writes)).toContain('No');
    } finally {
      wide.destroy();
    }
  });

  it('do not touch each other on a C64', () => {
    // "i see them but they need a 1 char spacing between them" (the sysop,
    // 2026-09-23). The narrow layout widens both buttons and left the second
    // one's column where the narrower pair had put it, so `[ Yes ][ No ]` ran
    // together.
    const wide: any = new Screen({
      title: 'question', width: 80, height: 25, responsive: true,
      output: (d: string) => writes.push(d),
    } as any);
    try {
      const q: any = new Question({ parent: wide, width: 45, title: ' Confirm ' } as any);
      wide.resize(40, 25);
      q.ask('Are you sure you want to quit LiveChat?');

      const container = q.children.find((c: any) => c.children?.length === 2);
      const [yes, no] = container.children;
      expect(no.position.xi - yes.position.xl).toBe(1);
      expect(container.position.width).toBeGreaterThanOrEqual(
        yes.position.width + no.position.width + 1);
    } finally {
      wide.destroy();
    }
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
