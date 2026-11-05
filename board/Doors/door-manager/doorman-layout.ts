/**
 * DOORMAN's shared layout: one set of panels that every view updates in
 * place, and the width rules that decide their shape.
 *
 * Split out of app.ts when it reached the 2000-line ceiling, the same way
 * install-core.ts was. Nothing here imports app.ts, so the views can import
 * the layout without a cycle.
 *
 * Every width decision here comes from the LIVE screen through the SDK's
 * single compact profile. There is no 40 and no 80 in this file: the door
 * used to build its Screen with no geometry at all and paint an 80-column
 * layout onto whatever canvas the caller had, which is what a C64 saw as a
 * repeated name column and size cells on the wrong rows.
 */
import { Panel, Box, List, ScrollableBox, Textbox } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { getCompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { attachDoorChrome, type DoorChrome } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { T, S, CURRENT } from './door-theme';
import { typeBadge } from './type-badge';

/** Byte count as a door list shows it. Lives here with the row that uses it. */
export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / 1048576)} MB`;
}

/** The shape an installed-door row needs. */
export interface InstalledRowDoor {
  type: string;
  name: string;
  size: number;
  enabled?: boolean;
  /** The minimum access level (the .info ACCESS tooltype); 32767 is the disabled sentinel. */
  accessLevel?: number;
}

/** The access column: three cells, right-aligned; a disabled door shows a dash. */
export function accessCell(level: number | undefined): string {
  if (level === undefined || level === null) return '  ?';
  if (level >= 32767) return '  -';
  return String(level).padStart(3).slice(-3);
}

/**
 * Exported for the 40-column layout test: the geometry rules are the thing
 * under test, and constructing the real layout against a real Screen is the
 * only honest way to assert them (a source pin proves a call exists, not
 * that the panels stop overlapping).
 */
export class DoormanLayout {
  screen: any;
  header: any; footer: any;
  listPanel: any; doorList: any;
  infoPanel: any; infoBox: any;
  filterPanel: any; filterBox: any;
  /** The masthead, its rail and the theme's glitches; stopped at teardown. */
  chrome: DoorChrome | null = null;
  /**
   * Kept as a field name the door already calls: teardown says
   * `stopMasthead()`, and there is no reason to make every call site learn
   * a new one for the same act.
   */
  stopMasthead: (() => void) | null = null;
  readonly width: number;
  /** The SDK's compact profile for THIS screen - the only width authority. */
  readonly compact: ReturnType<typeof getCompactProfile>;
  /** True when the canvas is the 40-column XXS tier (a C64/PETSCII caller). */
  readonly narrow: boolean;

  constructor(screen: any, nodeId: string | number) {
    this.screen = screen;
    const screenWidth = ((screen as any).width as number) || 80;
    /*
     * THE FRAMES STAY ON A C64, and they are where this door's colour is.
     *
     * The SDK's compact profile answers `borders: false` at forty columns -
     * two columns bought back, which is the right default for a door whose
     * colour is in its TEXT. This door's is not: its accents live on the
     * borders (`border: { fg: T.accent }` on every panel), so dropping them
     * left the sysop a screen of ink grey with no frames at all
     * ("doorman is only grey and has no borders", 2026-09-22).
     *
     * A C64 draws a box natively - PETSCII has the glyphs and the board's
     * own rule turns a run of dashes into a line - so the two columns are
     * worth spending here. WHIP keeps its frames at forty for the same
     * reason and is the screen he called perfect.
     */
    this.compact = { ...getCompactProfile(screenWidth), borders: true };
    this.narrow = this.compact.singleColumn;

    // The list's inner text width. Side by side it is 35% of the screen
    // less the frames; stacked it is the whole row less the gutter.
    this.width = this.narrow
      ? Math.max(8, screenWidth - 6)
      : Math.floor(screenWidth * 0.35) - 8;

    // Two of forty columns is too much to spend on a frame, and a header or
    // footer three rows tall is a fifth of a C64 screen. `frame` is spread
    // into every panel: at 80 it adds no key at all, so the Panel widget's
    // default border (and its colour) is untouched byte for byte.
    const frame: Record<string, any> = this.compact.borders ? {} : { border: undefined };
    const chromeH = this.compact.collapseChrome ? 1 : 3;
    /**
     * A frame costs two rows, and the header, the footer and the filter are
     * ONE row tall once the chrome collapses. Framing them leaves no interior
     * for the text: blessed paints the corners and the title never appears -
     * "it has parts of frames under and over the interface" (the sysop,
     * 2026-09-22). Bars carry their colour in their INK, so they take the
     * frame only when they are tall enough to hold one.
     */
    const barBorders = this.compact.borders && chromeH >= 3;
    const barFrame: Record<string, any> = barBorders ? {} : { border: undefined };
    // Stacked at XXS: the list takes the top half, the info pane the bottom.
    const listGeom = this.narrow
      ? { top: chromeH, left: 0, width: '100%', height: '50%-1' }
      : { top: 3, left: 0, width: '35%', height: '100%-6' };
    const infoGeom = this.narrow
      ? { top: '50%', left: 0, width: '100%', height: '50%-1' }
      : { top: 3, left: '35%', width: '65%', height: '100%-6' };
    // Inside a frameless panel there is no frame to sit inside of.
    const inset = this.compact.borders
      ? { top: 1, left: 1, width: '100%-2', height: '100%-2' }
      : { top: 0, left: 0, width: '100%', height: '100%' };

    this.header = new Panel({ parent: screen, top: 0, left: 0, width: '100%', height: chromeH,
      ...barFrame,
      tags: true, style: { fg: T.ink, bg: T.bar, border:{ fg: T.accentAlt } }, focusable: false } as any);

    // The animated slash rail, on the header's first row. A child keeps it
    // out of the outer geometry - nothing below moves, and a theme with no
    // rail (classic) gets the plain title it always had.
    const mastheadRow = new Box({ parent: this.header, top: 0, left: 0,
      width: barBorders ? '100%-2' : '100%',
      height: 1, tags: true, content: '', focusable: false,
      style: S.bar.style } as any);
    /**
     * The chrome, from the ONE SDK call.
     *
     * The rail is drawn to the SCREEN's width - it was the 80-wide run the
     * sysop watched fold on a C64 - and at XXS the whole thing stops: a
     * 40-column canvas has no spare cells for decoration, and 20fps of row
     * repaint is a lot of PETSCII bytes.
     *
     * No `footer` is handed over on purpose. DOORMAN's bottom row is a
     * STATUS line, not a hint bar: every view writes its own key strip into
     * it and the long operations write progress there. Routing it through
     * footerHints would delete information the door is using the row for.
     * The glitches go on the door LIST, which is the only thing here with
     * rows to spare.
     */
    this.chrome = attachDoorChrome(CURRENT, {
      width: screenWidth,
      title: 'DOORMAN',
      masthead: mastheadRow as any,
      // Two columns less again when the header is framed; one for the cursor
      // cell when it is a bare bar.
      mastheadWidth: Math.max(1, ((screen as any).width || 80) - (barBorders ? 3 : 1)),
      glitch: () => this.doorList ?? null,
      glitchOptions: { tickMs: 400 },
      styles: S,
      render: () => screen.render(),
    });
    this.stopMasthead = () => this.chrome?.stop();

    this.footer = new Panel({ parent: screen, bottom: 0, left: 0, width: '100%', height: chromeH,
      ...barFrame,
      tags: true, style: { fg: T.ink, bg: T.bar, border:{ fg: T.accentAlt } }, focusable: false } as any);

    this.filterPanel = new Panel({ parent: screen, top: chromeH, left: 0,
      width: this.narrow ? '100%' : '35%', height: chromeH,
      ...barFrame,
      tags: true, style: { border:{ fg: T.dim } }, focusable: false } as any);
    // keys:false + inputOnFocus:false make this a DISPLAY-ONLY widget — see
    // sdk/engines/ui/blessed/widgets/textbox.ts:58-60 (keys:false skips
    // `this.on('keypress', this._onKeypress)` entirely, so Textbox's own
    // self-editing insertChar()/deleteChar() path is never wired up at
    // all, no matter how the box gets focused — keyboard activation,
    // focusNext()/Tab-cycling, or a mouse click all leave it inert) and
    // :63-68 (inputOnFocus:false skips the readInput() emit on focus).
    // RepoView's filterKeypress (below) is the ONLY thing that ever writes
    // to this box, via setValue() — a single source of truth instead of
    // two editors racing. Round 1-3 patched that race at the manual-path
    // level (activation timing, Tab's handled signal); this is the actual
    // root cause: Textbox is a self-editing widget by default, and nothing
    // before this depended on catching every path that could focus it —
    // keys:false removes the capability structurally instead.
    this.filterBox = new Textbox({ parent: this.filterPanel, top: 0,
      left: barBorders ? 1 : 0, width: barBorders ? '100%-2' : '100%',
      height: 1, mouse: true, keys: false, inputOnFocus: false,
      style: { fg: T.ink, focus:{ fg: T.warn } } } as any);
    (this.filterPanel as any).hide();

    this.listPanel = new Panel({ parent: screen, ...listGeom,
      ...frame,
      tags: true, style: { border:{ fg: T.accent } }, focusable: false } as any);

    this.doorList = new List({ parent: this.listPanel, ...inset,
      keys: true, vi: false, mouse: true, scrollable: true,
      alwaysScroll: true, tags: true, wrapItems: false,
      scrollbar: true,
      style: { selected:{ bg: T.bar, fg: T.ink }, item:{ fg: T.ink } } } as any);

    this.infoPanel = new Panel({ parent: screen, ...infoGeom,
      ...frame,
      tags: true, style: { border:{ fg: T.accentAlt } }, focusable: false } as any);

    this.infoBox = new ScrollableBox({ parent: this.infoPanel, ...inset,
      tags: true, scrollable: true, keys: true,
      style: { fg: T.ink } } as any);

    // Disable type-ahead on doorList (re-add keypress without the type-ahead block)
    const _nav = (this.doorList as any)._onKeypress?.bind(this.doorList);
    (this.doorList as any).removeAllListeners('keypress');
    if (_nav) {
      (this.doorList as any).on('keypress', (ch: string, key: any) => {
        if (ch?.length === 1 && /[a-zA-Z0-9/ ]/.test(ch)) return;
        if (key?.name === 'escape' || ch === '\x1b') return;
        return _nav(ch, key);
      });
    }

    this.setHeader(`{center}{${T.accent}-fg}DOORMAN v2{/${T.accent}-fg}  {${T.ink}-fg}Node ${nodeId}{/${T.ink}-fg}{/center}`);
  }

  setHeader(content: string): void { (this.header as any).setContent(content); }
  setFooter(content: string): void { (this.footer as any).setContent(content); }
  setListLabel(label: string): void { (this.listPanel as any).setLabel(label); }
  setListItems(items: string[]): void { (this.doorList as any).setItems(items); }
  setListSelect(idx: number): void { (this.doorList as any).select(idx); }
  get listSelected(): number { return (this.doorList as any).selected ?? 0; }
  setInfo(content: string): void { (this.infoBox as any).setContent(content); }
  focusList(): void { (this.doorList as any).focus(); }
  focusFilter(): void { (this.filterBox as any).focus(); }

  showRepoLayout(): void {
    (this.filterPanel as any).show();
    (this.listPanel as any).top = this.narrow ? 2 : 6;
    (this.listPanel as any).height = this.narrow ? '50%-2' : '100%-9';
  }
  showInstalledLayout(): void {
    (this.filterPanel as any).hide();
    (this.listPanel as any).top = this.narrow ? 1 : 3;
    (this.listPanel as any).height = this.narrow ? '50%-1' : '100%-6';
  }

  /**
   * One installed-door row: badge, name, enabled flag, size.
   *
   * Here rather than inline in the view because `width` is a layout rule -
   * the row has to be sized by whatever decided the list's text column, and
   * a copy of this arithmetic anywhere else is a copy that can drift from it.
   */
  installedRow(d: InstalledRowDoor): string {
    const badge = `[${typeBadge(d.type)}]`;
    const sz = formatSize(d.size).padStart(6);
    const acc = accessCell(d.accessLevel);
    // badge(4) + space + name + space + status(1) + space + size(6) + space + access(3)
    const nameW = Math.max(6, this.width - 18);
    const name = d.name.length > nameW ? d.name.slice(0, nameW - 1) + '…' : d.name.padEnd(nameW);
    const st = d.enabled ? `{${T.ok}-fg}*{/${T.ok}-fg}` : `{${T.alert}-fg}-{/${T.alert}-fg}`;
    return `${badge} ${name} ${st} ${sz} ${acc}`;
  }

  render(): void { this.screen.render(); }
}
