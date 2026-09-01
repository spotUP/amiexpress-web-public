/**
 * makePanel - the one place every sprite-studio content pane becomes a
 * DockablePanel, so the eight panes (browser: doors/sprites/animations/
 * preview; edit: canvas/preview/frames) share identical drag/
 * resize/minimize/persistence behaviour instead of eight hand-tuned
 * option blocks drifting apart.
 *
 * Mirrors livechat's worked DockablePanel example (ui/chat-log.ts): the
 * panel supplies the border and title bar; the caller's own widget
 * (list/box) becomes its content child, parented to the panel instead of
 * the screen. The content child is sized in INTEGER rows/cols (rect minus
 * the panel's own 1-cell border on every side), never a percent string -
 * layout.ts's whole point (see its doc comment) is that no pane geometry
 * in this door is resolved through a percent/round step any more, and
 * app-shape.test.ts / edit-screen-shape.test.ts assert zero percent-
 * geometry strings survive in either screen file.
 *
 * Persistence: DockablePanel.saveState/loadState both early-return when
 * `screen.storage` is absent (dockable-panel.ts:2593,2602). This door's
 * screen (built through blessed-helpers' createScreen, same as every
 * other blessed door here) never sets a `storage` property - grepped
 * across the SDK's Screen class and every screen-construction site
 * (including livechat's, the reference implementation) and none exists.
 * So persistence silently no-ops for every panel below; drag/resize/dock/
 * minimize still work in-session, they just do not survive a reload. That
 * degradation is the accepted case for this task (see task-3-report.md).
 */
import { DockablePanel, Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { MENU_HEIGHT } from './menu';
import type { Rect } from './layout';

export interface MakePanelOptions {
  /** Stable id for this pane; becomes the persistence key 'sprited:' + key. */
  key: string;
  /** Panel title, shown in its title bar. */
  title: string;
  /** The pane's geometry, from layout.ts's LAYOUT. */
  rect: Rect;
}

export function makePanel(screen: Screen, opts: MakePanelOptions): DockablePanel {
  const { key, title, rect } = opts;
  return new DockablePanel({
    parent: screen,
    title,
    label: title,
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    useTitleBar: true,
    draggable: true,
    resizable: true,
    allowMinimize: true,
    topConstraint: MENU_HEIGHT,
    bottomConstraint: 1,
    persistenceKey: 'sprited:' + key,
    fitContent: false,
  });
}

/**
 * The geometry a pane's CONTENT CHILD must use inside its panel - an
 * integer rect (never a percent string - see the module doc comment)
 * RELATIVE to the panel, spanning its inner area (border excluded, which
 * `calcPos` already does for a '100%'-style child - see element.ts's
 * `_getCoords`) MINUS the title bar's own row.
 *
 * Fix round 1, Important 2: every panel here sets `useTitleBar: true`,
 * and DockablePanel's title bar is a Box at relative top:0 INSIDE that
 * border-excluded area, reordered to render LAST by bringUIToFront() -
 * so it draws OVER whatever content sits at that same row
 * (dockable-panel.ts's constructor/append()). A content child placed at
 * top:0 (this task's original approach) had its own row 0 permanently
 * hidden - on the browser's lists, that is the first (often selected)
 * item, gone from the very first frame. top:1 skips exactly that one row:
 * traced against element.ts's `_getCoords` (parentContentYi offset, then
 * the child's own relative top/height), a panel of rect.height H has
 * H-2 inner rows (border), of which the title bar claims row 0 and this
 * function's H-3 remaining rows exactly fill rows 1..H-3 - no covered
 * row, no wasted blank row either.
 */
export function panelContentRect(rect: Rect): Rect {
  return {
    top: 1,
    left: 0,
    width: rect.width - 2,
    height: rect.height - 3,
  };
}

/**
 * View -> Reset Layout: restores one panel to its LAYOUT rect and to the
 * floating (undocked), un-minimized state every panel starts in.
 *
 * Fix round 1, Important 1: this must NOT be a single setState() call.
 * setState() (dockable-panel.ts:2503-2567) applies position/size FIRST,
 * and only THEN - if `minimized` is present - calls minimize()/maximize()
 * (:2559-2565). maximize() (:2381-2405) restores position.left/top/width/
 * height from panelState.savedX/savedY/savedWidth/savedHeight - the
 * geometry captured when minimize() ran (:2344-2348) - unconditionally
 * overwriting whatever geometry setState just applied. So
 * `setState({...rect, minimized:false})` in one call would, for a
 * MINIMIZED panel, apply the LAYOUT rect and then immediately clobber it
 * with the pre-minimize geometry.
 *
 * Fixed by splitting into two sequential calls. setState() has no
 * internal `await` (verified by reading its full body), so despite being
 * declared `async` its whole call runs synchronously to completion before
 * returning - two un-awaited calls in a row are not a race, the first
 * finishes before the second's body starts:
 *   1. `{ minimized: false }` alone - un-minimizes if needed (maximize()
 *      early-returns as a no-op at :2382 if the panel was not minimized,
 *      so this is always safe to call) and unhides the panel's children
 *      (maximize()'s `child.show()` loop, :2385-2387) - necessary on its
 *      own regardless of the geometry bug, or Reset Layout would leave a
 *      visually-empty minimized panel in the right position.
 *   2. `{ position: 'float', x, y, width, height }` - no `minimized` key,
 *      so setState's minimize/maximize branch is skipped entirely
 *      (:2559's `if (state.minimized !== undefined)` is false) and the
 *      LAYOUT rect from step 1's now-clean (non-minimized) state stands.
 */
export function resetPanelLayout(panel: DockablePanel, rect: Rect): void {
  void panel.setState({ minimized: false });
  void panel.setState({
    position: 'float',
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  });
}
