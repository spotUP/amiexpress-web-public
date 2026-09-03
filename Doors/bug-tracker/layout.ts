/**
 * Width rules for the bug tracker, in one place.
 *
 * Every one of these takes the LIVE screen width and asks the SDK's single
 * compact profile what to do with it - there is no 40 and no 80 in this
 * door. At the XXS tier (a C64/PETSCII caller, 40x25) a frame costs two of
 * forty columns, two side-by-side panels squeeze to sixteen cells each, and
 * a label one character too long does not clip on that canvas: it wraps and
 * eats the row beneath it.
 *
 * It lives in its own module so it can be tested without the door - app.ts
 * reads `import.meta.url`, which a CommonJS test runner cannot load.
 */
import { getCompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { FooterHint } from '@amiexpress/bbs-door-sdk/engines/ui/theme';

/** The hints BUGS offers at the normal tiers. */
export const BUG_TRACKER_HINTS: readonly FooterHint[] = [
  { key: 'Arrows', does: 'Navigate' },
  { key: 'Enter', does: 'Select' },
  { key: 'ESC', does: 'Back' },
  { key: 'Q', does: 'Quit' },
];

/** The two that always apply; the view's own strip lists the rest. */
export const BUG_TRACKER_HINTS_COMPACT: readonly FooterHint[] = [
  { key: 'ESC', does: 'Back' },
  { key: 'Q', does: 'Quit' },
];

/**
 * The list the theme's glitches should damage: whichever one the current
 * view put inside the container. Never the masthead or the hint line -
 * damage there reads as the door being broken rather than as atmosphere.
 *
 * The door detaches and rebuilds its content pane on every view change, so
 * the chrome asks for this at each tick rather than capturing an element
 * once at startup.
 */
export function listOnScreen(container: { children?: unknown[] } | null | undefined): unknown {
  const found = (container?.children ?? []).find(
    (child: any) => typeof child?.setItems === 'function' && Array.isArray(child?.items)
  );
  return found ?? null;
}

export class CompactLayout {
  /** Always a LIVE width - the screen's, read on every access. */
  constructor(private readonly widthOf: () => number) {}

  get width(): number {
    return this.widthOf() || 80;
  }

  get profile() {
    return getCompactProfile(this.width);
  }

  /** True when secondary columns have to go rather than fold. */
  get narrow(): boolean {
    return this.profile.singleColumn;
  }

  /** `{ type: 'line' }`, or no border at all when the columns cannot spare it. */
  panelBorder(): any {
    return this.profile.borders ? { type: 'line' } : undefined;
  }

  /**
   * Spread into a panel that relies on the Panel widget's DEFAULT frame.
   * Wide adds no key at all, so the default (and its colour) is untouched
   * byte for byte; at XXS the frame goes.
   */
  get frameless(): Record<string, any> {
    return this.profile.borders ? {} : { border: undefined };
  }

  /** Height of a header/footer strip: a framed box, or a single row at XXS. */
  get chromeH(): number {
    return this.profile.collapseChrome ? 1 : 3;
  }

  /** Left inset of a full-width panel (the 1-column gutter goes at XXS). */
  get panelLeft(): number {
    return this.profile.collapseChrome ? 0 : 1;
  }

  get panelWidth(): string {
    return this.profile.collapseChrome ? '100%' : '98%';
  }

  /** Height of the body panel between a header strip and a footer strip. */
  get bodyH(): string {
    return this.profile.collapseChrome ? '100%-2' : '100%-6';
  }

  /**
   * Geometry for one half of a side-by-side pair. At XXS the pair stacks:
   * the primary panel takes the top half, the secondary the bottom half.
   */
  pairPrimary(wide: Record<string, any>): Record<string, any> {
    return this.narrow
      ? { top: this.chromeH, left: 0, width: '100%', height: '50%-1' }
      : wide;
  }

  pairSecondary(wide: Record<string, any>): Record<string, any> {
    return this.narrow
      ? { top: '50%', left: 0, width: '100%', height: '50%-1' }
      : wide;
  }

  /** Clip a string to what is left of the row after `reserved` cells. */
  fit(text: string, reserved: number): string {
    return text.substring(0, Math.max(1, this.width - reserved));
  }

  /**
   * A chrome strip's text. Wide keeps the sentence it always had; XXS gets
   * the short form, which also carries the label - a borderless box has no
   * frame for one to sit in.
   */
  stripText(wide: string, short: string): string {
    return this.profile.collapseChrome ? short : wide;
  }

  /** The title column of a bug row: 50 on a board, what is left on a C64. */
  bugTitle(title: string, voteTagLength: number): string {
    // `#0001 [NEW] ` is 12 cells, plus the vote tag and the list's gutter.
    return this.narrow ? this.fit(title, 14 + voteTagLength) : title.substring(0, 50);
  }

  /** How many cells a horizontal bar chart may use. */
  barWidth(wide: number, reserved: number): number {
    return this.narrow ? Math.max(4, this.width - reserved) : wide;
  }
}
