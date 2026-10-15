/**
 * A live re-theme never re-routes a ground colour.
 *
 * Sysop, 2026-10-15: "Classic" leaked a blue background and "Quiet Phosphor
 * (muted)" a lime-green one where black belongs. The leak was tokenMap
 * sending a colour that is the ground of both themes to some other token of
 * the target theme, so the old theme's colour survived on the ground.
 * (The door that drove this, Doors/theme-picker, is gone; the invariant lives
 * with live.ts, which the C-less web doors still use.)
 */
import { THEMES, tokenMap } from '../../engines/ui/theme';

describe('tokenMap', () => {
  it('finds the shipped themes at all (the loop below is not vacuous)', () => {
    expect(THEMES.length).toBeGreaterThan(1);
  });

  it('never re-routes a colour that is the ground of both themes', () => {
    for (const from of THEMES) {
      for (const to of THEMES) {
        const moved = tokenMap(from, to).get(from.tokens.ground);
        expect(moved === undefined || moved === to.tokens.ground).toBe(true);
      }
    }
  });
});
