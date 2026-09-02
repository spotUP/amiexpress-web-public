/**
 * Card Lobby - painting a table for the game it is running
 *
 * Poker and UNO put different things in the same four panels: a board and a
 * pot, or a discard pile, a colour and everybody's card counts. The panels
 * belong to UIManager; choosing what goes in them for this game belongs
 * here, out of a 2808-line index.ts that had never been type checked.
 */

import type { Box, Log, ScrollableText } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { type PokerEngine, pokerCardsToCards } from '@amiexpress/bbs-door-sdk';
import type { UnoGameEngine } from '../lib/uno-engine';
import { type LobbyTable, type PlayerProfile, isBotPlayer, isUnoTable, pad, padColumn, mergeColumns, visibleWidth } from '../lib';
import type { UIManager } from './UIManager';
import { UI_THEME } from '../lib/constants';

export interface GameViewHost {
  readonly uiManager: UIManager;
  readonly currentProfile: PlayerProfile | null;
  readonly flopPanel: Box;
  readonly flopContent: Box;
  readonly handPanel: Box;
  readonly handContent: Box;
  readonly playersPanel: Box;
  readonly playersContent: ScrollableText;
  readonly activityContent: Log;
  readonly dealAnimationInProgress: boolean;
  selectedUnoCardIndex: number | null;
  lastAnimatedHandStartedAt: number | null;
  loadTableHand(table: LobbyTable): { engine: PokerEngine; beforeStacks: Record<string, number> } | null;
  loadUnoGameState(table: LobbyTable): { engine: UnoGameEngine; beforeStacks: Record<string, number> } | null;
  renderBoardAndHand(boardCards: any[], playerHand: any[], flopCardSize: string, handCardSize: string, hasActiveHand: boolean): void;
  runDealAnimation(boardCards: any[], playerHand: any[], flopCardSize: string, handCardSize: string): Promise<void> | void;
  updateActivityPanel(tableOverride?: LobbyTable | null, engineOverride?: PokerEngine | null): void;
  // What updateTablePanel needs, now that it lives here: the state it
  // paints from, the panels it shows and hides, and the three other
  // painters it hands off to.
  readonly lobby: { tables: LobbyTable[] } | null;
  readonly selectedTableId: number | null;
  readonly activityPanel: Box;
  readonly tableActions: Box;
  readonly tableContent: ScrollableText;
  findTableById(id: number): LobbyTable | undefined;
  updateTableActions(): void;
  layoutTablePanels(): void;
  updateTopInfoBar(table?: LobbyTable | null): void;
  readonly viewMode: 'lobby' | 'table';
  readonly tableFlow: { isObserverForTable(table: LobbyTable, userId: string): boolean };
  readonly screen: { render(): void };
}

export class GameViews {
  constructor(private host: GameViewHost) {}

