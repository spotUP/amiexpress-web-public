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
import { type LobbyTable, type PlayerProfile, isBotPlayer, pad, padColumn, mergeColumns, visibleWidth } from '../lib';
import { SUIT_NAMES, type TableGameModule, type SkitgubbeGameModule, type VandtiaGameModule, type PatienceGameModule } from '../lib/games';

/*
 * What every game passes to the shared card renderer is the renderer's OWN
 * type, imported. This file used to declare a structural copy of it, so a
 * new option - `pile`, and `face` before it - typechecked in CardButtons and
 * was rejected at the call site here for not existing.
 */
import type { CardButtonOptions as CardButtonArgs, PlayableCard } from './CardButtons';

import type { UIManager } from './UIManager';
import { UI_THEME } from '../lib/constants';

/** The stand-in for a card the caller is not allowed to see. */
const HIDDEN_CARD = { rank: 'A', suit: 'S' } as const;

/** A card nobody may look at: only its back is ever drawn. */
const blind = () => ({ kind: 'standard' as const, card: HIDDEN_CARD as any, face: 'back' as const });

/**
 * The piles in front of a Skitgubbe player, one per blind card.
 *
 * Paired by position: the open card sits on the blind one it was dealt onto.
 * Play the open card and the pile is a back on its own - which is exactly
 * what it is, since the blind cards are played last of all.
 */
