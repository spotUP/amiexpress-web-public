/**
 * A chat message that contains a newline must not corrupt the whole log.
 *
 * Reported live 2026-08-26: "I sent a message with an effect applied in the
 * middle that made the entire chatlog go crazy." The message, verbatim from
 * the live logs:
 *
 *   'and if you select your typed text you can do ~sparkle~funny~/sparkle~ \nthings'
 *
 * The effect being mid-sentence is not the fault - the parser segments that
 * correctly. The newline is. livechat keeps `chatMessages` as one entry per
 * MESSAGE and registers animated lines by that index, but the animation
 * manager writes frames with `chatLog.setLine(index, ...)`, which addresses
 * display ROWS. A message spanning two rows breaks the one-entry-one-row
 * assumption, and every animated line after it is written to the wrong row.
 */

import {
  splitAnimatedLines,
  parseAnimationTags,
  hasAnimationTags,
} from '../../../../sdk/engines/ui/blessed/utils/animations/parser';

/** Verbatim from the live log. */
const REAL_MESSAGE =
  'and if you select your typed text you can do ~sparkle~funny~/sparkle~ \nthings';

describe('splitAnimatedLines', () => {
  it('leaves a single-row message as one row', () => {
    expect(splitAnimatedLines('~sparkle~funny~/sparkle~')).toEqual([
      '~sparkle~funny~/sparkle~',
    ]);
    expect(splitAnimatedLines('plain text')).toEqual(['plain text']);
  });

  it('splits the message that broke the log into one entry per display row', () => {
    const rows = splitAnimatedLines(REAL_MESSAGE);

    expect(rows).toHaveLength(2);
    // No row may contain a newline - that is the invariant the chat log and
    // the animation manager both depend on.
    for (const row of rows) expect(row).not.toContain('\n');
  });

  it('keeps the effect on the row it belongs to', () => {
    const rows = splitAnimatedLines(REAL_MESSAGE);

    expect(rows[0]).toContain('~sparkle~funny~/sparkle~');
    expect(hasAnimationTags(rows[0])).toBe(true);
    // The second row is ordinary text and must not be animated.
    expect(rows[1]).toBe('things');
    expect(hasAnimationTags(rows[1])).toBe(false);
  });

  it('keeps an effect that spans a newline balanced on BOTH rows', () => {
    // The parser deliberately allows effect content to run across a line
    // break. Splitting must not leave one row with an opening tag and the
    // other with a closing one - that renders as literal markup.
    const rows = splitAnimatedLines('~pulse~first\nsecond~/pulse~');

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).not.toContain('\n');
      const segments = parseAnimationTags(row);
      expect(segments.some(s => s.type === 'animated')).toBe(true);
      // Balanced: nothing left over as literal tag text.
      expect(segments.every(s => !s.content.includes('~/'))).toBe(true);
    }
    expect(parseAnimationTags(rows[0])[0].content).toBe('first');
    expect(parseAnimationTags(rows[1])[0].content).toBe('second');
  });

  it('preserves effect parameters on every row it wraps', () => {
    const rows = splitAnimatedLines('~gradient from=red to=blue~one\ntwo~/gradient~');

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const seg = parseAnimationTags(row).find(s => s.type === 'animated');
      expect(seg?.animation?.name).toBe('gradient');
      expect(seg?.animation?.params).toEqual({ from: 'red', to: 'blue' });
    }
  });

  it('handles CRLF as one row break, not two', () => {
    const rows = splitAnimatedLines('one\r\ntwo');
    expect(rows).toEqual(['one', 'two']);
  });

  it('keeps blank rows, so a deliberate empty line still occupies a row', () => {
    // Drop them and the row count stops matching what is drawn, which is the
    // same drift by another route.
    expect(splitAnimatedLines('one\n\ntwo')).toEqual(['one', '', 'two']);
  });

  it('does not wrap an empty piece in effect tags', () => {
    // '~pulse~a\n~/pulse~' has nothing on the second row: emitting
    // '~pulse~~/pulse~' there would be markup with no content.
    const rows = splitAnimatedLines('~pulse~a\n~/pulse~');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toBe('');
  });

  it('row count always matches the number of display rows the text occupies', () => {
    const cases = [
      REAL_MESSAGE,
      'a\nb\nc',
      '~rainbow~x~/rainbow~\ny',
      'no newline at all',
      '~pulse~spans\nthe\nbreak~/pulse~',
    ];
    for (const text of cases) {
      expect(splitAnimatedLines(text)).toHaveLength(text.split('\n').length);
    }
  });
});
