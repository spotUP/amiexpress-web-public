/**
 * Card Lobby - UI Manager
 * Handles all UI building, layout, and rendering operations
 */

import blessed, { Screen, Box, List, Button, Log, Listbar, ScrollableText, DropdownMenu, ListTable } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
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
      parent: this.desktop,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      fixed: true,
      hidden: false,
      style: { fg: 'white', bg: 'blue' },
      content: '',
    });

    this.topInfoBar = createBox({
      parent: this.desktop,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      hidden: true,
      style: { fg: 'white', bg: 'blue' },
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
        parent: this.topBar,
        top: 0,
        left,
        width: menu.label.length + 2,
        height: 1,
        content: `{bold}${menu.label}{/bold}`,
        style: { fg: 'white', bg: 'blue', focus: { fg: 'black', bg: 'cyan' } },
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
      parent: this.desktop,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      style: UI_THEME.statusBar,
      content: ' Loading Card Lobby... ',
    });
  }

  buildWindows(callbacks: {
    onLobbySelect: (index: number, tableListMap: Record<number, number | null>) => void;
    createTableFlow: () => void | Promise<void>;
    joinSelectedTable: () => void | Promise<void>;
    observeSelectedTable: () => void | Promise<void>;
    toggleFilters: () => void;
    manualRefresh: () => void;
    runAction: (action: () => void | Promise<void>) => void;
  }): void {
    const { onLobbySelect, createTableFlow, joinSelectedTable, observeSelectedTable, toggleFilters, manualRefresh, runAction } = callbacks;

    const height = (this.screen.height as number) || 24;
    const width = (this.screen.width as number) || 80;
    const topOffset = 1;
    const statusHeight = 1;
    const logHeight = 4;
    const tableHeight = height - topOffset - statusHeight;
    const mainHeight = tableHeight - logHeight;

    // Better layout: 30% lobby (min 25 chars), 70% table
    const leftWidth = Math.max(25, Math.floor(width * 0.30));
    const rightWidth = width - leftWidth;
    this.layout = {
      width,
      height,
      topOffset,
      statusHeight,
      logHeight,
      mainHeight,
      tableHeight,
      leftWidth,
      rightWidth,
    };

    this.lobbyWindow = createBox({
      parent: this.desktop,
      top: topOffset,
      left: 0,
      width: leftWidth,
      height: mainHeight,
      label: ' Lobby ',
      border: { type: 'line' },
      style: { border: UI_THEME.windowBorder, bg: UI_THEME.windowBg },
    });

    this.tableWindow = createBox({
      parent: this.desktop,
      top: topOffset,
      left: leftWidth,
      width: rightWidth,
      height: mainHeight,
      border: { type: 'line' },
      label: ' Table ',
      style: { border: UI_THEME.windowBorder, bg: UI_THEME.windowBg },
    });

    let tableListMap: Record<number, number | null> = {};

    // Use SDK ListTable for clean table display
    this.lobbyList = new ListTable({
      parent: this.lobbyWindow,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-2',
      headers: ['ID', 'Game', 'Stakes', 'Players', 'Status'],
      rows: [],
      interactive: true,
      style: {
        fg: 'white',
        selected: { fg: 'black', bg: UI_THEME.highlightBg },
        header: { fg: 'yellow', bold: true },
      } as any,
      scrollbar: {
        ch: '|',
        track: { ch: '|', bg: 'black' },
        style: { fg: UI_THEME.accent },
      } as any,
    }) as any;

    this.lobbyList.on('select', (_: any, index: number) => {
      onLobbySelect(index, tableListMap);
    });

    // Action bar at bottom
    this.lobbyActions = createBox({
      parent: this.lobbyWindow,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      style: { fg: 'black', bg: 'cyan' },
      content: ' C:Create J:Join O:Observe F:Filter R:Refresh ',
    }) as any;

    // Use SDK box instead of blessed.scrollabletext
    this.tableContent = createBox({
      parent: this.tableWindow,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      style: { fg: 'white' },
      content: 'Select a table to view details.',
    }) as any;

    this.tableActions = createBox({
      parent: this.tableWindow,
      top: 0,
      left: 1,
      right: 1,
      height: 1,
      style: { fg: 'white', bg: 'black' },
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
      border: { type: 'line', labelStyle: { fg: 'yellow' } },
      label: ' Activity ',
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      style: { fg: 'white', border: UI_THEME.windowBorder, bg: 'black' },
      scrollbar: {
        ch: '|',
        track: { ch: '|', bg: 'black' },
        style: { fg: UI_THEME.accent, bg: UI_THEME.accent },
      } as any,
    });

    this.buildTablePanels();
  }

  setTableListMap(map: Record<number, number | null>): void {
    // Method to allow setting tableListMap from outside
    // This is a workaround since the callback closure captures the local variable
  }

  buildTablePanels(): void {
    const panelStyle = { border: UI_THEME.windowBorder, bg: UI_THEME.windowBg };
    const contentStyle = { fg: 'white', bg: 'black' };
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
      border: { type: 'line', labelStyle: { fg: 'yellow' } },
      style: panelStyle,
    });

    this.flopContent = createBox({
      parent: this.flopPanel,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      tags: true,
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
      border: { type: 'line', labelStyle: { fg: 'yellow' } },
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
        track: { ch: '|', bg: 'black' },
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
      border: { type: 'line', labelStyle: { fg: 'yellow' } },
      style: panelStyle,
    });

    this.handContent = createBox({
      parent: this.handPanel,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      tags: true,
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
      border: { type: 'line', labelStyle: { fg: 'yellow' } },
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
        track: { ch: '|', bg: 'black' },
        style: scrollbarStyle,
      } as any,
      content: '',
    });

    this.layoutTablePanels();
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

    this.flopPanel.options.top = top;
    this.flopPanel.options.left = left;
    this.flopPanel.options.width = leftWidth;
    this.flopPanel.options.height = topHeight;

    this.playersPanel.options.top = top;
    this.playersPanel.options.left = rightStart;
    this.playersPanel.options.width = rightWidth;
    this.playersPanel.options.height = topHeight;

    this.handPanel.options.top = bottomTop;
    this.handPanel.options.left = left;
    this.handPanel.options.width = leftWidth;
    this.handPanel.options.height = bottomHeight;

    this.activityPanel.options.top = bottomTop;
    this.activityPanel.options.left = rightStart;
    this.activityPanel.options.width = rightWidth;
    this.activityPanel.options.height = bottomHeight;

    this.tableActions.options.top = actionTop;
    this.tableActions.options.left = left;
    this.tableActions.options.width = innerWidth;
    this.tableActions.options.height = actionHeight;

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
      button.options.top = buttonTop;
      button.options.height = buttonHeight;
      button.options.left = left;
      button.options.width = buttonWidth;
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
    this.overlayShade = createBox({
      parent: this.desktop,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      hidden: true,
      style: {
        bg: 'black',
      },
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
    lines.push('{cyan-fg}Players:{/}');
    lines.push('');

    players.forEach((player, index) => {
      const isCurrent = index === currentPlayerIndex;
      const isYou = player.id === currentUserId;
      const turnMarker = isCurrent ? '{yellow-fg}\u2192{/} ' : '  ';
      const unoMarker = player.hand.length === 1 ? ' {yellow-fg}\u26A0{/}' : '';
      const youMarker = isYou ? ' {cyan-fg}(You){/}' : '';
      const botMarker = player.isBot ? ' {gray-fg}[BOT]{/}' : '';

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
    lines.push('{cyan-fg}Your Hand:{/}');
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
    lines.push('{gray-fg}Press 1-9,0 to select, Enter to play{/}');

    this.handContent.setContent(lines.join('\n'));
  }

  renderUnoActivity(
    lastAction: string,
    challengeWindow?: { type: string; expiresAt: number } | null,
  ): void {
    const lines: string[] = [];

    if (lastAction) {
      lines.push(`{cyan-fg}Last Action:{/}`);
      lines.push(lastAction);
      lines.push('');
    }

    if (challengeWindow) {
      const timeLeft = Math.max(0, Math.floor((challengeWindow.expiresAt - Date.now()) / 1000));
      const challengeType = challengeWindow.type === 'uno' ? 'UNO Challenge' : 'Wild Draw 4 Challenge';

      lines.push(`{yellow-bg}{black-fg} ${challengeType} OPEN! {/}{/}`);
      lines.push(`{yellow-fg}Time remaining: ${timeLeft}s{/}`);
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
