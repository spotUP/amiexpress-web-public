/**
 * Bot replies arrive as plain terminal text: markdown markers stripped,
 * truncation marked instead of silent.
 *
 * A Fairlight answer reached the caller with literal *asterisks* around
 * every title and its last sentence cut mid-word ("...Edison 2026 theme.
 * Back"), because nothing between the model and the terminal spoke plain
 * text (2026-09-09).
 */
import { stripMarkdown, withContinuation } from '../../src/handlers/grumpy-sysop-bot.handler';

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
