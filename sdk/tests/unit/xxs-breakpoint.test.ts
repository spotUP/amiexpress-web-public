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
import { Screen } from '../../engines/ui/blessed/core/screen';
import { Box } from '../../engines/ui/blessed/widgets/box';
import { DockablePanel } from '../../engines/ui/blessed/widgets/dockable-panel';

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

describe('XXS reaches the widgets that branch on breakpoint', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('a Box on a 40-column screen takes the narrow padding, not the desktop one', () => {
    // Review finding 1: `_applyResponsivePadding`'s switch had no 'xxs' arm,
    // so a Box on a C64 canvas silently kept its desktop padding - 2 columns
    // of every 40 spent on whitespace.
    screen = createScreen(fakeBbs(40, 25), { title: 'xxs' });
    const padding = { xs: 0, small: 0, medium: 2, large: 2 };
    const box = new Box({
      parent: screen, top: 0, left: 0, width: '100%', height: 5,
      padding: 2, responsivePadding: padding,
    } as any);

    expect((box as any).getBreakpoint()).toBe('xxs');
    box.setResponsivePadding(padding);
    expect(box.getEffectivePadding()).toBe(0);
  });

  it('an explicit xxs padding beats the xs fallback', () => {
    screen = createScreen(fakeBbs(40, 25), { title: 'xxs' });
    const padding = { xxs: 3, xs: 0, medium: 2 };
    const box = new Box({
      parent: screen, top: 0, left: 0, width: '100%', height: 5,
      padding: 2, responsivePadding: padding,
    } as any);
    box.setResponsivePadding(padding);
    expect(box.getEffectivePadding()).toBe(3);
  });

  it('an 80-column Box still takes the desktop padding', () => {
    screen = createScreen(fakeBbs(80, 25), { title: 'legacy' });
    const padding = { xs: 0, small: 0, medium: 2, large: 2 };
    const box = new Box({
      parent: screen, top: 0, left: 0, width: '100%', height: 5,
      padding: 2, responsivePadding: padding,
    } as any);
    expect((box as any).getBreakpoint()).toBe('medium');
    box.setResponsivePadding(padding);
    expect(box.getEffectivePadding()).toBe(2);
  });

  it('a DockablePanel enters mobile mode on a 40-column screen', () => {
    // Review finding 2: the panel tested `breakpoint === 'xs'`, which is
    // false at 40 now that 40 is its own tier - the narrowest screen on the
    // board was the one screen that did NOT get the auto-flow layout.
    screen = new Screen({ title: 'xxs', width: 40, height: 25, responsive: true } as any);
    const panel = new DockablePanel({
      parent: screen, title: ' Chat ', top: 1, left: 2, width: 30, height: 10,
      dockPosition: 'float', border: { type: 'line' },
    } as any);

    screen.emit('resize');
    expect((panel as any).mobileMode).toBe(true);
  });

  it('a DockablePanel on an 80-column screen stays out of mobile mode', () => {
    screen = new Screen({ title: 'legacy', width: 80, height: 24 } as any);
    const panel = new DockablePanel({
      parent: screen, title: ' Chat ', top: 1, left: 22, width: 40, height: 10,
      dockPosition: 'float', border: { type: 'line' },
    } as any);

    screen.emit('resize');
    expect((panel as any).mobileMode).toBe(false);
  });
});

describe('only compact and wide screens go responsive by default', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  // Review finding 3 (RULING): the geometry-driven default was written for
  // the XXS tier, but `width !== 80` also captured 41-79. A 60-column ANSI
  // caller used to get the legacy fixed-80 pipeline (and its height rule),
  // and the backend's prose wrap clamps ANSI callers to max(80, reported) -
  // so a 60-wide responsive screen would paint at 60 while the BBS wrapped
  // at 80. 41-79 therefore stays exactly as it was before Task 3.
  it('a 60-column ANSI session keeps the legacy fixed-80 screen', () => {
    screen = createScreen(fakeBbs(60, 24), { title: 'ansi60' });
    expect(screen.getDimensions()).toEqual({ width: 80, height: 24 });
  });

  it('41 and 79 are both legacy too', () => {
    screen = createScreen(fakeBbs(41, 24), { title: 'ansi41' });
    expect(screen.getDimensions().width).toBe(80);
    screen.destroy();
    screen = createScreen(fakeBbs(79, 24), { title: 'ansi79' });
    expect(screen.getDimensions().width).toBe(80);
  });

  it('40 is still responsive at 40x25 and 132 is still responsive', () => {
    screen = createScreen(fakeBbs(40, 25), { title: 'xxs' });
    expect(screen.getDimensions()).toEqual({ width: 40, height: 25 });
    screen.destroy();
    screen = createScreen(fakeBbs(132, 40), { title: 'wide' });
    expect(screen.getDimensions()).toEqual({ width: 132, height: 40 });
  });
});

describe('one breakpoint ladder, two callers', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  // Review finding 4: ResponsiveLayoutManager.getBreakpoint() carried its own
  // copy of the ladder, stopping at 'xs'. Both must answer the same thing.
  for (const width of [40, 41, 49, 50, 80, 132]) {
    it(`the layout manager and getBreakpointName agree at ${width}`, () => {
      screen = new Screen({ title: 'ladder', width, height: 24, responsive: true } as any);
      expect(screen.responsiveLayout.getBreakpoint()).toBe(getBreakpointName(width));
    });
  }

  it('a caller that overrides the thresholds still gets its own ladder', () => {
    screen = new Screen({ title: 'custom', width: 40, height: 25, responsive: true } as any);
    const custom = new (screen.responsiveLayout.constructor as any)(screen, {
      breakpoints: { xxs: 20, xs: 30 },
      enableAutoResize: false,
    });
    expect(custom.getBreakpoint()).toBe('small');
  });
});

describe('calculateDialogWidth never exceeds the screen', () => {
  it('a screen narrower than the minimum dialog gets the screen width', () => {
    expect(calculateDialogWidth(10)).toBe(10);
    expect(calculateDialogWidth(20)).toBe(20);
    expect(calculateDialogWidth(22)).toBe(20);
  });
});
