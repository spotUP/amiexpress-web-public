/**
 * The XXS tier helpers must be reachable the way a door imports them.
 *
 * A door adapting to 40 columns writes
 * `import { getCompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed'`
 * (or from the package root). The helpers merely existing inside
 * `core/responsive-constants` is not enough: if the barrels do not carry
 * them, every door has to reach into a deep path and half of them will
 * hardcode a width check instead.
 *
 * This suite imports the blessed barrel - the one a jest CJS run can load.
 * The package ROOT barrel (`sdk/index.ts`, which also re-exports these) is
 * not importable from jest at all: it pulls in `tone`, an ESM-only package
 * the CJS ts-jest setup cannot parse. That is pre-existing and unrelated to
 * this tier; the root export is covered by `npx tsc` plus the emitted
 * `dist/index.d.ts`.
 */
import * as blessedBarrel from '../../engines/ui/blessed/index';

describe('barrel exports of the responsive tier helpers', () => {
  it('the blessed barrel carries the tier functions', () => {
    const barrel = blessedBarrel as any;
    expect(barrel.BREAKPOINT_XXS).toBe(41);
    expect(typeof barrel.getBreakpointName).toBe('function');
    expect(typeof barrel.getCompactProfile).toBe('function');
    expect(typeof barrel.isCompactWidth).toBe('function');
    expect(typeof barrel.effectsAllowed).toBe('function');
  });

  it('they behave identically to the deep import', () => {
    const barrel = blessedBarrel as any;
    expect(barrel.getBreakpointName(40)).toBe('xxs');
    expect(barrel.isCompactWidth(40)).toBe(true);
    expect(barrel.effectsAllowed(40)).toBe(false);
    expect(barrel.getCompactProfile(40).singleColumn).toBe(true);
    expect(barrel.getCompactProfile(80).borders).toBe(true);
  });
});
