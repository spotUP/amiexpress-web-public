/**
 * Card Lobby - UI Manager
 * Handles all UI building, layout, and rendering operations
 */

import blessed, { Screen, Box, List, Button, Log, Listbar, ScrollableText, DropdownMenu, ListTable, Overlay, StatusBar } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList, createButton, createText, createLog, ansiToTags } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { CardEngine, pokerCardsToCards } from '@amiexpress/bbs-door-sdk';
import type { UnoColor as EngineUnoColor, UnoValue as EngineUnoValue } from '@amiexpress/bbs-door-sdk';
import { UI_THEME, ACTION_BUTTON_STYLES, ACTION_BUTTON_ORDER, type ActionButtonKey } from '../lib/constants';
import { renderCardLines, stripBlessedTags, wrapTagged } from '../lib/utils';
import { resolveCardStyle, toRenderOptions, FULL_CARD_ROWS } from '../lib/card-style';
import type { CardPreferences } from '../lib/types';
import type { UnoCard, UnoColor, UnoPlayer } from '../lib/uno-engine';

const cardEngine = new CardEngine();

export interface LayoutMetrics {
  width: number;
  height: number;
  topOffset: number;
  statusHeight: number;
  logHeight: number;
  mainHeight: number;
  tableHeight: number;
  leftWidth: number;
  rightWidth: number;
}

export class UIManager {
  private screen: Screen;
  private desktop: Box;
  public topBar!: Box;
  public topInfoBar!: Box;
  public statusBar!: StatusBar;
  public lobbyWindow!: Box;
  public tableWindow!: Box;
  public lobbyList!: ListTable;
  public lobbyActions!: Listbar;
  public tableContent!: ScrollableText;
  public tableActions!: Box;
  public actionButtons!: Record<ActionButtonKey, Button>;
  public logWindow!: Log;
  public flopPanel!: Box;
  public flopContent!: Box;
  public playersPanel!: Box;
  public playersContent!: ScrollableText;
  public handPanel!: Box;
  public handContent!: Box;
  public activityPanel!: Box;
  public activityContent!: Log;
  /** The player's card preferences, set by the door when a profile loads. */
  public cardPreferences: CardPreferences | undefined;
  /** Whether this session's terminal can draw unicode card faces. */
  public unicodeCapable = false;
  /** Lines above the log (UNO context) and the door's own lines below it. */
  private activityHeader: string[] = [];
  private activityBody: string[] = [];
  public overlayShade!: Box;
  public layout!: LayoutMetrics;
  private dealAnimationInProgress = false;
  private menuButtons: Box[] = [];
  private menus: DropdownMenu[] = [];

  constructor(screen: Screen, desktop: Box) {
    this.screen = screen;
    this.desktop = desktop;
  }

  getDealAnimationInProgress(): boolean {
    return this.dealAnimationInProgress;
  }

  buildTopBar(callbacks: {
    focusLobby: () => void;
    focusTable: () => void;
    showProfileWindow: () => void;
    showLeaderboardWindow: () => void;
    showAchievementsWindow: () => void;
    showBulletinsWindow: () => void;
    showCardStyleWindow: () => void;
    showThemeWindow: () => void;
    exitDoor: () => void;
    runAction: (action: () => void | Promise<void>) => void;
  }): void {
    const { focusLobby, focusTable, showProfileWindow, showLeaderboardWindow, showAchievementsWindow, showBulletinsWindow, showCardStyleWindow, showThemeWindow, exitDoor, runAction } = callbacks;

    this.topBar = createBox({
      // Panel adds a line border unless the key is present; these are
      // bars and content areas, and the window around them carries the frame.
      border: undefined,
      parent: this.desktop,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      fixed: true,
      hidden: false,
      focusable: false,
      mouse: false,
      clickable: false,
      tags: true,
      style: { fg: UI_THEME.topBar.fg, bg: UI_THEME.topBar.bg },
      // The theme's mark, right-aligned behind the menu items. `{|}` is
      // blessed's right-align; the dropdown menus draw over the left end.
      content: UI_THEME.rail ? `{|}${UI_THEME.rail} ` : '',
    });

    this.topInfoBar = createBox({
      // Panel adds a line border unless the key is present; these are
      // bars and content areas, and the window around them carries the frame.
      border: undefined,
      parent: this.desktop,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      hidden: true,
      focusable: false,
      mouse: false,
      clickable: false,
      style: { fg: UI_THEME.topBar.fg, bg: UI_THEME.topBar.bg },
      content: ' Card Lobby v2.0.2-SDK ',
    });

    // Two menus that held one entry each are folded into Views: a menu bar
    // is for choosing what to look at, and "Lobby > Focus Lobby" said the
    // same word twice to say it (2026-09-02).
    const menuDefs = [
      {
        label: 'Views',
        items: [
          { label: 'Lobby', action: () => runAction(focusLobby) },
          { label: 'Table', action: () => runAction(focusTable) },
          { label: 'Profile', action: () => runAction(showProfileWindow) },
          { label: 'Leaders', action: () => runAction(showLeaderboardWindow) },
          { label: 'Achievements', action: () => runAction(showAchievementsWindow) },
          { label: 'Bulletins', action: () => runAction(showBulletinsWindow) },
          { label: 'Card Style', action: () => runAction(showCardStyleWindow) },
          { label: 'Theme', action: () => runAction(showThemeWindow) },
        ],
      },
      {
        label: 'System',
        items: [
          { label: 'Quit', action: () => runAction(exitDoor) },
        ],
      },
    ];

    this.menuButtons = [];
    this.menus = [];

    menuDefs.forEach((menu) => {
      this.menus.push(new DropdownMenu({ parent: this.screen, label: menu.label, items: menu.items }));
    });

    const openMenu = (index: number) => {
      this.menus.forEach((menu, i) => {
        if (i !== index) menu.close();
      });
      this.menus[index].openFor(this.menuButtons[index]);
    };

    let left = 1;
    menuDefs.forEach((menu, index) => {
      const button = createBox({
      // Panel adds a line border unless the key is present; these are
      // bars and content areas, and the window around them carries the frame.
      border: undefined,
        parent: this.topBar,
        top: 0,
        left,
        width: menu.label.length + 2,
        height: 1,
        content: `{bold}${menu.label}{/bold}`,
        style: { fg: UI_THEME.topBar.fg, bg: UI_THEME.topBar.bg, focus: { fg: UI_THEME.highlightInk, bg: UI_THEME.accent } },
        mouse: true,
        keys: true,
        clickable: true,
        fixed: true,
      });

      button.on('click', () => openMenu(index));
      button.key(['enter', 'space', 'down'], () => openMenu(index));

      this.menus[index].on('tab-next', () => openMenu((index + 1) % this.menus.length));
      this.menus[index].on('tab-prev', () => openMenu((index - 1 + this.menus.length) % this.menus.length));

      this.menuButtons.push(button);
      left += menu.label.length + 3;
    });
  }

