/**
 * Menu bar component - dropdown menus
 * Uses SDK MenuBar widget (Moebius-style)
 */
import {
  Screen, MenuBar as SDKMenuBar, MenuBarItem, Box,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { S } from '../door-theme';

export const MENU_HEIGHT = 1;

/**
 * The headline beside the rail. Full words: this is a label, not a code.
 */
export const MASTHEAD_TITLE = 'LIVE CHAT';

export interface MenuBarHandlers {
  onHelp?: () => void;
  onList?: () => void;
  onChTab?: () => void;
  onJoinChannel?: () => void;
  onLeaveChannel?: () => void;
  onEmoji?: () => void;
  onFiles?: () => void;
  onPins?: () => void;
  onSearch?: () => void;
  onThreads?: () => void;
  onSettings?: () => void;
  onTheme?: () => void;
  onRenderMode?: () => void;
  onToggleView?: () => void;     // fullscreen <-> grid
  onToggleSidebar?: () => void;
  onClearChat?: () => void;
  onAbout?: () => void;
  onShortcuts?: () => void;
  onQuit?: () => void;
}

export interface MenuBar {
  element: SDKMenuBar;
  setHandlers: (handlers: MenuBarHandlers) => void;
  /**
   * The run of the bar the menus leave, for the theme's masthead.
   *
   * Row 0 is this bar and every row under it is a panel, so the door has no
   * spare row to give a masthead - the same constraint CARD LOBBY has, and
   * the same answer: the bar's own row, from the column after the last
   * label to the right edge.
   */
  mastheadRow: Box;
  /** Size the run to the LIVE screen; returns whether a masthead fits. */
  layoutMasthead: () => boolean;
  /** Columns the run may use, from the last layoutMasthead(). */
  mastheadWidth: () => number;
}

/**
 * The column after the last menu label.
 *
 * Derived from the same items the bar is built from, and by the same
 * arithmetic the SDK widget uses (`  label  ` plus one column of spacing),
 * so the masthead cannot drift onto the menus when a label is renamed.
 */
export function menusEndColumn(): number {
  return buildMenuItems().reduce((left, item) => left + ` ${item.label} `.length + 1, 0);
}

// Handlers storage (set dynamically)
let globalHandlers: MenuBarHandlers = {};

const buildMenuItems = (): MenuBarItem[] => ([
  {
    label: 'Chat v3.2.0',
    items: [
      { label: 'Help (F1)', action: () => globalHandlers.onHelp?.() },
      { label: 'Channel List (F2)', action: () => globalHandlers.onList?.() },
      { label: 'Next Channel (F3)', action: () => globalHandlers.onChTab?.() },
      { label: 'Join Channel...', action: () => globalHandlers.onJoinChannel?.() },
      { label: 'Leave Channel', action: () => globalHandlers.onLeaveChannel?.() },
    ],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Emoji (F4)', action: () => globalHandlers.onEmoji?.() },
      { label: 'Files (F6)', action: () => globalHandlers.onFiles?.() },
      { label: 'Pins (F7)', action: () => globalHandlers.onPins?.() },
      { label: 'Search (Ctrl+F)', action: () => globalHandlers.onSearch?.() },
      { label: 'Threads', action: () => globalHandlers.onThreads?.() },
    ],
  },
  {
    label: 'View',
    items: [
      { label: 'Settings (Ctrl+S)', action: () => globalHandlers.onSettings?.() },
      { label: 'Theme', action: () => globalHandlers.onTheme?.() },
      { label: 'Cycle Render Mode (r)', action: () => globalHandlers.onRenderMode?.() },
      { label: 'Fullscreen / Grid', action: () => globalHandlers.onToggleView?.() },
      { label: 'Toggle Sidebar', action: () => globalHandlers.onToggleSidebar?.() },
      { label: 'Clear Chat', action: () => globalHandlers.onClearChat?.() },
    ],
  },
  {
    label: 'Help',
    items: [
      { label: 'About', action: () => globalHandlers.onAbout?.() },
      { label: 'Keyboard Shortcuts', action: () => globalHandlers.onShortcuts?.() },
      { label: 'Quit (Ctrl+Q)', action: () => globalHandlers.onQuit?.() },
    ],
  },
]);

export function createMenuBar(screen: Screen): MenuBar {
  const menuBar = new SDKMenuBar({
    screen,
    items: buildMenuItems(),
  });

  const left = menusEndColumn();

  /**
   * The masthead's own box, INSIDE the bar and to the right of the menus.
   *
   * A child rather than the bar's content: painting the rail as the bar's
   * own content would put an animated slash in each one-column gap BETWEEN
   * the menu labels, which reads as damage rather than as branding. It
   * survives setHandlers(), because MenuBar.setItems() destroys only the
   * buttons and the dropdowns.
   */
  const mastheadRow = new Box({
    parent: menuBar as never,
    top: 0,
    left,
    width: `100%-${left}`,
    height: 1,
    // Explicitly none: Panel takes a line border when the caller names no
    // border key at all, and a one-row framed box has no interior.
    border: undefined,
    tags: true,
    content: '',
    fixed: true,
    focusable: false,
    clickable: false,
    mouse: false,
  } as never) as Box;

  let mastheadWidth = 1;

  /**
   * Size the run to the LIVE screen, and say whether a masthead fits.
   *
   * What the menus leave is what there is: on a 40-column C64 four labels
   * leave a handful of columns, which is not a masthead but a clipped word.
   * There the row is hidden and the bar keeps the theme's mark, still, at
   * the right end - so a C64 caller still sees the branding.
   */
  const layoutMasthead = (): boolean => {
    const width = ((screen as { width?: number }).width) || 80;
    const room = width - left;
    // The title, plus enough rail beside it to read as a rail.
    const fits = room >= MASTHEAD_TITLE.length + 6;

    (mastheadRow as unknown as { width: string }).width = `100%-${left}`;
    if (fits) mastheadRow.show(); else mastheadRow.hide();

    // One short of the run's last cell: writing a row's final cell leaves
    // the terminal in a pending-wrap state and the last glyph is clipped.
    mastheadWidth = Math.max(1, room - 1);

    // `{|}` is blessed's right-align; the menu buttons draw over the left
    // end, which is why the mark sits at the other one.
    menuBar.setContent(!fits && S.rail ? `{|}${S.rail} ` : '');
    return fits;
  };

  layoutMasthead();

  return {
    element: menuBar,
    mastheadRow,
    layoutMasthead,
    mastheadWidth: () => mastheadWidth,
    setHandlers: (handlers: MenuBarHandlers) => {
      globalHandlers = handlers;
      // Update menu items with new handlers
      menuBar.setItems(buildMenuItems());
      // The buttons were rebuilt; the run they leave has not moved, but the
      // bar's content was not touched by setItems, so the mark is repainted
      // from the one place that decides it.
      layoutMasthead();
    },
  };
}
