/**
 * The editor lists the codes a screen actually carries, not four shapes.
 *
 * `Conf3/bull20.txt` opens with a bare `~f` on line 1 and nothing else, and
 * the editor showed no list and - once the list gained a toggle - no toggle
 * either: "i see only the F code and i see no code toggle", then "show or hide
 * codes does nothing" (sysop, 2026-09-18).
 *
 * `findMciTokens` matched `~CC_`, `~SS_`/`~2S`, `~SR_` and `~CL.` and nothing
 * else, so a screen whose only code is `~f` had an empty token list.
 */
import { describe, expect, it } from 'vitest';

import { findMciTokens } from '../pages/mci-tokens';

/** A canvas row from plain text, in the shape the editor holds one. */
function row(text: string) {
  return [...text].map(char => ({ char, fg: 7, bg: 0 }));
}

describe('what the editor finds on the canvas', () => {
  it('finds a bare ~f, which is most screens\' only code', () => {
    const tokens = findMciTokens([row('~f'), row('THE ART')] as never, []);

    expect(tokens).toHaveLength(1);
    expect(tokens[0].line).toBe(0);
    expect(tokens[0].column).toBe(0);
    // Not drawn as broken: `~f` names nothing, so there is nothing to resolve.
    expect(tokens[0].resolves).toBe(true);
  });

  it('finds the codes under the art as well as the one above it', () => {
    const tokens = findMciTokens(
      [row('~f'), row('THE ART'), row('~SP'), row('~CC_ctop'), row('~XISUBSCAN')] as never,
      [{ code: 'CC', target: 'ctop', resolves: true, scopeSpecific: false }] as never,
    );

    // ~XISUBSCAN is in no catalogue anywhere and still counts: the board's
    // scanner takes any `~token`.
    expect(tokens.map(t => t.line).sort()).toEqual([0, 2, 3, 4]);
  });

  it('still knows which targets resolve', () => {
    const tokens = findMciTokens(
      [row('~CC_gone')] as never,
      [{ code: 'CC', target: 'gone', resolves: false, scopeSpecific: false }] as never,
    );

    expect(tokens[0].resolves).toBe(false);
  });
});