  /**
   * The footer: who you are, what you have, where you are, and the last
   * thing that happened.
   *
   * The SDK's StatusBar, not a Box the door writes a joined string into. It
   * owns the sections and the separator, so a caller sets the part that
   * changed instead of rebuilding the line - and it is the widget every
   * other door's footer already is.
   */
  buildStatusBar(): void {
    this.statusBar = new StatusBar({
      parent: this.desktop,
      position: 'bottom',
      separator: ' | ',
      fg: UI_THEME.statusBar.fg,
      bg: UI_THEME.statusBar.bg,
      sections: [
        { id: 'user', content: 'Loading Card Lobby...' },
        { id: 'chips', content: '' },
        { id: 'where', content: '' },
        { id: 'notice', content: '' },
      ],
    }) as any;
  }

  buildWindows(callbacks: {
    onLobbySelect: (index: number) => void;
    createTableFlow: () => void | Promise<void>;
    joinSelectedTable: () => void | Promise<void>;
    observeSelectedTable: () => void | Promise<void>;
    toggleFilters: () => void;
    manualRefresh: () => void;
    runAction: (action: () => void | Promise<void>) => void;
  }): void {
    const { onLobbySelect, createTableFlow, joinSelectedTable, observeSelectedTable, toggleFilters, manualRefresh, runAction } = callbacks;

    this.computeLayout();
    const { topOffset, statusHeight, logHeight, mainHeight, leftWidth, rightWidth } = this.layout;

    // Lobby window - left side
    this.lobbyWindow = createBox({
      parent: this.desktop,
      top: topOffset,
      left: 0,
      width: leftWidth,
      height: mainHeight,
      label: ' Lobby ',
      border: { type: 'line' },
      focusable: false,
      mouse: false,
      clickable: false,
      style: { border: UI_THEME.windowBorder, bg: UI_THEME.windowBg },
    });

    // Table window - right side (shares border with lobby at leftWidth-1)
    this.tableWindow = createBox({
      parent: this.desktop,
      top: topOffset,
      left: leftWidth - 1,  // Share border with lobby window
      width: rightWidth,
      height: mainHeight,
      border: { type: 'line' },
      label: ' Table ',
      focusable: false,
      mouse: false,
      clickable: false,
      style: { border: UI_THEME.windowBorder, bg: UI_THEME.windowBg },
    });


    // Help text at top
    const helpBar = createBox({
      // Panel adds a line border unless the key is present; these are
      // bars and content areas, and the window around them carries the frame.
      border: undefined,
      parent: this.lobbyWindow,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      focusable: false,
      mouse: false,
      clickable: false,
      style: { fg: UI_THEME.accent, bg: UI_THEME.topBar.bg },
      content: ' ENTER:Join  O:Observe  C:Create ',
    });

    // Use SDK ListTable for clean table display
    this.lobbyList = new ListTable({
      parent: this.lobbyWindow,
      top: 1,
      left: 0,
      width: '100%-2',
      height: '100%-3',
      headers: ['ID', 'Game', 'Stakes', 'Players', 'Status'],
      rows: [],
      interactive: true,
      keys: true,   // Enable keyboard navigation
      vi: true,     // Enable vi-style arrow key navigation
      mouse: true,  // Enable mouse clicks
      style: {
        fg: UI_THEME.ink,
        selected: { fg: UI_THEME.highlightInk, bg: UI_THEME.highlightBg },
        header: { fg: UI_THEME.accent, bold: true },
      } as any,
      scrollbar: {
        ch: '|',
        track: { ch: '|', bg: UI_THEME.windowBg },
        style: { fg: UI_THEME.accent },
      } as any,
    }) as any;

    // The highlight moving is not a decision: it keeps the Table panel
    // showing whatever row the cursor is on.
    this.lobbyList.on('select item', (_: any, index: number) => {
      onLobbySelect(index);
    });

    // ENTER (or a click) IS the decision. It used to be the J key, which is
    // also this widget's vi-style "down", so the cursor moved and nothing
    // joined ("the selected row moves down when i press j to join it doesnt
    // join", 2026-09-02).
    this.lobbyList.on('select', (_: any, index: number) => {
      onLobbySelect(index);
      runAction(() => joinSelectedTable());
    });

    // Action bar at bottom with clearer instructions
    this.lobbyActions = createBox({
      // Panel adds a line border unless the key is present; these are
      // bars and content areas, and the window around them carries the frame.
      border: undefined,
      parent: this.lobbyWindow,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      focusable: false,
      mouse: false,
      clickable: false,
      style: { fg: UI_THEME.highlightInk, bg: UI_THEME.accent },
      content: ' F:Filter R:Refresh Q:Quit ',
    }) as any;

    // Use SDK box instead of blessed.scrollabletext
    this.tableContent = createBox({
      // Panel adds a line border unless the key is present; these are
      // bars and content areas, and the window around them carries the frame.
      border: undefined,
      parent: this.tableWindow,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      // Tab reaches this panel so a long table can be scrolled; it was
      // focusable: false, which is why Tab appeared to do nothing.
      focusable: true,
      mouse: true,
      clickable: false,
      style: { fg: UI_THEME.ink },
      content: 'Select a table to view details.',
    }) as any;

    this.tableActions = createBox({
      // Panel adds a line border unless the key is present; these are
      // bars and content areas, and the window around them carries the frame.
      border: undefined,
      parent: this.tableWindow,
      top: 0,
      left: 1,
      right: 1,
      height: 1,
      focusable: false,
      mouse: false,
      clickable: false,
      style: { fg: UI_THEME.ink, bg: UI_THEME.windowBg },
      hidden: true,
    });

    this.actionButtons = {
      fold: createButton({
        parent: this.tableActions,
        mouse: true,
        keys: true,
        height: 1,
        top: 0,
        left: 0,
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        content: 'FOLD',
      }),
      check: createButton({
        parent: this.tableActions,
        mouse: true,
        keys: true,
        height: 1,
        top: 0,
        left: 0,
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        content: 'CHECK',
      }),
      call: createButton({
        parent: this.tableActions,
        mouse: true,
        keys: true,
        height: 1,
        top: 0,
        left: 0,
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        content: 'CALL',
      }),
      raise: createButton({
        parent: this.tableActions,
        mouse: true,
        keys: true,
        height: 1,
        top: 0,
        left: 0,
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        content: 'RAISE',
      }),
      quit: createButton({
        parent: this.tableActions,
        mouse: true,
        keys: true,
        height: 1,
        top: 0,
        left: 0,
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        content: 'QUIT',
      }),
    };

    this.registerActionButtonEvents();
    this.logWindow = createLog({
      parent: this.desktop,
      bottom: statusHeight,
      left: 0,
      width: '100%',
      height: logHeight,
      border: { type: 'line', labelStyle: { fg: UI_THEME.accent } },
      label: ' Activity ',
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      style: { fg: UI_THEME.ink, border: UI_THEME.windowBorder, bg: UI_THEME.windowBg },
      scrollbar: {
        ch: '|',
        track: { ch: '|', bg: UI_THEME.windowBg },
        style: { fg: UI_THEME.accent, bg: UI_THEME.accent },
      } as any,
    });

    this.buildTablePanels();
  }

