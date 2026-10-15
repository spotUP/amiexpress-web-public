/**
 * Bot replies arrive as plain terminal text: markdown markers stripped,
 * truncation marked instead of silent.
 *
 * A Fairlight answer reached the caller with literal *asterisks* around
 * every title and its last sentence cut mid-word ("...Edison 2026 theme.
 * Back"), because nothing between the model and the terminal spoke plain
 * text (2026-09-09).
 */
import { stripEmojis, stripMarkdown, withContinuation } from '../../src/handlers/grumpy-sysop-bot.handler';

describe('stripMarkdown', () => {
  it('removes paired markers, keeps the words', () => {
    expect(stripMarkdown('*The Swedish Booze Elite*')).toBe('The Swedish Booze Elite');
    expect(stripMarkdown('**Boozechild** (tracked music)')).toBe('Boozechild (tracked music)');
    expect(stripMarkdown('`demo` and __old__ stuff')).toBe('demo and old stuff');
  });

  it('unwraps links and drops line markers', () => {
    expect(stripMarkdown('[Pouet](https://pouet.net/x)')).toBe('Pouet (https://pouet.net/x)');
    expect(stripMarkdown('# Crew\n> quoted')).toBe('Crew\nquoted');
  });

  it('leaves lone characters alone', () => {
    expect(stripMarkdown('4*4 = 16, *FLT* forever')).toBe('4*4 = 16, FLT forever');
  });
});

describe('withContinuation', () => {
  it('marks a cut reply so the caller knows to ask on', () => {
    const out = withContinuation('...and the Edison 2026 theme. Back');
    expect(out).toContain('...and the Edison 2026 theme. Back');
    expect(out).toMatch(/go on/);
  });
});

describe('stripEmojis', () => {
  it('closes the gap a removed emoji leaves', () => {
    expect(stripEmojis('nice  work')).toBe('nice work');
    expect(stripEmojis('Up Rough \u{1F525} forever')).toBe('Up Rough forever');
  });

  it('keeps the paragraph breaks it used to eat', () => {
    // /\s{2,}/ matched a blank line, so a reply written in paragraphs reached
    // the caller as one run-on block - and this runs BEFORE stripMarkdown, so
    // nothing downstream could put the breaks back.
    expect(stripEmojis('First line.\n\nSecond line.')).toBe('First line.\n\nSecond line.');
    expect(stripEmojis('Files:\n- one\n- two')).toBe('Files:\n- one\n- two');
  });

  it('does not leave whitespace stranded at the end of a line', () => {
    expect(stripEmojis('done \u{1F525}\nnext')).toBe('done\nnext');
  });
});

describe('the raw fallback', () => {
  it('does not paste sixty lines at a terminal', () => {
    const { __rawToolAnswerForTest } = require('../../src/handlers/grumpy-sysop-bot.handler');
    const sixty = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n');
    const out = __rawToolAnswerForTest([sixty]);
    const lines = out.split('\n');
    // The preamble, sixteen lines of data, and a count of what was left out.
    expect(lines.length).toBeLessThan(20);
    expect(out).toContain('line 16');
    expect(out).not.toContain('line 17');
    expect(out).toMatch(/\+44 more lines/);
  });

  it('says nothing about more when it all fits', () => {
    const { __rawToolAnswerForTest } = require('../../src/handlers/grumpy-sysop-bot.handler');
    const out = __rawToolAnswerForTest(['one', 'two']);
    expect(out).not.toMatch(/more lines/);
    expect(out).toContain('one');
    expect(out).toContain('two');
  });
});
