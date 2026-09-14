/**
 * The editor says what the code under the cursor does.
 *
 * It already FOUND the codes and outlined them, which is the least useful half
 * of knowing: an artist could see that `~SS_` was special and not what it was
 * for. The sysop, 2026-09-14: "it would be nice if the editor explained what
 * the mci codes in the screen does as well".
 *
 * Three facts, in the order they matter: what the code does, what this one
 * points at, and whether the board can follow it. The third is the one a
 * broken screen turns on and the one an artist cannot get any other way -
 * `resolves` is the board's own index answering, not a guess.
 */
import { describe, it, expect } from 'vitest';
import { tokenAt, explainToken, type MciToken } from '../pages/mci-tokens';

const token = (over: Partial<MciToken> = {}): MciToken => ({
  code: 'SS_', target: 'BBS:Bulletins/bull6.txt',
  line: 3, column: 10, length: 30, resolves: true, ...over,
});

const CATALOG = [
  { code: 'SS_', summary: 'Show another screen inside this one' },
  { code: 'XI', summary: 'Start a door without announcing it' },
];

describe('the code under the cursor', () => {
  it('is found anywhere inside it, not only on the tilde', () => {
    // An artist pointing at the middle of a long include is pointing at it.
    const tokens = [token()];

    expect(tokenAt(tokens, 3, 10)).toBe(tokens[0]);
    expect(tokenAt(tokens, 3, 25)).toBe(tokens[0]);
    expect(tokenAt(tokens, 3, 39)).toBe(tokens[0]);
  });

  it('is nothing when the cursor is past its end or on another row', () => {
    const tokens = [token()];

    expect(tokenAt(tokens, 3, 40)).toBeNull();
    expect(tokenAt(tokens, 3, 9)).toBeNull();
    expect(tokenAt(tokens, 4, 20)).toBeNull();
  });

  it('says what the code does and what it points at', () => {
    const explained = explainToken(token(), CATALOG);

    expect(explained.title).toBe('~SS_');
    expect(explained.summary).toBe('Show another screen inside this one');
    expect(explained.target).toBe('BBS:Bulletins/bull6.txt');
  });

  it('says when the board cannot follow it', () => {
    // The fact that makes a screen quietly do nothing, said while it is being
    // drawn rather than after it ships.
    expect(explainToken(token({ resolves: false }), CATALOG).broken).toBe(true);
    expect(explainToken(token({ resolves: true }), CATALOG).broken).toBe(false);
  });

  it('still explains a code the catalog does not know', () => {
    // An unknown code is exactly when somebody needs to be told it is
    // unknown - staying silent there is the case that matters most.
    const explained = explainToken(token({ code: 'ZZ' }), CATALOG);

    expect(explained.title).toBe('~ZZ');
    expect(explained.summary).toMatch(/does not know|Not a code/i);
  });

  it('matches the catalog without regard to case', () => {
    expect(explainToken(token({ code: 'ss_' }), CATALOG).summary)
      .toBe('Show another screen inside this one');
  });

  it('has no target to show for a code that takes none', () => {
    expect(explainToken(token({ code: 'XI', target: '' }), CATALOG).target).toBeNull();
  });
});
