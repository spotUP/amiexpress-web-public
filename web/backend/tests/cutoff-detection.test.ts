/**
 * Cut-off detection for unfinished chat replies (live 2026-09-10).
 *
 * Case 1: Turrican answer ended "...about Turrican: **" - colon-opened bold.
 * Case 2: Turrican answer ended "Is there any specific aspect of" - a
 * finished reply never ends on a preposition or article.
 * A finished reply ("...iconic within the retro gaming community.") stays clean.
 */

import { looksCutOff } from '../src/handlers/grumpy-sysop-bot.handler';

describe('looksCutOff', () => {
  it('flags the live Turrican colon-bold cut', () => {
    expect(looksCutOff('Turrican stuff, all about Turrican: **')).toBe(true);
  });
  it('flags a reply ending on a preposition', () => {
    expect(looksCutOff('Is there any specific aspect of')).toBe(true);
  });
  it('flags a reply ending on an article', () => {
    expect(looksCutOff('one of the')).toBe(true);
  });
  it('passes a finished reply', () => {
    expect(looksCutOff('...iconic within the retro gaming community.')).toBe(false);
  });
  it('passes a closed bold (no colon opener)', () => {
    expect(looksCutOff('the **Turrican** soundtrack')).toBe(false);
  });
});