  updateTablePanel(): void {
    if (!this.host.lobby || !this.host.currentProfile) return;
    const tableId = this.host.currentProfile.currentTableId ?? this.host.selectedTableId;
    if (!tableId) {
      this.host.flopPanel.hide();
      this.host.playersPanel.hide();
      this.host.handPanel.hide();
      this.host.activityPanel.hide();
      this.host.tableActions.hide();
      this.host.tableContent.show();
      this.host.tableContent.setContent([
        'Select a table to view details.',
        '',
        `{${UI_THEME.accent}-fg}Quick start{/}:`,
        '',
        // One key per line: the panel is 52 columns wide at 80x25 and a
        // single sentence naming all three ran off the right edge.
        `  {${UI_THEME.accent}-fg}C{/}      create a table`,
        `  {${UI_THEME.accent}-fg}ENTER{/}  join the highlighted table`,
        `  {${UI_THEME.accent}-fg}O{/}      observe it`,
        `  {${UI_THEME.accent}-fg}R{/}      refresh the lobby`,
      ].join('\n'));
      this.host.updateTableActions();
      return;
    }

    const table = this.host.findTableById(tableId);
    if (!table) {
      this.host.flopPanel.hide();
      this.host.playersPanel.hide();
      this.host.handPanel.hide();
      this.host.activityPanel.hide();
      this.host.tableActions.hide();
      this.host.tableContent.show();
      this.host.tableContent.setContent(`Table not found. Press {${UI_THEME.accent}-fg}R{/} to refresh the lobby.`);
      this.host.updateTableActions();
      return;
    }

    const isObserver = this.host.tableFlow.isObserverForTable(table, this.host.currentProfile.userId);
    const showGameView = this.host.viewMode === 'table' && this.host.currentProfile?.currentTableId === table.id;

    if (showGameView) {
      this.host.tableContent.hide();
      this.host.flopPanel.show();
      this.host.playersPanel.show();
      this.host.handPanel.show();
      this.host.activityPanel.show();
      this.host.tableActions.show();
      this.host.layoutTablePanels();

      // Detect game type and render appropriately
      if (isUnoTable(table)) {
        this.renderUnoGameView(table);
      } else {
        this.renderPokerGameView(table);
      }

      this.host.updateTableActions();
      this.host.updateTopInfoBar();
      this.host.screen.render();
      return;
    }

    this.host.flopPanel.hide();
    this.host.playersPanel.hide();
    this.host.handPanel.hide();
    this.host.activityPanel.hide();
    this.host.tableActions.hide();
    this.host.tableContent.show();

    const contentWidth = Math.max(40, (this.host.tableContent as any).iwidth ?? 78);
    const gap = 2;
    const minLeftWidth = 24;
    const minRightWidth = 20;

    const leftLines: string[] = [];
    const rightLines: string[] = [];

    rightLines.push(`{${UI_THEME.accent}-fg}Table #${table.id}{/} - ${table.gameName}`);
    rightLines.push(`Stakes: ${table.stakesLabel}  Buy-in: ${table.buyIn}`);
    rightLines.push(`Status: ${table.status}  Players: ${table.players.filter((p) => p.role === 'player').length}/${table.maxPlayers}`);
    if (table.isPrivate && table.inviteCode) {
      rightLines.push(`Invite: ${table.inviteCode}`);
    }
    if (isObserver) {
      rightLines.push('Mode: Observer');
    }

    if (table.lastHand) {
      const winners = table.lastHand.winners.map((winner) => `${winner.username} (${winner.amount})`).join(', ');
      rightLines.push('');
      rightLines.push(`Last hand pot: ${table.lastHand.pot}`);
      rightLines.push(`Last winners: ${winners || 'TBD'}`);
    }

    rightLines.push('');
    rightLines.push('Seats:');
    const seated = table.players
      .filter((player) => player.role === 'player')
      .sort((a, b) => a.seat - b.seat);
    seated.forEach((player) => {
      const tag = isBotPlayer(player) ? '*' : ' ';
      const name = `${player.username}${tag}`.slice(0, 10);
      rightLines.push(`${pad(String(player.seat + 1), 2)} ${pad(name, 10)} ${pad(String(player.stack), 5)}`);
    });

    if (table.observers.length > 0) {
      rightLines.push('');
      rightLines.push(`Observers: ${table.observers.map((obs) => obs.username).join(', ')}`);
    }

    rightLines.push('');
    rightLines.push(`{${UI_THEME.accent}-fg}Actions{/}: ENTER Join  O Observe`);
    rightLines.push(`{${UI_THEME.accent}-fg}More{/}: C Create  R Refresh  F Filter`);
    rightLines.push(`{${UI_THEME.dim}-fg}Auto-deal starts when enough players are seated.{/}`);

    let lines: string[] = [];
    if (leftLines.length === 0) {
      lines = rightLines;
    } else {
      const maxLeftWidth = Math.max(minLeftWidth, ...leftLines.map(visibleWidth));
      const canUseColumns = maxLeftWidth + gap + minRightWidth <= contentWidth;
      if (canUseColumns) {
        const leftWidth = Math.min(maxLeftWidth, contentWidth - minRightWidth - gap);
        const rightWidth = Math.max(minRightWidth, contentWidth - leftWidth - gap);
        lines = mergeColumns(leftLines, rightLines, leftWidth, rightWidth, gap);
      } else {
        lines = [...leftLines, '', ...rightLines];
      }
    }
    this.host.tableContent.setContent(lines.join('\n'));
    this.host.tableContent.resetScroll();
    this.host.updateTableActions();
    this.host.screen.render();
  }

