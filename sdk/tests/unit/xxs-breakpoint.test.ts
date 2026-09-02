/**
 * XXS (40-column C64/PETSCII) breakpoint tier - C64/40-col plan, Task 3.
 *
 * Two things are proven here:
 *  1. The tier itself: `getBreakpointName(40) === 'xxs'`, the dialog width,
 *     and the single-source-of-truth `getCompactProfile()` that Task 6's
 *     doors consume instead of inventing their own width checks.
 *  2. REACHABILITY: a blessed screen started the way a door actually starts
 *     one - `createScreen(bbs, opts)` with a BBSApi-shaped `getTerminalSize()`
 *     returning the PETSCII session's 40x25 - really is 40 wide, really
 *     classifies as xxs, and really paints 40-cell rows. A tier nothing can
 *     reach is not a tier.
 *
 * The 80-column half of every assertion below is the non-negotiable (b)
 * guard in miniature; the byte-level proof is
 * `sdk/tests/unit/eighty-col-baseline.test.ts` (Task 2), which must stay
 * green - and its .snap unchanged - through this task.
 */
import {
  BREAKPOINT_XXS,
  getBreakpointName,
  calculateDialogWidth,
  getCompactProfile,
  isCompactWidth,
  effectsAllowed,
} from '../../engines/ui/blessed/core/responsive-constants';
import { createScreen } from '../../utils/blessed-helpers';

/** A BBSApi-shaped door host (web/backend/src/doors/BBSApi.ts:202). */
function fakeBbs(width: number, height: number): any {
  return {
    write: () => undefined,
    connectionType: 'web',
    getTerminalSize: () => ({ width, height }),
  };
}

describe('XXS breakpoint tier (40-column C64/PETSCII)', () => {
  it('40 columns classifies as xxs; 41-49 stays xs', () => {
    expect(BREAKPOINT_XXS).toBe(41);
    expect(getBreakpointName(40)).toBe('xxs');
    expect(getBreakpointName(41)).toBe('xs');
    expect(getBreakpointName(49)).toBe('xs');
    expect(getBreakpointName(80)).toBe('medium');
  });

  it('dialogs at 40 columns fit with one column of margin each side', () => {
    expect(calculateDialogWidth(40)).toBe(38);
  });

  it('dialog widths at 50 and above are unchanged by the new tier', () => {
    // Regression pin: the xs/desktop arms of calculateDialogWidth keep the
    // exact values they had before BREAKPOINT_XXS existed.
    expect(calculateDialogWidth(49)).toBe(45);
    expect(calculateDialogWidth(80)).toBe(64);
    expect(calculateDialogWidth(132)).toBe(105);
  });

  it('compact profile: borderless, single-column, collapsed chrome at 40; untouched at 80', () => {
    expect(getCompactProfile(40)).toEqual({
      borders: false, singleColumn: true, collapseChrome: true, gap: 0, padding: 0,
    });
    expect(getCompactProfile(80)).toEqual({
      borders: true, singleColumn: false, collapseChrome: false, gap: 1, padding: 1,
    });
  });

  it('decorative effects are off at XXS and on everywhere else', () => {
    // Sysop, 2026-09-02: DOORMAN's glitch/typewriter effects drop stray
    // glyphs mid-row on the PETSCII canvas. Doors read this flag (width
    // from the live screen, never a constant) to switch them off.
    expect(isCompactWidth(40)).toBe(true);
    expect(isCompactWidth(41)).toBe(false);
    expect(isCompactWidth(80)).toBe(false);
    expect(effectsAllowed(40)).toBe(false);
    expect(effectsAllowed(80)).toBe(true);
  });
});

describe('createScreen honors non-80 session geometry', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('a 40x25 PETSCII session gets a 40x25 screen', () => {
    screen = createScreen(fakeBbs(40, 25), { title: 'xxs' });
    expect(screen.getDimensions()).toEqual({ width: 40, height: 25 });
  });

  it('an explicit caller responsive:false still wins (options spread last)', () => {
    screen = createScreen(fakeBbs(40, 25), { title: 'xxs', responsive: false } as any);
    expect(screen.getDimensions().width).toBe(80);
  });

  it('an 80-column session still takes the legacy fixed pipeline', () => {
    // Non-negotiable (b): at exactly 80 nothing changes - not the geometry,
    // and not the setDimensions width pin that the legacy contract relies on.
    screen = createScreen(fakeBbs(80, 25), { title: 'legacy' });
    expect(screen.getDimensions()).toEqual({ width: 80, height: 25 });
    screen.setDimensions(23, 60);
    expect(screen.getDimensions().width).toBe(80);
  });

  it('a wide session keeps its existing responsive behavior', () => {
    screen = createScreen(fakeBbs(132, 40), { title: 'wide' });
    expect(screen.getDimensions()).toEqual({ width: 132, height: 40 });
  });
});

describe('reachability: a door-shaped 40x25 screen is xxs and paints 40 wide', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('the screen a PETSCII door gets is xxs and every painted row is 40 cells', () => {
    screen = createScreen(fakeBbs(40, 25), { title: 'petscii door' });

    // The tier is derived from the LIVE screen width - the value a door's
    // effects/layout code reads - not from a constant.
    expect(getBreakpointName(screen.width)).toBe('xxs');
    expect(getCompactProfile(screen.width).borders).toBe(false);
    expect(effectsAllowed(screen.width)).toBe(false);

    screen.render();
    for (let y = 0; y < screen.height; y++) {
      expect(screen.buffer[y]).toHaveLength(40);
    }
    expect(screen.buffer).toHaveLength(25);
  });
});
