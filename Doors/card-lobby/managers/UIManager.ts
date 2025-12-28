/**
 * Card Lobby - UI Manager
 * Handles all UI building, layout, and rendering operations
 */

import blessed, { Screen, Box, List, Button, Log, Listbar, ScrollableText } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList, createButton, createText, createLog } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { CardEngine, pokerCardsToCards } from '@amiexpress/bbs-door-sdk';
import { UI_THEME, ACTION_BUTTON_STYLES, ACTION_BUTTON_ORDER, type ActionButtonKey } from '../lib/constants';
import { renderCardLines, stripBlessedTags } from '../lib/utils';

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
  public topBar!: Listbar;
  public topInfoBar!: Box;
  public statusBar!: Box;
  public lobbyWindow!: Box;
  public tableWindow!: Box;
  public lobbyList!: List;
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

  constructor(screen: Screen, desktop: Box) {
    this.screen = screen;
    this.desktop = desktop;
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

    this.topBar = blessed.listbar({
      parent: this.desktop,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      hidden: true,
      style: UI_THEME.topBar,
      commands: {
        Lobby: { callback: () => runAction(focusLobby) },
        Table: { callback: () => runAction(focusTable) },
        Profile: { callback: () => runAction(showProfileWindow) },
        Leaders: { callback: () => runAction(showLeaderboardWindow) },
        Achieve: { callback: () => runAction(showAchievementsWindow) },
        Bulls: { callback: () => runAction(showBulletinsWindow) },
        Quit: { callback: () => runAction(exitDoor) },
      },
    });

    this.topInfoBar = createBox({
      parent: this.desktop,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      hidden: false,
      style: { fg: 'white', bg: 'blue' },
      content: ' Card Lobby ',
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

    const minLobbyWidth = 22;
    const minTableWidth = 40;
    let leftWidth = Math.floor(width * 0.35);
    leftWidth = Math.max(minLobbyWidth, leftWidth);
    leftWidth = Math.min(leftWidth, width - minTableWidth);
    if (leftWidth < 10) {
      leftWidth = Math.max(10, width - minTableWidth);
    }
    const rightWidth = Math.max(minTableWidth, width - leftWidth);
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
      border: { type: 'ascii' },
      style: { border: UI_THEME.windowBorder, bg: UI_THEME.windowBg },
    });

    this.tableWindow = createBox({
      parent: this.desktop,
      top: topOffset,
      left: leftWidth,
      width: rightWidth,
      height: mainHeight,
      style: { bg: UI_THEME.windowBg },
    });

    let tableListMap: Record<number, number | null> = {};

    this.lobbyList = createList({
      parent: this.lobbyWindow,
      top: 1,
      left: 1,
      right: 1,
      bottom: 2,
      wrapItems: false,
      keys: true,
      mouse: true,
      vi: true,
      tags: true,
      style: {
        fg: 'white',
        selected: { fg: 'black', bg: UI_THEME.highlightBg },
      } as any,
      scrollbar: {
        ch: '|',
        track: { ch: '|', bg: 'black' },
        style: { fg: UI_THEME.accent, bg: UI_THEME.accent },
      } as any,
      items: [],
    });

    this.lobbyList.on('select', (_: any, index: number) => {
      onLobbySelect(index, tableListMap);
    });

    this.lobbyActions = blessed.listbar({
      parent: this.lobbyWindow,
      bottom: 0,
      left: 1,
      right: 1,
      height: 1,
      itemPadding: 0,
      itemGap: 1,
      style: { fg: 'white', bg: 'black' },
      items: {
        Create: { callback: () => runAction(createTableFlow), keys: ['c'] },
        Join: { callback: () => runAction(joinSelectedTable), keys: ['j'] },
        Observe: { callback: () => runAction(observeSelectedTable), keys: ['o'] },
        Filter: { callback: () => runAction(toggleFilters), keys: ['f'] },
        Refresh: { callback: () => runAction(manualRefresh), keys: ['r'] },
      },
    });

    this.tableContent = blessed.scrollabletext({
      parent: this.tableWindow,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      style: {
        fg: 'white',
      },
      content: 'Select a table to view details.',
    });

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
      border: { type: 'ascii', labelStyle: { fg: 'yellow' } },
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
      border: { type: 'ascii', labelStyle: { fg: 'yellow' } },
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
      border: { type: 'ascii', labelStyle: { fg: 'yellow' } },
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
      border: { type: 'ascii', labelStyle: { fg: 'yellow' } },
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
      border: { type: 'ascii', labelStyle: { fg: 'yellow' } },
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
}
