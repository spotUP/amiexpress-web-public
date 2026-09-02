/**
 * Card Lobby - UI Manager
 * Handles all UI building, layout, and rendering operations
 */

import blessed, { Screen, Box, List, Button, Log, Listbar, ScrollableText, DropdownMenu, ListTable, Overlay } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList, createButton, createText, createLog } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { CardEngine, pokerCardsToCards } from '@amiexpress/bbs-door-sdk';
import { UI_THEME, ACTION_BUTTON_STYLES, ACTION_BUTTON_ORDER, type ActionButtonKey } from '../lib/constants';
import { renderCardLines, stripBlessedTags } from '../lib/utils';
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
  public statusBar!: Box;
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
    exitDoor: () => void;
    runAction: (action: () => void | Promise<void>) => void;
  }): void {
    const { focusLobby, focusTable, showProfileWindow, showLeaderboardWindow, showAchievementsWindow, showBulletinsWindow, exitDoor, runAction } = callbacks;

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
      style: { fg: UI_THEME.topBar.fg, bg: UI_THEME.topBar.bg },
      content: '',
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

    const menuDefs = [
      {
        label: 'Lobby',
        items: [
          { label: 'Focus Lobby', action: () => runAction(focusLobby) },
        ],
      },
      {
        label: 'Table',
        items: [
          { label: 'Focus Table', action: () => runAction(focusTable) },
        ],
      },
      {
        label: 'Views',
        items: [
          { label: 'Profile', action: () => runAction(showProfileWindow) },
          { label: 'Leaders', action: () => runAction(showLeaderboardWindow) },
          { label: 'Achievements', action: () => runAction(showAchievementsWindow) },
          { label: 'Bulletins', action: () => runAction(showBulletinsWindow) },
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

  buildStatusBar(): void {
    this.statusBar = createBox({
      // Panel adds a line border unless the key is present; these are
      // bars and content areas, and the window around them carries the frame.
      border: undefined,
      parent: this.desktop,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
      style: UI_THEME.statusBar,
      content: ' Loading Card Lobby... ',
    });
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
      tableHeight: mainHeight,
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

  renderBoardAndHand(
    boardCards: ReturnType<typeof pokerCardsToCards>,
    playerHand: ReturnType<typeof pokerCardsToCards>,
    flopCardSize: string,
    handCardSize: string,
    hasLiveHand: boolean,
  ): void {
    if (boardCards.length > 0) {
      this.flopContent.setContent(
        renderCardLines(boardCards, { layout: 'flat-condensed', size: flopCardSize }).join('\n'),
      );
    } else {
      this.flopContent.setContent('Board not dealt yet.');
    }

    if (playerHand.length > 0) {
      this.handContent.setContent(
        renderCardLines(playerHand, { layout: 'flat-condensed', size: handCardSize }).join('\n'),
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
        renderCardLines(framed, { layout: 'flat-condensed', size }).join('\n'),
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
        renderCardLines(framed, { layout: 'flat-condensed', size }).join('\n'),
      );
    };

    try {
      if (boardCards.length > 0) {
        for (let i = 1; i <= boardCards.length; i += 1) {
          const partial = boardCards.slice(0, i);
          this.flopContent.setContent(
            renderCardLines(partial, { layout: 'flat-condensed', size: flopCardSize, face: 'back' }).join('\n'),
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
            renderCardLines(partial, { layout: 'flat-condensed', size: handCardSize, face: 'back' }).join('\n'),
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
    const directionArrow = direction === 1 ? '{cyan-fg}\u21BB{/}' : '{cyan-fg}\u21BA{/}';
    lines.push(`Direction: ${directionArrow} ${direction === 1 ? 'Clockwise' : 'Counter-clockwise'}`);
    lines.push('');

    // Add current color indicator
    const colorNames: Record<UnoColor, string> = {
      'R': '{red-fg}RED{/}',
      'G': '{green-fg}GREEN{/}',
      'B': '{blue-fg}BLUE{/}',
      'Y': '{yellow-fg}YELLOW{/}',
    };
    lines.push(`Current Color: ${colorNames[currentColor]}`);
    lines.push('');

    // Render the card (using simplified ASCII representation)
    lines.push('Top Card:');
    lines.push(this.renderUnoCardAscii(topCard));

    this.flopContent.setContent(lines.join('\n'));
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
    const displayValue = card.value.replace('Wild4', 'W+4').replace('Wild', 'W');

    // Simple card representation
    return [
      ` {${colorTag}}._______. `,
      ` {${colorTag}}|       | `,
      ` {${colorTag}}|  ${displayValue.padEnd(4, ' ')} | `,
      ` {${colorTag}}|       | `,
      ` {${colorTag}}'-------' {/}`,
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
      const turnMarker = isCurrent ? '{yellow-fg}\u2192{/} ' : '  ';
      const unoMarker = player.hand.length === 1 ? ' {yellow-fg}\u26A0{/}' : '';
      const youMarker = isYou ? ` {${UI_THEME.accent}-fg}(You){/}` : '';
      const botMarker = player.isBot ? ` {${UI_THEME.dim}-fg}[BOT]{/}` : '';

      lines.push(
        `${turnMarker}${player.name}${youMarker}${botMarker}: ${player.hand.length} card${player.hand.length !== 1 ? 's' : ''}${unoMarker}`,
      );
    });

    this.playersContent.setContent(lines.join('\n'));
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

    // Render cards with indices
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
        marker = '{green-fg}\u2713{/}';
      } else {
        marker = '{red-fg}\u2717{/}';
      }

      lines.push(`[${indexLabel}] ${marker} {${colorTag}}${displayValue.padEnd(6, ' ')}{/}`);
    });

    lines.push('');
    lines.push(`{${UI_THEME.dim}-fg}Press 1-9,0 to select, Enter to play{/}`);

    this.handContent.setContent(lines.join('\n'));
  }

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

    if (this.activityContent) {
      const existingContent = this.activityContent.getContent();
      const newContent = lines.join('\n') + (existingContent ? '\n\n' + existingContent : '');

      // Keep last 20 lines to prevent overflow
      const allLines = newContent.split('\n');
      const trimmed = allLines.slice(0, 20).join('\n');

      this.activityContent.setContent(trimmed);
    }
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
