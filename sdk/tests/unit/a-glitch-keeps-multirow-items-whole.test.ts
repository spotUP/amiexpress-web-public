/**
 * A glitch keeps a multi-row list item whole.
 *
 * The glitch damages ROWS, so a list's items go out as rows and come back.
 * They came back as `setItems(text.split('\n'))` - every row its own item.
 * After the first glitch a WHIP kanban card was several items and the empty
 * spacer between cards another, so the cursor stopped on the spacer and a
 * wrapped title lit one row (the sysop, 2026-09-28).
 */
import { glitchTargetFor } from '../../engines/ui/theme/glitch-runner';

function aList(items: string[]) {
  const list: any = { items: [...items], setItems: jest.fn((next: string[]) => { list.items = next; }) };
  return list;
}

describe('a glitched list', () => {
  it('gets back the same items, each with its own rows', () => {
    const list = aList(['the topic\nhighlight in\nthe board', '', 'Paste support\nin Whip']);
    const target = glitchTargetFor(list);

    const rows = target.getContent().split('\n');
    expect(rows).toHaveLength(6);
    target.setContent(rows.map((row) => row.replace(/o/g, '#')).join('\n'));

    expect(list.items).toEqual(['the t#pic\nhighlight in\nthe b#ard', '', 'Paste supp#rt\nin Whip']);
  });

  it('never splits a list into rows when handed text that does not fit its items', () => {
    const list = aList(['a\nb', 'c']);
    const target = glitchTargetFor(list);
    target.getContent();
    target.setContent('x\ny');
    expect(list.items).toEqual(['a\nb', 'c']);
  });

  it('does not put stale cards back over a list the door redrew during the glitch', () => {
    const list = aList(['Card 0\n', 'Card 1']);
    const target = glitchTargetFor(list);
    const truth = target.getContent();
    target.setContent(truth.replace('Card 0', 'C#rd 0'));   // the damage
    list.items = ['Card 1\n', 'Card 0'];                     // the door redraws (a move)
    target.setContent(truth);                                 // the repair
    expect(list.items).toEqual(['Card 1\n', 'Card 0']);
  });

  it('repairs the damage when the door has not redrawn', () => {
    const list = aList(['Card 0\n', 'Card 1']);
    const target = glitchTargetFor(list);
    const truth = target.getContent();
    target.setContent(truth.replace('Card 0', 'C#rd 0'));
    target.setContent(truth);
    expect(list.items).toEqual(['Card 0\n', 'Card 1']);
  });
});
