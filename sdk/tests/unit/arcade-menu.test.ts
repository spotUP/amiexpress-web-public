/**
 * The arcade menu's colouring.
 *
 * Reported from a live Frogger board: "the dark blue selection bleeds to the
 * left". The selected row is drawn on a blue background, and the padding
 * that CENTRES the row was inside the colour span, so the background painted
 * from the left edge of the box up to the text.
 *
 * It bled leftwards only, which was the tell: `centre` pads on the left
 * alone, so a fault that painted the padding could only ever be asymmetric.
 *
 * A foreground-only row hides this - colouring spaces looks like colouring
 * nothing - so the row with a BACKGROUND is the one worth pinning, and the
 * rest are checked for the same shape so the next row to gain a background
 * does not reintroduce it.
 */

import {
  arcadeMenu,
  optionText,
  visibleLength,
  moveSelection,
  DEFAULT_HINT,
} from '../../engines/ui/arcade/menu';

/** Everything before the first blessed tag on a line. */
function beforeFirstTag(line: string): string {
  const at = line.indexOf('{');
  return at === -1 ? line : line.slice(0, at);
}

/** What the first tag on the line encloses, up to the closing tag. */
function insideTags(line: string): string {
  const open = line.indexOf('{');
  if (open === -1) return line;
  const body = line.slice(open);
  return body.replace(/\{[^}]*\}/g, '');
}

const OPTIONS = ['Start Game', 'High Scores', 'Help', 'Quit'];

describe('the selected row', () => {
  it('does not paint its own centring padding', () => {
    const lines = arcadeMenu({ title: [], options: OPTIONS, selection: 0, width: 64 });
    const selected = lines.find(l => l.includes('-bg}') && l.includes('Start Game'))!;

    expect(selected).toBeDefined();
    // The padding is outside the tag: plain spaces, then the colour.
    expect(beforeFirstTag(selected)).toMatch(/^ +$/);
    // And what the colour encloses is the option and nothing else.
    expect(insideTags(selected)).toBe('> Start Game <');
  });

  it('is still centred, padding and all', () => {
    const width = 64;
    const lines = arcadeMenu({ title: [], options: OPTIONS, selection: 0, width });
    const selected = lines.find(l => l.includes('-bg}') && l.includes('Start Game'))!;

    const text = optionText('Start Game', true);
    expect(visibleLength(selected)).toBe(
      Math.floor((width - text.length) / 2) + text.length
    );
  });

  it('moves its highlight with the selection', () => {
    const lines = arcadeMenu({ title: [], options: OPTIONS, selection: 2, width: 64 });
    const highlighted = lines.filter(l => l.includes('-bg}'));

    expect(highlighted.length).toBe(1);
    expect(insideTags(highlighted[0])).toBe('> Help <');
  });
});

describe('every other coloured row', () => {
  it('keeps its padding outside the colour too', () => {
    // Not cosmetic: a foreground-only row LOOKS fine either way, so a row
    // that gains a background later would bleed exactly as the selected one
    // did unless the shape is the same everywhere.
    const lines = arcadeMenu({
      title: ['FROGGER'],
      options: OPTIONS,
      selection: 0,
      width: 64,
      subtitle: 'Classic 1981 Konami Arcade Game',
    });

    for (const line of lines) {
      if (line === '' || !line.includes('{')) continue;
      expect(beforeFirstTag(line)).toMatch(/^ *$/);
    }
  });

  it('colours the title without painting the gap beside it', () => {
    const lines = arcadeMenu({ title: ['FROGGER'], options: OPTIONS, selection: 0, width: 64 });
    const title = lines[0];

    expect(beforeFirstTag(title)).toMatch(/^ +$/);
    expect(insideTags(title)).toBe('FROGGER');
  });
});

describe('the menu as a whole', () => {
  it('never returns a line wider than the width it was given', () => {
    // A line one column too long wraps, and a wrapped line in a fixed-height
    // box pushes every row below it down.
    const width = 40;
    const lines = arcadeMenu({
      title: ['A TITLE THAT IS FAR TOO LONG FOR FORTY COLUMNS OF TERMINAL'],
      options: [...OPTIONS, { label: 'Lives', value: '3' }],
      selection: 1,
      width,
      subtitle: 'and a subtitle that is also much too long to fit here',
    });

    for (const line of lines) {
      expect(visibleLength(line)).toBeLessThanOrEqual(width);
    }
  });

  it('draws exactly one hint, and the caller can replace it', () => {
    const standard = arcadeMenu({ title: [], options: OPTIONS, selection: 0, width: 64 });
    expect(standard.filter(l => l.includes(DEFAULT_HINT)).length).toBe(1);

    const custom = arcadeMenu({
      title: [], options: OPTIONS, selection: 0, width: 64, hint: 'PRESS FIRE',
    });
    expect(custom.filter(l => l.includes(DEFAULT_HINT)).length).toBe(0);
    expect(custom.filter(l => l.includes('PRESS FIRE')).length).toBe(1);
  });

  it('wraps the selection at both ends', () => {
    expect(moveSelection(0, 4, -1)).toBe(3);
    expect(moveSelection(3, 4, +1)).toBe(0);
  });
});