function tableStacks(me: any): any[] {
  const faceUp = me?.faceUp ?? [];
  const faceDown = me?.faceDown ?? [];
  const piles = Math.max(faceUp.length, faceDown.length);
  const stacks: any[] = [];
  for (let index = 0; index < piles; index += 1) {
    const open = faceUp[index];
    const hidden = faceDown[index];
    if (open) {
      stacks.push({ kind: 'standard' as const, card: open, ...(hidden ? { under: blind() } : {}) });
    } else if (hidden) {
      stacks.push(blind());
    }
  }
  return stacks;
}

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
  selectUnoCard(index: number): void;
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
  gameModuleFor(table: LobbyTable): TableGameModule | undefined;
  readonly skitgubbe: SkitgubbeGameModule;
  readonly vandtia: VandtiaGameModule;
  readonly patience: PatienceGameModule;
  readonly cardButtons: {
    render(cards: PlayableCard[], options: CardButtonArgs): boolean;
    renderStandard(cards: unknown[], options: CardButtonArgs): boolean;
    clear(): void;
  };
  /** The caller's own row of cards on the table, where a game has one. */
  readonly tableCardButtons: {
    renderStandard(cards: unknown[], options: CardButtonArgs): boolean;
    clear(): void;
  };
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

      // Each game paints its own panels, through the registry rather than a
      // chain of "is this UNO?" (lib/games/types.ts).
      const module = this.host.gameModuleFor(table);
      if (module) {
        // Name the panels before filling them, so a game never draws under
        // another game's heading.
        this.host.uiManager.setPanelTitles(module.panelTitles?.(table) ?? {});
        module.render(this, table);
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

      /*
       * ...and the same hand as WIDGETS on top, so UNO's cards can be
       * clicked and tabbed to and the picked one stands proud, exactly as
       * Skitgubbe's do: "this goes for all card games dont [do] changes for
       * only one game" (sysop, 2026-09-15). It falls back to the text the
       * line above drew whenever the panel cannot hold card art.
       */
      this.host.cardButtons.render(
        player.hand.map((card: { color: string; value: string }) => ({ kind: 'uno' as const, card })),
        {
          selected: selectedIndex,
          playable: playableIndices,
          onFocus: (index: number) => this.host.selectUnoCard(index),
          onPick: (index: number) => this.host.selectUnoCard(index),
        },
      );
    } else {
      this.host.handContent.setContent('Observing game...');
    }

    // Render activity/events
    this.host.uiManager.renderUnoActivity(state.lastAction, state.challengeWindow);
  }

  /**
   * SKITGUBBE in the same four panels.
   *
   * The cards are an ordinary pack, so this borrows poker's card painter
   * whole (`renderBoardAndHand`): the trick on the table goes where the
   * board goes, and the caller's hand where a hand goes. What is left is the
   * part that is peculiar to this game - which phase it is, what trumps are,
   * how deep the stock still is, and who is about to be stuck with the lot.
   */
  renderSkitgubbeGameView(table: LobbyTable): void {
    const loaded = this.host.skitgubbe.load(table);
    if (!loaded) {
      this.host.flopContent.setContent('Waiting for a game to start...');
      this.host.playersContent.setContent('No Skitgubbe game.');
      this.host.handContent.setContent('Press {cyan-fg}D{/} to deal.');
      this.host.activityContent.setContent('');
      return;
    }

    const state = loaded.engine.state;
    const meId = this.host.currentProfile?.userId ?? '';
    const me = state.players.find((player) => player.id === meId);
    const onTurn = loaded.engine.currentPlayerId();

    this.host.renderBoardAndHand(
      state.table as any,
      (me?.hand ?? []) as any,
      'auto',
      'auto',
      true,
    );

    // Who is where, and how much they are still carrying. In phase one the
    // pile in front of a player is what they have WON and will have to shed,
    // which is the number that actually matters.
    const lines: string[] = [];
    lines.push(state.phase === 'tricks'
      ? '{cyan-fg}Phase 1{/} - win tricks'
      : state.phase === 'shedding'
        ? '{cyan-fg}Phase 2{/} - get rid of them'
        : '{cyan-fg}Game over{/}');
    lines.push(state.trump ? `Trumps: {yellow-fg}${SUIT_NAMES[state.trump]}{/}` : 'Trumps: not turned yet');
    if (state.phase === 'tricks') lines.push(`Stock: ${state.stock.length}`);
    lines.push('');

    for (const player of state.players) {
      const marker = player.id === onTurn ? '{green-fg}>{/}' : ' ';
      const carrying = state.phase === 'tricks' ? player.won.length : player.hand.length;
      const label = player.out ? 'OUT' : `${carrying}`;
      const name = `${player.name}${player.isBot ? '*' : ''}`.slice(0, 12);
      lines.push(`${marker} ${pad(name, 12)} ${pad(label, 4)}`);
    }
    this.host.playersContent.setContent(lines.join('\n'));

    // The legend does the teaching: which keys are live right now, and which
    // cards in hand can legally be played.
    const activity: string[] = [state.lastAction];
    if (state.phase !== 'over' && me && onTurn === meId) {
      const legal = loaded.engine.legalPlays(meId);
      const selected = this.host.skitgubbe.selectedCardIndex;
      const keys = legal.map((index) => {
        const label = index === 9 ? '0' : String(index + 1);
        return index === selected ? `{yellow-bg}{black-fg}[${label}]{/}{/}` : `{green-fg}[${label}]{/}`;
      });
      activity.push('');
      activity.push(keys.length > 0 ? `Playable: ${keys.join(' ')}` : 'Nothing in hand beats it.');
      activity.push(loaded.engine.canTake(meId)
        ? 'X plays the picked card - or C takes the card in front of you.'
        : 'Pick a card with its number, then X to play it.');
    } else if (state.phase !== 'over') {
      activity.push('');
      activity.push('Waiting for the other players...');
    }
    this.host.activityContent.setContent(activity.join('\n'));
  }

  /**
   * PATIENCE in the four panels.
   *
   * A solitaire wants a whole board and this screen has four boxes, so the
   * board is TEXT: one line per pile, numbered in the order the keys name
   * them, with the cards that matter on each. A tableau shows its run, a
   * foundation its top card, the stock and waste their counts. That reads at
   * eighty columns and at forty, which card art for eleven piles does not.
   */
  renderPatienceGameView(table: LobbyTable): void {
    const engine = this.host.patience.load(table);
    if (!engine) {
      this.host.flopContent.setContent('Press {cyan-fg}D{/} to deal.');
      this.host.playersContent.setContent('');
      this.host.handContent.setContent('');
      this.host.cardButtons.clear();
      this.host.tableCardButtons.clear();
      return;
    }

    // The card widgets belong to the games that deal a hand; this board is
    // drawn as text, and leaving them up would scatter cards over it.
    this.host.cardButtons.clear();
    this.host.tableCardButtons.clear();

    const piles = this.host.patience.boardOrder(engine);
    const picked = this.host.patience.selectedPileId;
    const label = (pile: { type: string; index: number }): string =>
      `${pile.type === 'tableau' ? 'T' : pile.type === 'foundation' ? 'F'
        : pile.type === 'cell' ? 'C' : pile.type === 'waste' ? 'W' : 'S'}${pile.index + 1}`;

    const board: string[] = [];
    const hand: string[] = [];
    piles.forEach((pile, index) => {
      const number = index + 1;
      const marker = pile.id === picked ? '{yellow-bg}{black-fg}' : '{green-fg}';
      const cards = pile.cards.length === 0
        ? `{${UI_THEME.dim}-fg}-{/}`
        : pile.cards
          .slice(-6)
          .map((card) => (card.faceUp ? `${card.rank}${card.suit}` : '##'))
          .join(' ');
      const hidden = pile.cards.length > 6 ? `{${UI_THEME.dim}-fg}+${pile.cards.length - 6}{/} ` : '';
      const line = `${marker}[${number}]{/} ${pad(label(pile), 3)} ${hidden}${cards}`;
      (pile.type === 'tableau' ? hand : board).push(line);
    });

    this.host.flopContent.setContent(board.join('\n'));
    this.host.handContent.setContent(hand.join('\n'));
    this.host.playersContent.setContent([
      `{cyan-fg}${engine.state.title}{/}`,
      `Moves ${engine.state.moves}`,
      engine.state.won ? '{green-fg}Out!{/}' : '',
    ].filter(Boolean).join('\n'));
  }

  /**
   * SKITGUBBE (vändtia) in the four panels.
   *
   * Three stacks per player and one pile in the middle, so the panels say:
   * the pile where the board goes, whatever the caller is playing FROM where
   * a hand goes, and - the part that is peculiar to this game - how many
   * cards each player still has in each of their three places, because that
   * is the whole state of the race.
   */
  renderVandtiaGameView(table: LobbyTable): void {
    const loaded = this.host.vandtia.load(table);
    if (!loaded) {
      this.host.flopContent.setContent('Waiting for a game to start...');
      this.host.playersContent.setContent('No Skitgubbe game.');
      this.host.handContent.setContent('Press {cyan-fg}D{/} to deal.');
      this.host.cardButtons.clear();
      this.host.tableCardButtons.clear();
      return;
    }

    const state = loaded.engine.state;
    const meId = this.host.currentProfile?.userId ?? '';
    const me = state.players.find((player) => player.id === meId);
    const onTurn = loaded.engine.currentPlayerId();
    const swapping = state.phase === 'swap';

    /*
     * TWO PANELS, TWO JOBS.
     *
     * The upper one is the middle of the table - the pile and the stock -
     * and stays that way whatever the phase. The lower one is the caller's,
     * and they have two lots of cards: the hand, and the six in front of
     * them. `V` flips the lower panel between those two
     * (VandtiaGameModule.handView), so the table cards are not on screen
     * until they are asked for - or until the hand runs out and they BECOME
     * the cards being played. "add V to flip between my hand and my cards on
     * the table. the upper panel shows stack and pile" (sysop, 2026-09-15).
     */
    const showingTable = this.host.vandtia.handView === 'table';
    // A card nobody may see. Only its BACK is ever drawn, so which card it
    // claims to be does not matter - but it has to be a card, because the
    // text fallback below draws whatever it is handed.
    const faceDownBacks = (me?.faceDown ?? []).map(() => HIDDEN_CARD);
    const own = [...(me?.faceUp ?? []), ...faceDownBacks];
    const inPlay = swapping ? (me?.hand ?? []) : loaded.engine.cardsInPlay(meId);
    const showing = showingTable ? own : inPlay;
    const blind = !showingTable && !swapping && loaded.engine.sourceFor(meId) === 'faceDown';

    // The text fallback for both panels; the widgets below cover it when the
    // panel can hold card art.
    this.host.renderBoardAndHand([] as any, showing as any, 'auto', 'auto', true);

    /*
     * The top THREE of the pile, not the top one: a player who will not beat
     * the top card takes only that card, so what lies under it is the next
     * player's problem and worth reading before deciding.
     */
    const top3 = state.pile.slice(-3);
    const drewPile = this.host.tableCardButtons.renderStandard(top3 as any, {
      selected: null,
      playable: [],
      labels: false,
      // A PILE, not three cards: each one lying on the last, all faces up,
      // the top card on top. "make them look like the pile in front of me
      // but with all cards open" (sysop, 2026-09-15).
      pile: true,
      onPick: () => { /* the pile is read, not picked */ },
    });
    if (!drewPile) {
      this.host.flopContent.setContent(top3.length > 0
        ? `{${UI_THEME.accent}-fg}Pile{/} ${state.pile.length}   `
          + `{${UI_THEME.dim}-fg}Stock ${state.stock.length}{/}\n`
          + top3.map((card) => `${card.rank}${card.suit}`).join('  ')
        : `The pile is empty - lead anything.\n{${UI_THEME.dim}-fg}Stock ${state.stock.length}{/}`);
    }

    // The caller's own cards, as widgets: clickable, focusable, and lit when
    // picked. The six in front of them are shown rather than played from -
    // the moment they become playable they are what `cardsInPlay` returns.
    /*
     * THREE PILES, NOT SIX CARDS. "there is 3 cards in front of me, backside
     * up, they are blind and on top of those there are 3 cards that are
     * open, you put 6 open cards next to each other" (sysop, 2026-09-15).
     * Each pile is a blind card with an open one lying on it, and the blind
     * ones are the LAST cards you play - so when the open card goes, the
     * pile is still there with its back showing.
     */
    const entries = showingTable
      ? tableStacks(me)
      : (showing as any[]).map((card) => ({ kind: 'standard' as const, card }));

    this.host.cardButtons.render(entries, {
      selected: showingTable ? null
        : swapping ? this.host.vandtia.selectedHandIndex : this.host.vandtia.selectedCardIndex,
      playable: showingTable ? []
        : swapping ? (me?.hand ?? []).map((_, index) => index)
          : loaded.engine.legalPlays(meId),
      faceDown: blind,
      labels: !showingTable,
      onFocus: (index: number) => { if (!showingTable) this.host.vandtia.selectCard(index); },
      onPick: (index: number) => {
        if (showingTable) return;
        this.host.vandtia.selectCard(index);
        // A click is the whole move at a table: pick it and play it. During
        // the swap it only picks, because the second half of a swap is the
        // table card you trade it with.
        if (!swapping && loaded.engine.currentPlayerId() === meId) {
          this.host.vandtia.primaryAction();
        }
      },
    });

    const lines: string[] = [];
    lines.push(swapping
      ? `{cyan-fg}SWAP{/}  Stock ${state.stock.length}`
      : `{cyan-fg}Pile ${state.pile.length}{/}  Stock ${state.stock.length}  Burn ${state.burned.length}`);
    lines.push(`{${UI_THEME.dim}-fg}            hnd up dn{/}`);

    for (const player of state.players) {
      const marker = player.id === onTurn && !swapping ? '{green-fg}>{/}' : ' ';
      const name = `${player.name}${player.isBot ? '*' : ''}`.slice(0, 9);
      const tag = player.out ? ' out' : swapping && player.ready ? ' ok' : '';
      lines.push(`${marker}${pad(name, 10)}${pad(String(player.hand.length), 4)}`
        + `${pad(String(player.faceUp.length), 3)}${pad(String(player.faceDown.length), 3)}${tag}`);
    }
    this.host.playersContent.setContent(lines.join('\n'));

    /*
     * The activity panel is NOT written here. `updateActivityPanel` owns it
     * and runs after this, so anything set on the widget from a renderer is
     * wiped inside the same frame - which is what happened to this game's
     * key legend twice (2026-09-15). The legend comes from
     * `VandtiaGameModule.activityLines`, which that painter asks for.
     */
  }
}