  /**
   * The window geometry, from the screen's CURRENT size.
   *
   * Two windows carry absolute numbers - the lobby's width and both windows'
   * height - so they cannot follow a resize the way the percentage-sized
   * widgets do. This is the one place those numbers are worked out, for the
   * first paint and for every resize after it.
   */
  private computeLayout(): void {
    const height = (this.screen.height as number) || 24;
    const width = (this.screen.width as number) || 80;
    const topOffset = 1;  // Space for top bar
    const statusHeight = 1;  // Bottom status bar
    const logHeight = 4;  // Activity log height
    const mainHeight = height - topOffset - statusHeight - logHeight;

    // Split: 30% lobby, 70% table (share border at junction)
    const leftWidth = Math.max(25, Math.floor(width * 0.30));
    const rightWidth = width - leftWidth + 1;  // +1 to share border with lobby

    this.layout = {
      width,
      height,
      topOffset,
      statusHeight,
      logHeight,
      mainHeight,
      // The table view hides the activity log, so those rows are the table's:
      // without this the four panels were sized for a band that is not on
      // screen, and a seven-card hand had six rows to be drawn in.
      tableHeight: mainHeight + logHeight,
      leftWidth,
      rightWidth,
    };
  }

  /**
   * Follow a terminal resize.
   *
   * Alt+Enter asks the caller's terminal to grow (sdk/utils/terminal-mode.ts)
   * and the bottom-docked widgets move on their own, but the lobby and table
   * windows kept the size they were built with - so a wide terminal showed an
   * 80-column door in its top-left corner (2026-09-02).
   */
  relayout(): void {
    this.computeLayout();
    const { topOffset, mainHeight, leftWidth, rightWidth } = this.layout;

    if (this.lobbyWindow) {
      this.lobbyWindow.top = topOffset;
      this.lobbyWindow.left = 0;
      this.lobbyWindow.width = leftWidth;
      this.lobbyWindow.height = mainHeight;
    }

    if (this.tableWindow) {
      this.tableWindow.top = topOffset;
      this.tableWindow.left = leftWidth - 1;
      this.tableWindow.width = rightWidth;
      this.tableWindow.height = mainHeight;
    }

    this.layoutTablePanels();
    this.layoutActionButtons();
  }