  renderPokerGameView(table: LobbyTable): void {
    const flopInnerHeight = Math.max(0, Number(this.host.flopPanel.height) - 2);
    const handInnerHeight = Math.max(0, Number(this.host.handPanel.height) - 2);
    const flopCardSize = flopInnerHeight >= 7 ? 'full' : 'mini';
    const handCardSize = handInnerHeight >= 7 ? 'full' : 'mini';

    const handState = this.host.loadTableHand(table);
    const boardCards = handState
      ? pokerCardsToCards(handState.engine.state.board)
      : pokerCardsToCards(table.lastHand?.board ?? []);

    const playerSeat = handState?.engine.state.players.find((seat) => seat?.id === this.host.currentProfile?.userId);
    const playerHand = pokerCardsToCards(
      playerSeat?.hand ?? (this.host.currentProfile ? table.lastHand?.hands[this.host.currentProfile.userId] : undefined) ?? [],
    );

    const handStartedAt = table.hand?.startedAt ?? null;
    const shouldAnimate = Boolean(
      handState &&
      handStartedAt &&
      handStartedAt !== this.host.lastAnimatedHandStartedAt &&
      !this.host.dealAnimationInProgress,
    );

    if (shouldAnimate) {
      this.host.lastAnimatedHandStartedAt = handStartedAt;
      void this.host.runDealAnimation(boardCards, playerHand, flopCardSize, handCardSize);
    } else if (!this.host.dealAnimationInProgress) {
      this.host.renderBoardAndHand(boardCards, playerHand, flopCardSize, handCardSize, Boolean(handState));
    }

    const seated = table.players
      .filter((player) => player.role === 'player')
      .sort((a, b) => a.seat - b.seat);
    const playersWidth = Math.max(20, Number(this.host.playersPanel.width) - 2);
    const seatWidth = 2;
    const stackWidth = Math.min(8, Math.max(5, Math.floor(playersWidth * 0.35)));
    const nameWidth = Math.max(8, playersWidth - seatWidth - stackWidth - 2);
    const playersLines = seated.map((player) => {
      const tag = isBotPlayer(player) ? '*' : ' ';
      const name = `${player.username}${tag}`.slice(0, nameWidth);
      const nameValue = padColumn(`{cyan-fg}${name}{/}`, nameWidth);
      const stackValue = padColumn(`{yellow-fg}${player.stack}{/}`, stackWidth);
      return `${pad(String(player.seat + 1), seatWidth)} ${nameValue} ${stackValue}`;
    });

    if (playersLines.length === 0) {
      playersLines.push('No players seated.');
    }
    this.host.playersContent.setContent(playersLines.join('\n'));
    this.host.playersContent.resetScroll();

    this.host.updateActivityPanel(table, handState?.engine ?? null);
  }

  renderUnoGameView(table: LobbyTable): void {
    const gameState = this.host.loadUnoGameState(table);

    if (!gameState) {
      // No active game - show waiting message
      this.host.flopContent.setContent('Waiting for game to start...');
      this.host.playersContent.setContent('No active UNO game.');
      // The KEY, not a button nobody can find: there is no DEAL control on
      // this screen, and the sysop had to guess D by trying letters
      // (2026-09-02).
      this.host.handContent.setContent('Press {cyan-fg}D{/} to deal.');
      this.host.activityContent.setContent('');
      return;
    }

    const engine = gameState.engine;
    const state = engine.getGameState();

    // Render discard pile (top card + color + direction)
    const topCard = state.discardPile[state.discardPile.length - 1] || null;
    this.host.uiManager.renderUnoDiscardPile(topCard, state.currentColor, state.direction);

    // Render player status (all players with card counts)
    const currentPlayer = engine.getCurrentPlayer();
    const currentPlayerIndex = state.currentPlayerIndex;
    this.host.uiManager.renderUnoPlayerStatus(state.players, currentPlayerIndex, this.host.currentProfile?.userId || '');

    // Render player's hand (with playable indicators)
    const player = state.players.find(p => p.id === this.host.currentProfile?.userId);
    if (player) {
      const playableIndices = engine.getPlayableCards(player.id);
      const selectedIndex = this.host.selectedUnoCardIndex ?? null;
      this.host.uiManager.renderUnoHand(player.hand, playableIndices, selectedIndex);
    } else {
      this.host.handContent.setContent('Observing game...');
    }

    // Render activity/events
    this.host.uiManager.renderUnoActivity(state.lastAction, state.challengeWindow);
  }
}
