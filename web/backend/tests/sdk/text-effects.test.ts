/**
 * LiveChat text effects (sdk/engines/ui/blessed/utils/animations).
 *
 * Asked for 2026-08-26: "audit all text effects in the LiveChat, some don't
 * apply correctly and some are buggy when they render."
 *
 * Four things the audit found, each asserted below:
 *
 *  - Sparkle REPLACED characters with punctuation, so 15% of every message
 *    turned to `*+.'^"` on every frame and the text could not be read while
 *    the effect ran.
 *  - Shake changed the string's LENGTH, adding a column on one side and not
 *    the other. In a fixed-width chat panel that re-wraps the line and
 *    shoves everything after it around - the message area twitched, not the
 *    shaken word.
 *  - Gradient was the two end colours with a hard split down the middle: two
 *    blocks of solid colour, not a fade. It also computed `frame % 0` on
 *    empty text.
 *  - The parser matched effect content with `.`, which does not cross a line
 *    break, so an effect spanning a wrapped line rendered as its literal
 *    tags.
 */

import {
  renderRainbow,
  renderPulse,
  renderSparkle,
  renderShake,
  renderWave,
  renderGradient,
} from '../../../../sdk/engines/ui/blessed/utils/animations/renderers';
import {
  parseAnimationTags,
  stripAnimationTags,
  hasAnimationTags,
} from '../../../../sdk/engines/ui/blessed/utils/animations/parser';

/** The visible characters, with blessed colour tags removed. */
function visible(rendered: string): string {
  return rendered.replace(/\{[^}]*\}/g, '');
}

const MESSAGE = 'hello world';
const FRAMES = [0, 1, 2, 3, 5, 8, 13, 21, 34];

describe('every effect keeps the message readable', () => {
  const EFFECTS: [string, (t: string, f: number) => string][] = [
    ['rainbow', renderRainbow],
    ['pulse', renderPulse],
    ['sparkle', renderSparkle],
    ['wave', renderWave],
    ['gradient', renderGradient],
  ];

  for (const [name, render] of EFFECTS) {
    it(`${name} never changes the characters`, () => {
      for (const frame of FRAMES) {
        expect(visible(render(MESSAGE, frame))).toBe(MESSAGE);
      }
    });
  }

  it('shake keeps every character too', () => {
    // Shake is the one effect that may pad, so it is trimmed before
    // comparing - but it must not lose or alter a character.
    for (const frame of FRAMES) {
      expect(visible(renderShake(MESSAGE, frame)).trim()).toBe(MESSAGE);
    }
  });
});

describe('sparkle', () => {
  it('lights characters up instead of eating them', () => {
    // The bug: 15% of the message became punctuation on every frame.
    const rendered = renderSparkle(MESSAGE, 3);

    expect(visible(rendered)).toBe(MESSAGE);
    expect(rendered).not.toMatch(/\{yellow-fg\}[*+.'`"^]\{/);
  });

  it('actually sparkles something', () => {
    // A "fix" that simply stopped highlighting would also pass the test
    // above.
    const anyHighlighted = FRAMES.some(f => renderSparkle(MESSAGE, f).includes('{bold}'));

    expect(anyHighlighted).toBe(true);
  });

  it('leaves spaces alone', () => {
    const rendered = renderSparkle('a b', 0);

    expect(visible(rendered)).toBe('a b');
  });
});

describe('shake', () => {
  it('never changes the width of the line', () => {
    // A line that grows a column re-wraps, and everything below it moves.
    const widths = new Set(FRAMES.map(f => renderShake(MESSAGE, f).length));

    expect(widths.size).toBe(1);
  });

  it('still moves the text', () => {
    const positions = new Set(FRAMES.map(f => renderShake(MESSAGE, f).indexOf('h')));

    expect(positions.size).toBeGreaterThan(1);
  });

  it('uses plain ASCII to do it', () => {
    // Zero-width and combining characters render as a visible glyph on an
    // Amiga client, if at all.
    for (const frame of FRAMES) {
      // eslint-disable-next-line no-control-regex
      expect(renderShake(MESSAGE, frame)).toMatch(/^[\x20-\x7e]*$/);
    }
  });
});

describe('gradient', () => {
  it('passes through more than two colours', () => {
    // It used to be from-colour, hard split, to-colour: two blocks, not a
    // fade.
    const rendered = renderGradient('abcdefghij', 0, { from: 'red', to: 'blue' });
    const colors = new Set(Array.from(rendered.matchAll(/\{(\w+)-fg\}/g)).map(m => m[1]));

    expect(colors.size).toBeGreaterThan(2);
  });

  it('starts at the from colour and ends at the to colour', () => {
    const rendered = renderGradient('abcdefghij', 0, { from: 'red', to: 'blue' });
    const colors = Array.from(rendered.matchAll(/\{(\w+)-fg\}/g)).map(m => m[1]);

    expect(colors[0]).toBe('red');
    expect(colors[colors.length - 1]).toBe('blue');
  });

  it('survives an empty string', () => {
    // `frame % 0` is NaN, and NaN indices produced undefined colours.
    expect(renderGradient('', 5, { from: 'red', to: 'blue' })).toBe('');
  });

  it('survives a single character', () => {
    const rendered = renderGradient('x', 3, { from: 'red', to: 'blue' });

    expect(visible(rendered)).toBe('x');
    expect(rendered).not.toContain('undefined');
  });

  it('falls back to the two ends for a pair it has no ramp for', () => {
    const rendered = renderGradient('abcd', 0, { from: 'green', to: 'magenta' });

    expect(visible(rendered)).toBe('abcd');
    expect(rendered).not.toContain('undefined');
  });
});

describe('the tag parser', () => {
  it('matches an effect that spans a line break', () => {
    // With `.` the content could not cross a newline, so a wrapped effect
    // rendered as its literal tags.
    const segments = parseAnimationTags('~rainbow~first line\nsecond line~/rainbow~');

    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('animated');
    expect(segments[0].content).toBe('first line\nsecond line');
  });

  it('keeps the text around an effect', () => {
    const segments = parseAnimationTags('before ~pulse~middle~/pulse~ after');

    expect(segments.map(s => s.content)).toEqual(['before ', 'middle', ' after']);
  });

  it('reads effect parameters', () => {
    const segments = parseAnimationTags('~gradient from=red to=blue~x~/gradient~');

    expect(segments[0].animation?.params).toEqual({ from: 'red', to: 'blue' });
  });

  it('leaves an unknown effect as plain text', () => {
    const segments = parseAnimationTags('~nonsense~x~/nonsense~');

    expect(segments.every(s => s.type === 'static')).toBe(true);
  });

  it('strips tags for a plain-text copy', () => {
    expect(stripAnimationTags('~rainbow~hi~/rainbow~ there')).toContain('hi');
    expect(stripAnimationTags('~rainbow~hi~/rainbow~ there')).not.toContain('~rainbow~');
  });

  it('can be run twice with the same result', () => {
    // The tag pattern is a module-level /g regex, which carries lastIndex
    // between calls if it is not reset.
    const text = 'a ~wave~b~/wave~ c';

    expect(parseAnimationTags(text)).toEqual(parseAnimationTags(text));
    expect(hasAnimationTags(text)).toBe(hasAnimationTags(text));
  });
});