  buildTablePanels(): void {
    const panelStyle = { border: UI_THEME.windowBorder, bg: UI_THEME.windowBg };
    const contentStyle = { fg: UI_THEME.ink, bg: UI_THEME.windowBg };
    const scrollbarStyle = { fg: UI_THEME.accent, bg: UI_THEME.accent };

    this.flopPanel = createBox({
      parent: this.tableWindow,
      top: 1,
      left: 1,
      width: 10,
      height: 6,
      label: ' FLOP ',
      tags: true,
      hidden: true,
      focusable: false,
      mouse: false,
      clickable: false,
      border: { type: 'line', labelStyle: { fg: UI_THEME.accent } },
      style: panelStyle,
    });

    this.flopContent = createBox({
      // Panel adds a line border unless the key is present; these are
      // bars and content areas, and the window around them carries the frame.
      border: undefined,
      parent: this.flopPanel,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
      style: contentStyle,
      content: '',
    });

    this.playersPanel = createBox({
      parent: this.tableWindow,
      top: 1,
      left: 1,
      width: 10,
      height: 6,
      label: ' PLAYERS ',
      tags: true,
      hidden: true,
      focusable: false,
      mouse: false,
      clickable: false,
      border: { type: 'line', labelStyle: { fg: UI_THEME.accent } },
      style: panelStyle,
    });

    this.playersContent = blessed.scrollabletext({
      parent: this.playersPanel,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      style: contentStyle,
      scrollbar: {
        ch: '|',
        track: { ch: '|', bg: UI_THEME.windowBg },
        style: scrollbarStyle,
      } as any,
      content: '',
    });

    this.handPanel = createBox({
      parent: this.tableWindow,
      top: 1,
      left: 1,
      width: 10,
      height: 6,
      label: ' YOUR HAND ',
      tags: true,
      hidden: true,
      focusable: false,
      mouse: false,
      clickable: false,
      border: { type: 'line', labelStyle: { fg: UI_THEME.accent } },
      style: panelStyle,
    });

    this.handContent = createBox({
      // Panel adds a line border unless the key is present; these are
      // bars and content areas, and the window around them carries the frame.
      border: undefined,
      parent: this.handPanel,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
      style: contentStyle,
      content: '',
    });

    this.activityPanel = createBox({
      parent: this.tableWindow,
      top: 1,
      left: 1,
      width: 10,
      height: 6,
      label: ' ACTIVITY ',
      tags: true,
      hidden: true,
      focusable: false,
      mouse: false,
      clickable: false,
      border: { type: 'line', labelStyle: { fg: UI_THEME.accent } },
      style: panelStyle,
    });

    this.activityContent = createLog({
      parent: this.activityPanel,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      wrap: true,
      scrollOnInput: false,
      scrollback: 200,
      style: contentStyle,
      scrollbar: {
        ch: '|',
        track: { ch: '|', bg: UI_THEME.windowBg },
        style: scrollbarStyle,
      } as any,
      content: '',
    });

    this.layoutTablePanels();
  }

  /** Rows a widget has inside its own borders, for sizing what goes in it. */
  private panelRows(widget: unknown): number {
    const box = widget as { height?: unknown; _getCoords?: () => { yi?: number; yl?: number } | undefined };
    const coords = box._getCoords?.();
    if (coords && typeof coords.yi === 'number' && typeof coords.yl === 'number') {
      return Math.max(0, coords.yl - coords.yi);
    }
    return Math.max(0, Number(box.height) || 0);
  }

  /**
   * Move and size a widget.
   *
   * Both the live property and `options` are written: the property is what
   * the renderer reads, and `options` is what a later rebuild would seed
   * from, so leaving them to disagree is how a panel springs back.
   */
  private place(
    widget: { top?: unknown; left?: unknown; width?: unknown; height?: unknown; options?: unknown },
    box: { top: number; left: number; width: number; height: number },
  ): void {
    widget.top = box.top;
    widget.left = box.left;
    widget.width = box.width;
    widget.height = box.height;

    const options = widget.options as Record<string, unknown> | undefined;
    if (options) {
      options.top = box.top;
      options.left = box.left;
      options.width = box.width;
      options.height = box.height;
    }
  }

  layoutTablePanels(): void {
    if (!this.layout) return;
    const tableWidth = Number(this.tableWindow.width) || this.layout.width;
    const tableHeight = Number(this.tableWindow.height) || this.layout.mainHeight;
    const innerWidth = Math.max(20, tableWidth - 2);
    const innerHeight = Math.max(6, tableHeight - 2);
    const colGap = innerWidth >= 70 ? 2 : 1;
    const minLeftWidth = 26;
    const minRightWidth = 18;
    let leftWidth = Math.floor((innerWidth - colGap) * 0.58);
    leftWidth = Math.max(minLeftWidth, leftWidth);
    leftWidth = Math.min(leftWidth, innerWidth - colGap - minRightWidth);
    let rightWidth = innerWidth - leftWidth - colGap;
    if (rightWidth < minRightWidth) {
      rightWidth = Math.max(12, innerWidth - colGap - minLeftWidth);
      leftWidth = Math.max(10, innerWidth - colGap - rightWidth);
    }
    const actionHeight = 1;
    const rowGap = 1;
    const usableHeight = Math.max(4, innerHeight - actionHeight - rowGap);
    const minFullPanelHeight = 9;
    let topHeight = Math.floor(usableHeight / 2) + (usableHeight % 2);
    let bottomHeight = Math.max(4, usableHeight - topHeight);
    if (usableHeight >= minFullPanelHeight) {
      if (usableHeight >= minFullPanelHeight * 2) {
        topHeight = Math.max(topHeight, minFullPanelHeight);
        bottomHeight = Math.max(bottomHeight, minFullPanelHeight);
        if (topHeight + bottomHeight > usableHeight) {
          bottomHeight = Math.max(4, usableHeight - topHeight);
        }
      } else {
        topHeight = minFullPanelHeight;
        bottomHeight = Math.max(4, usableHeight - topHeight);
      }
    }

    const top = 1;
    const left = 1;
    const rightStart = left + leftWidth + colGap;
    const bottomTop = top + topHeight + rowGap;
    const actionTop = top + innerHeight - actionHeight;

    this.place(this.flopPanel, { top, left, width: leftWidth, height: topHeight });

    this.place(this.playersPanel, { top, left: rightStart, width: rightWidth, height: topHeight });

    this.place(this.handPanel, { top: bottomTop, left, width: leftWidth, height: bottomHeight });

    this.place(this.activityPanel, { top: bottomTop, left: rightStart, width: rightWidth, height: bottomHeight });

    this.place(this.tableActions, { top: actionTop, left, width: innerWidth, height: actionHeight });

    this.layoutActionButtons();
  }

