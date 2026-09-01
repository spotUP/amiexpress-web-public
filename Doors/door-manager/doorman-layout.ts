/**
 * DOORMAN's screen furniture - the header, footer, list, info and filter
 * panels every view draws into, and the animated masthead on the header's
 * first row.
 *
 * Split out of app.ts when it reached the 2000-line ceiling, the same way
 * install-core.ts was. Nothing here imports app.ts, so the views can import
 * the layout without a cycle.
 */

import {
  Panel, Box, List, ScrollableBox, Textbox,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { attachMasthead } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { T, S, CURRENT } from './door-theme';

export class DoormanLayout {
  screen: any;
  header: any; footer: any;
  listPanel: any; doorList: any;
  infoPanel: any; infoBox: any;
  filterPanel: any; filterBox: any;
  /** Stops the masthead animation; called when the door tears down. */
  stopMasthead: (() => void) | null = null;
  readonly width: number;

  constructor(screen: any, nodeId: string | number) {
    this.screen = screen;
    this.width = Math.floor((screen as any).width * 0.35) - 8;

    this.header = new Panel({ parent: screen, top: 0, left: 0, width: '100%', height: 3,
      tags: true, style: { fg: T.ink, bg: T.bar, border:{ fg: T.accentAlt } }, focusable: false } as any);

    // The animated slash rail, on the header's first row. A child keeps it
    // out of the outer geometry - nothing below moves, and a theme with no
    // rail (classic) gets the plain title it always had.
    const mastheadRow = new Box({ parent: this.header, top: 0, left: 0, width: '100%-2',
      height: 1, tags: true, content: '', focusable: false,
      style: S.bar.style } as any);
    this.stopMasthead = attachMasthead(mastheadRow as any, CURRENT, {
      title: 'DOORMAN',
      // One column short: writing a row's last cell leaves the terminal in
      // a pending-wrap state and clips the final character.
      width: Math.max(1, ((screen as any).width || 80) - 3),
      rail: S.accent,
      ink: S.ink,
      render: () => screen.render(),
    });

    this.footer = new Panel({ parent: screen, bottom: 0, left: 0, width: '100%', height: 3,
      tags: true, style: { fg: T.ink, bg: T.bar, border:{ fg: T.accentAlt } }, focusable: false } as any);

    this.filterPanel = new Panel({ parent: screen, top: 3, left: 0, width: '35%', height: 3,
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
    this.filterBox = new Textbox({ parent: this.filterPanel, top: 0, left: 1, width: '100%-2',
      height: 1, mouse: true, keys: false, inputOnFocus: false,
      style: { fg: T.ink, focus:{ fg: T.warn } } } as any);
    (this.filterPanel as any).hide();

    this.listPanel = new Panel({ parent: screen, top: 3, left: 0, width: '35%', height: '100%-6',
      tags: true, style: { border:{ fg: T.accent } }, focusable: false } as any);

    this.doorList = new List({ parent: this.listPanel, top: 1, left: 1, width: '100%-2',
      height: '100%-2', keys: true, vi: false, mouse: true, scrollable: true,
      alwaysScroll: true, tags: true, wrapItems: false,
      scrollbar: { ch:' ', style:{ bg: T.bar } },
      style: { selected:{ bg: T.bar, fg: T.ink }, item:{ fg: T.ink } } } as any);

    this.infoPanel = new Panel({ parent: screen, top: 3, left: '35%', width: '65%',
      height: '100%-6', tags: true, style: { border:{ fg: T.accentAlt } }, focusable: false } as any);

    this.infoBox = new ScrollableBox({ parent: this.infoPanel, top: 1, left: 1,
      width: '100%-2', height: '100%-2', tags: true, scrollable: true, keys: true,
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
    (this.listPanel as any).top = 6;
    (this.listPanel as any).height = '100%-9';
  }
  showInstalledLayout(): void {
    (this.filterPanel as any).hide();
    (this.listPanel as any).top = 3;
    (this.listPanel as any).height = '100%-6';
  }

  render(): void { this.screen.render(); }
}
