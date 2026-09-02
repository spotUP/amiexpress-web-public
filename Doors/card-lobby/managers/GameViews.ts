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
import { type LobbyTable, type PlayerProfile, isBotPlayer, pad, padColumn } from '../lib';
import type { UIManager } from './UIManager';

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
}

export class GameViews {
  constructor(private host: GameViewHost) {}

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