  layoutActionButtons(): void {
    const rawWidth = Number(this.tableActions.width);
    const width = Number.isFinite(rawWidth) ? rawWidth : Number(this.tableActions.options.width) || 0;
    const buttonHeight = 1;
    const buttonTop = 0;
    const gap = width >= 58 ? 2 : 1;
    const order: Array<ActionButtonKey> = ACTION_BUTTON_ORDER;
    const available = Math.max(0, width - gap * Math.max(0, order.length - 1));
    const buttonWidth = Math.max(6, Math.floor(available / order.length));
    const totalButtonsWidth = buttonWidth * order.length + gap * Math.max(0, order.length - 1);
    let left = Math.max(0, Math.floor((width - totalButtonsWidth) / 2));

    order.forEach((key) => {
      const button = this.actionButtons[key];
      this.place(button, { top: buttonTop, left, width: buttonWidth, height: buttonHeight });
      button.setContent(this.formatButtonLabel(button.getContent(), buttonWidth));
      left += buttonWidth + gap;
    });
  }

  applyActionButtonPalette(key: ActionButtonKey): void {
    const palette = ACTION_BUTTON_STYLES[key];
    const button = this.actionButtons[key];
    button.setStyle({
      ...palette.base,
      hover: palette.hover,
      focus: palette.focus,
    });
  }

  registerActionButtonEvents(): void {
    ACTION_BUTTON_ORDER.forEach((key) => {
      const palette = ACTION_BUTTON_STYLES[key];
      const button = this.actionButtons[key];
      button.on('mousedown', () => {
        button.setStyle({
          ...palette.active,
          hover: palette.hover,
          focus: palette.focus,
        });
      });
      button.on('mouseup', () => {
        button.setStyle({
          ...palette.base,
          hover: palette.hover,
          focus: palette.focus,
        });
      });
      button.on('mouseleave', () => {
        button.setStyle({
          ...palette.base,
          hover: palette.hover,
          focus: palette.focus,
        });
      });
    });
  }

  formatButtonLabel(label: string, width: number): string {
    const clean = stripBlessedTags(String(label)).trim();
    const text = ` ${clean} `;
    if (text.length >= width) return text.slice(0, width);
    const padLeft = Math.floor((width - text.length) / 2);
    const padRight = width - text.length - padLeft;
    return `${' '.repeat(padLeft)}${text}${' '.repeat(padRight)}`;
  }

  buildOverlay(): void {
    // The SDK's Overlay, not a black box.
    //
    // This was a full-screen Box filled with solid black, so every dialog
    // opened on a blank screen with the lobby wiped out behind it, reported
    // as "many dialogs open up on a black screen instead of overlayed"
    // (2026-09-02). Overlay draws no background of its own - the modal sits
    // on top of the board it came from, and web clients get the dimming from
    // the CSS overlay it announces.
    //
    // Parented to the SCREEN, not the desktop: the desktop can be hidden and
    // the shade must not go with it.
    this.overlayShade = new Overlay({
      parent: this.screen,
      hidden: true,
      // The dialogs manage their own focus and dismissal; the shade must not
      // take focus away from them.
      tapToDismiss: false,
    }) as any;

    // Set z-index after creation to ensure dialogs appear on top of all UI (browser widget, etc.)
    (this.overlayShade as any).z = 9999;

    // Consume mouse clicks on overlay to prevent focus loss from dialogs
    // Clicking the overlay should do nothing (user must interact with dialog or press ESC)
    this.overlayShade.on('click', () => {
      // Do nothing - prevent click from propagating and causing focus issues
      this.screen.render();
    });
  }

  /**
   * The engine options for cards drawn in a panel of this capacity.
   *
   * `capacity` is the panel's own answer to whether a full-size card fits;
   * the player's preference decides what to do with that room (always big,
   * always small, or fit the panel), along with faces, colour, back, hand
   * layout and spacing.
   */
  private cardOptions(capacity: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    const chrome = resolveCardStyle(
      this.cardPreferences,
      capacity === 'mini' ? FULL_CARD_ROWS - 1 : FULL_CARD_ROWS,
      this.unicodeCapable,
    );
    return { ...toRenderOptions(chrome), ...extra };
  }

  renderBoardAndHand(
    boardCards: ReturnType<typeof pokerCardsToCards>,
    playerHand: ReturnType<typeof pokerCardsToCards>,
    flopCardSize: string,
    handCardSize: string,
    hasLiveHand: boolean,
  ): void {
    if (boardCards.length > 0) {
      this.flopContent.setContent(
        renderCardLines(boardCards, this.cardOptions(flopCardSize)).join('\n'),
      );
    } else {
      this.flopContent.setContent('Board not dealt yet.');
    }

    if (playerHand.length > 0) {
      this.handContent.setContent(
        renderCardLines(playerHand, this.cardOptions(handCardSize)).join('\n'),
      );
    } else {
      this.handContent.setContent(hasLiveHand ? 'Waiting for cards...' : 'No hand on record.');
    }
  }

  async runDealAnimation(
    boardCards: ReturnType<typeof pokerCardsToCards>,
    playerHand: ReturnType<typeof pokerCardsToCards>,
    flopCardSize: string,
    handCardSize: string,
    emitSfx: (id: string) => void,
  ): Promise<void> {
    if (!this.screen || this.dealAnimationInProgress) return;
    this.dealAnimationInProgress = true;

    const drawDelay = 180;
    const flipDelay = 220;
    const phasePause = 350;

    const sleep = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    const renderMixedHand = (
      cards: ReturnType<typeof pokerCardsToCards>,
      flipped: number,
      size: string,
    ): void => {
      if (cards.length === 0) return;
      const framed = cards.map((card, index) => ({
        ...card,
        face: index < flipped ? 'front' as const : 'back' as const,
      }));
      this.flopContent.setContent(
        renderCardLines(framed, this.cardOptions(size)).join('\n'),
      );
    };

    const renderMixedPlayerHand = (
      cards: ReturnType<typeof pokerCardsToCards>,
      flipped: number,
      size: string,
    ): void => {
      if (cards.length === 0) return;
      const framed = cards.map((card, index) => ({
        ...card,
        face: index < flipped ? 'front' as const : 'back' as const,
      }));
      this.handContent.setContent(
        renderCardLines(framed, this.cardOptions(size)).join('\n'),
      );
    };

    try {
      if (boardCards.length > 0) {
        for (let i = 1; i <= boardCards.length; i += 1) {
          const partial = boardCards.slice(0, i);
          this.flopContent.setContent(
            renderCardLines(partial, this.cardOptions(flopCardSize, { face: 'back' })).join('\n'),
          );
          emitSfx('card-flap');
          this.screen.render();
          await sleep(drawDelay);
        }

        await sleep(phasePause);

        for (let i = 1; i <= boardCards.length; i += 1) {
          renderMixedHand(boardCards, i, flopCardSize);
          emitSfx('card-flap');
          this.screen.render();
          await sleep(flipDelay);
        }

        await sleep(phasePause);
      }

      if (playerHand.length > 0) {
        for (let i = 1; i <= playerHand.length; i += 1) {
          const partial = playerHand.slice(0, i);
          this.handContent.setContent(
            renderCardLines(partial, this.cardOptions(handCardSize, { face: 'back' })).join('\n'),
          );
          emitSfx('card-flap');
          this.screen.render();
          await sleep(drawDelay);
        }

        await sleep(phasePause);

        for (let i = 1; i <= playerHand.length; i += 1) {
          renderMixedPlayerHand(playerHand, i, handCardSize);
          emitSfx('card-flap');
          this.screen.render();
          await sleep(flipDelay);
        }
      }
    } finally {
      this.dealAnimationInProgress = false;
    }
  }

  // ============================================================================
  // UNO RENDERING METHODS
  // ============================================================================

  renderUnoDiscardPile(
    topCard: UnoCard | null,
    currentColor: UnoColor,
    direction: 1 | -1,
  ): void {
    if (!topCard) {
      this.flopContent.setContent('No card played yet.');
      return;
    }

    // Render the top discard card using CardEngine
    const lines: string[] = [];

    // Add direction indicator
    // ASCII only: a real Amiga (and a C64) has no U+21BB. The sysop's rule
    // is the board's characters, nothing else (2026-09-02).
    const directionArrow = direction === 1 ? '{cyan-fg}>>{/}' : '{cyan-fg}<<{/}';
    lines.push(`Direction: ${directionArrow} ${direction === 1 ? 'Clockwise' : 'Counter-clockwise'}`);

    // Add current color indicator
    const colorNames: Record<UnoColor, string> = {
      'R': '{red-fg}RED{/}',
      'G': '{green-fg}GREEN{/}',
      'B': '{blue-fg}BLUE{/}',
      'Y': '{yellow-fg}YELLOW{/}',
    };
    lines.push(`Current Color: ${colorNames[currentColor]}`);
    lines.push('');

    // No "Top Card:" label - the card IS the top card, and the panel is eight
    // rows: two lines of state, a gap and a four-row card fills it exactly.
    // With the label and a second blank it ran one row past the panel and the
    // card was cut off (2026-09-02).
    lines.push(this.renderUnoCardAscii(topCard));

    this.flopContent.setContent(lines.join('\n'));
  }

  /**
   * The door's card values, in the vocabulary the SDK's card engine speaks.
   *
   * They are the same cards under different spellings - this door's engine
   * says 'Skip' and 'Draw2', the SDK's says 'skip' and 'draw2' - which is why
   * this file used to draw its own five-line box instead of asking the engine
   * that already renders UNO cards. House-rule cards (HR1-HR5, WildChange)
   * exist only in this door and have no engine equivalent; they keep a plain
   * face of their own.
   */
  private toEngineUnoCard(card: UnoCard): { color: EngineUnoColor; value: EngineUnoValue } | null {
    const values: Record<string, EngineUnoValue> = {
      '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
      '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
      'Skip': 'skip', 'Reverse': 'reverse', 'Draw2': 'draw2',
      'Wild': 'wild', 'Wild4': 'wild4',
    };
    const value = values[card.value];
    if (!value) return null;
    return { color: card.color as EngineUnoColor, value };
  }

  private renderUnoCardAscii(card: UnoCard): string {
    const colorTags: Record<string, string> = {
      'R': 'red-fg',
      'G': 'green-fg',
      'B': 'blue-fg',
      'Y': 'yellow-fg',
      'W': 'white-fg',
    };
    const colorTag = colorTags[card.color] || 'white-fg';

    // The SDK's card engine draws the card, and colours it. `ascii` because
    // the board is an Amiga, `mini` because the panel is four rows tall, and
    // `ansi` because the engine knows which parts of a card are which colour
    // - a flat blessed tag around the whole box does not. `ansiToTags` is how
    // raw ANSI becomes something a blessed widget will render.
    const engineCard = this.toEngineUnoCard(card);
    if (engineCard) {
      // 'mini' used to be hardcoded here, with a comment explaining that the
      // panel is four rows tall - which it is at 80x25 and is not after
      // Alt+Enter: "uno in cardlobby doesnt show the full size cards when it
      // can" (2026-09-02). Poker sized itself from its panel already; this is
      // the same rule, plus whatever the player asked for (lib/card-style.ts).
      const chrome = resolveCardStyle(
        this.cardPreferences,
        this.panelRows(this.flopContent) - 3,   // two state lines and a gap
        this.unicodeCapable,
      );
      const lines = cardEngine.renderUnoCardLines(engineCard, toRenderOptions(chrome) as never);
      return lines.map((line) => ` ${ansiToTags(line)}`).join('\n');
    }

    // A house-rule card: the engine has never heard of it.
    const label = card.value.replace('WildChange', 'CHANGE');
    return [
      ` {${colorTag}}.---------.`,
      ` {${colorTag}}|${label.padEnd(9, ' ')}|`,
      ` {${colorTag}}|  HOUSE  |`,
      ` {${colorTag}}'---------'{/}`,
    ].join('\n');
  }

  renderUnoPlayerStatus(
    players: UnoPlayer[],
    currentPlayerIndex: number,
    currentUserId: string,
  ): void {
    const lines: string[] = [];
    lines.push(`{${UI_THEME.accent}-fg}Players:{/}`);
    lines.push('');

    players.forEach((player, index) => {
      const isCurrent = index === currentPlayerIndex;
      const isYou = player.id === currentUserId;
      const turnMarker = isCurrent ? '{yellow-fg}>{/} ' : '  ';
      const unoMarker = player.hand.length === 1 ? ' {yellow-fg}!{/}' : '';
      const youMarker = isYou ? ` {${UI_THEME.accent}-fg}(You){/}` : '';
      const botMarker = player.isBot ? ` {${UI_THEME.dim}-fg}[BOT]{/}` : '';

      lines.push(
        `${turnMarker}${player.name}${youMarker}${botMarker}: ${player.hand.length} card${player.hand.length !== 1 ? 's' : ''}${unoMarker}`,
      );
    });

    this.playersContent.setContent(lines.join('\n'));
  }

  /**
   * A hand of UNO cards drawn as cards, side by side, with the key that
   * plays each one under it - or null when the panel is too short or too
   * narrow to hold them, in which case the caller falls back to the list.
   *
   * Cards are joined column by column: renderUnoCardLines gives one card's
   * rows, and a hand is those rows concatenated across.
   */
  private renderUnoHandAsCards(
    hand: UnoCard[],
    playableIndices: number[],
    selectedIndex: number | null,
  ): string[] | null {
    const rows = this.panelRows(this.handContent);
    const chrome = resolveCardStyle(this.cardPreferences, rows - 4, this.unicodeCapable);
    if (chrome.size !== 'full') return null;      // the list says more in less

    const drawnCards: string[][] = [];
    for (const card of hand) {
      const engineCard = this.toEngineUnoCard(card);
      if (!engineCard) return null;               // a house-rule card has no art
      drawnCards.push(cardEngine.renderUnoCardLines(engineCard, toRenderOptions(chrome) as never)
        .map((line) => ansiToTags(line)));
    }
    if (drawnCards.length === 0) return null;

    const cardWidth = stripBlessedTags(drawnCards[0][0] ?? '').length;
    const coords = this.handContent._getCoords?.();
    const panelWidth = (coords ? coords.xl - coords.xi : 0)
      || Number(this.handContent.width) || 36;
    const perRow = Math.max(1, Math.floor(panelWidth / (cardWidth + 1)));
    const cardRowCount = drawnCards[0].length;
    const rowsNeeded = Math.ceil(drawnCards.length / perRow) * (cardRowCount + 1);
    if (perRow < 2 || rowsNeeded > rows - 2) return null;

    const out: string[] = [];
    for (let start = 0; start < drawnCards.length; start += perRow) {
      const slice = drawnCards.slice(start, start + perRow);
      for (let row = 0; row < cardRowCount; row++) {
        out.push(slice.map((card) => card[row] ?? '').join(' '));
      }
      // The key that plays it, and whether it can be played at all.
      out.push(slice.map((_, offset) => {
        const index = start + offset;
        const label = index === 9 ? '0' : String(index + 1);
        const mark = index === selectedIndex
          ? `{yellow-bg}{black-fg}[${label}]{/}{/}`
          : playableIndices.includes(index)
            ? `{green-fg}[${label}]{/}`
            : `{gray-fg}[${label}]{/}`;
        const pad = Math.max(0, cardWidth - 3);
        return mark + ' '.repeat(pad);
      }).join(' '));
    }
    return out;
  }

  renderUnoHand(
    hand: UnoCard[],
    playableIndices: number[],
    selectedIndex: number | null,
  ): void {
    if (hand.length === 0) {
      this.handContent.setContent('No cards in hand.');
      return;
    }

    const lines: string[] = [];
    lines.push(`{${UI_THEME.accent}-fg}Your Hand:{/}`);
    lines.push('');

    // Drawn as CARDS when the panel can hold a row of them - which it can
    // the moment the door is given a real terminal ("uno in cardlobby
    // doesnt show the full size cards when it can", 2026-09-02). The
    // compact list below is what a short panel gets, and it is what every
    // panel used to get.
    const drawn = this.renderUnoHandAsCards(hand, playableIndices, selectedIndex);
    if (drawn) {
      this.handContent.setContent([...lines, ...drawn].join('\n'));
      return;
    }

    // Across the panel, not down it.
    //
    // One card per row needs eleven rows for a seven-card hand, and the panel
    // has eight - so the sysop was dealt seven cards and shown none of them
    // (2026-09-02). Each entry is about twelve columns and the panel is wide,
    // so they are laid out in as many columns as fit.
    const entries: string[] = [];
    hand.forEach((card, index) => {
      const isPlayable = playableIndices.includes(index);
      const isSelected = index === selectedIndex;
      const indexLabel = index === 9 ? '0' : String(index + 1);

      const colorTags: Record<string, string> = {
        'R': 'red-fg',
        'G': 'green-fg',
        'B': 'blue-fg',
        'Y': 'yellow-fg',
        'W': 'white-fg',
      };

      const colorTag = colorTags[card.color] || 'white-fg';
      const displayValue = card.value.replace('Wild4', 'W+4').replace('Wild', 'W');

      let marker = ' ';
      if (isSelected) {
        marker = '{yellow-bg}{black-fg}>{/}{/}';
      } else if (isPlayable) {
        marker = '{green-fg}+{/}';
      } else {
        marker = '{red-fg}-{/}';
      }

      entries.push(`[${indexLabel}] ${marker} {${colorTag}}${displayValue.padEnd(6, ' ')}{/}`);
    });

    // One entry is "[n] m VALUE" - four visible columns plus the six the value
    // is padded to, and a gap between neighbours.
    const entryWidth = 14;
    const coords = this.handContent._getCoords?.();
    const panelWidth = (coords ? coords.xl - coords.xi : 0) || Number(this.handContent.width) || 36;
    const perRow = Math.max(1, Math.floor(panelWidth / entryWidth));
    for (let i = 0; i < entries.length; i += perRow) {
      lines.push(entries.slice(i, i + perRow).join(' '));
    }

    lines.push('');
    lines.push(`{${UI_THEME.dim}-fg}Press 1-9,0 to select, Enter to play{/}`);

    this.handContent.setContent(lines.join('\n'));
  }

  /**
   * The UNO context lines that sit above the log: whose action was last, and
   * a challenge window while one is open.
   *
   * This used to PREPEND straight into activityContent while the door's own
   * renderer replaced the whole thing from the other side. Two writers, two
   * strategies, one widget - which is why the panel jumped (2026-09-02). It
   * hands its lines to the one painter now.
   */
  renderUnoActivity(
    lastAction: string,
    challengeWindow?: { type: string; expiresAt: number } | null,
  ): void {
    const lines: string[] = [];

    if (lastAction) {
      lines.push(`{${UI_THEME.accent}-fg}Last Action:{/}`);
      lines.push(lastAction);
      lines.push('');
    }

    if (challengeWindow) {
      const timeLeft = Math.max(0, Math.floor((challengeWindow.expiresAt - Date.now()) / 1000));
      const challengeType = challengeWindow.type === 'uno' ? 'UNO Challenge' : 'Wild Draw 4 Challenge';

      lines.push(`{yellow-bg}{black-fg} ${challengeType} OPEN! {/}{/}`);
      lines.push(`{${UI_THEME.warning}-fg}Time remaining: ${timeLeft}s{/}`);
      lines.push('');
    }

    this.activityHeader = lines;
    this.paintActivity();
  }

  /** The door's own lines: hints for the moment, then the event log. */
  setActivityBody(lines: string[]): void {
    this.activityBody = lines;
    this.paintActivity();
  }

  /**
   * Paint header + body into the activity log, wrapped to the panel's own
   * width and holding the reader's scroll position.
   *
   * The wrap has to be tag-aware: blessed counts `{yellow-fg}` against the
   * width and breaks wherever it runs out, which is how the panel came to
   * show "D Dea" on one row and "l" on the next.
   */
  private paintActivity(): void {
    if (!this.activityContent) return;

    const coords = (this.activityContent as any)._getCoords?.();
    const width = (coords ? coords.xl - coords.xi : 0)
      || Number(this.activityContent.width)
      || 30;

    const wrapped: string[] = [];
    for (const line of [...this.activityHeader, ...this.activityBody]) {
      if (line === '') { wrapped.push(''); continue; }
      wrapped.push(...wrapTagged(line, Math.max(1, width)));
    }

    const previousScroll = this.activityContent.getScroll();
    const previousHeight = this.activityContent.getScrollHeight();
    const wasAtBottom = previousHeight === 0 || previousScroll >= Math.max(0, previousHeight - 1);

    this.activityContent.setContent(wrapped.join('\n'));

    const newHeight = this.activityContent.getScrollHeight();
    this.activityContent.setScroll(
      wasAtBottom ? newHeight : Math.min(previousScroll, newHeight),
    );
  }

  /**
   * Hide all UI elements (for browser mode)
   */
  hide(): void {
    if (this.topBar) this.topBar.hidden = true;
    if (this.topInfoBar) this.topInfoBar.hidden = true;
    if (this.statusBar) this.statusBar.hidden = true;
    if (this.lobbyWindow) this.lobbyWindow.hidden = true;
    if (this.tableWindow) this.tableWindow.hidden = true;
    if (this.logWindow) this.logWindow.hidden = true;
    if (this.flopPanel) this.flopPanel.hidden = true;
    if (this.playersPanel) this.playersPanel.hidden = true;
    if (this.handPanel) this.handPanel.hidden = true;
    if (this.activityPanel) this.activityPanel.hidden = true;
    this.screen.render();
  }

  /**
   * Show all UI elements (return from browser mode)
   */
  show(): void {
    if (this.topBar) this.topBar.hidden = false;
    if (this.topInfoBar) this.topInfoBar.hidden = false;
    if (this.statusBar) this.statusBar.hidden = false;
    if (this.lobbyWindow) this.lobbyWindow.hidden = false;
    if (this.tableWindow) this.tableWindow.hidden = false;
    if (this.logWindow) this.logWindow.hidden = false;
    if (this.flopPanel) this.flopPanel.hidden = false;
    if (this.playersPanel) this.playersPanel.hidden = false;
    if (this.handPanel) this.handPanel.hidden = false;
    if (this.activityPanel) this.activityPanel.hidden = false;
    this.screen.render();
  }
}
