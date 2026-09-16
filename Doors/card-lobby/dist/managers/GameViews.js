"use strict";
/**
 * Card Lobby - painting a table for the game it is running
 *
 * Poker and UNO put different things in the same four panels: a board and a
 * pot, or a discard pile, a colour and everybody's card counts. The panels
 * belong to UIManager; choosing what goes in them for this game belongs
 * here, out of a 2808-line index.ts that had never been type checked.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameViews = void 0;
const uno_engine_1 = require("../lib/uno-engine");
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const lib_1 = require("../lib");
const games_1 = require("../lib/games");
const constants_1 = require("../lib/constants");
/** The stand-in for a card the caller is not allowed to see. */
const HIDDEN_CARD = { rank: 'A', suit: 'S' };
/** A card nobody may look at: only its back is ever drawn. */
const blind = () => ({ kind: 'standard', card: HIDDEN_CARD, face: 'back' });
/**
 * The piles in front of a Skitgubbe player, one per blind card.
 *
 * Paired by position: the open card sits on the blind one it was dealt onto.
 * Play the open card and the pile is a back on its own - which is exactly
 * what it is, since the blind cards are played last of all.
 */
function tableStacks(me) {
    const faceUp = me?.faceUp ?? [];
    const faceDown = me?.faceDown ?? [];
    const piles = Math.max(faceUp.length, faceDown.length);
    const stacks = [];
    for (let index = 0; index < piles; index += 1) {
        const open = faceUp[index];
        const hidden = faceDown[index];
        if (open) {
            stacks.push({ kind: 'standard', card: open, ...(hidden ? { under: blind() } : {}) });
        }
        else if (hidden) {
            stacks.push(blind());
        }
    }
    return stacks;
}
class GameViews {
    constructor(host) {
        this.host = host;
    }
    updateTablePanel() {
        if (!this.host.lobby || !this.host.currentProfile)
            return;
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
                `{${constants_1.UI_THEME.accent}-fg}Quick start{/}:`,
                '',
                // One key per line: the panel is 52 columns wide at 80x25 and a
                // single sentence naming all three ran off the right edge.
                `  {${constants_1.UI_THEME.accent}-fg}C{/}      create a table`,
                `  {${constants_1.UI_THEME.accent}-fg}ENTER{/}  join the highlighted table`,
                `  {${constants_1.UI_THEME.accent}-fg}O{/}      observe it`,
                `  {${constants_1.UI_THEME.accent}-fg}R{/}      refresh the lobby`,
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
            this.host.tableContent.setContent(`Table not found. Press {${constants_1.UI_THEME.accent}-fg}R{/} to refresh the lobby.`);
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
            }
            else {
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
        const contentWidth = Math.max(40, this.host.tableContent.iwidth ?? 78);
        const gap = 2;
        const minLeftWidth = 24;
        const minRightWidth = 20;
        const leftLines = [];
        const rightLines = [];
        rightLines.push(`{${constants_1.UI_THEME.accent}-fg}Table #${table.id}{/} - ${table.gameName}`);
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
            const tag = (0, lib_1.isBotPlayer)(player) ? '*' : ' ';
            const name = `${player.username}${tag}`.slice(0, 10);
            rightLines.push(`${(0, lib_1.pad)(String(player.seat + 1), 2)} ${(0, lib_1.pad)(name, 10)} ${(0, lib_1.pad)(String(player.stack), 5)}`);
        });
        if (table.observers.length > 0) {
            rightLines.push('');
            rightLines.push(`Observers: ${table.observers.map((obs) => obs.username).join(', ')}`);
        }
        rightLines.push('');
        rightLines.push(`{${constants_1.UI_THEME.accent}-fg}Actions{/}: ENTER Join  O Observe`);
        rightLines.push(`{${constants_1.UI_THEME.accent}-fg}More{/}: C Create  R Refresh  F Filter`);
        rightLines.push(`{${constants_1.UI_THEME.dim}-fg}Auto-deal starts when enough players are seated.{/}`);
        let lines = [];
        if (leftLines.length === 0) {
            lines = rightLines;
        }
        else {
            const maxLeftWidth = Math.max(minLeftWidth, ...leftLines.map(lib_1.visibleWidth));
            const canUseColumns = maxLeftWidth + gap + minRightWidth <= contentWidth;
            if (canUseColumns) {
                const leftWidth = Math.min(maxLeftWidth, contentWidth - minRightWidth - gap);
                const rightWidth = Math.max(minRightWidth, contentWidth - leftWidth - gap);
                lines = (0, lib_1.mergeColumns)(leftLines, rightLines, leftWidth, rightWidth, gap);
            }
            else {
                lines = [...leftLines, '', ...rightLines];
            }
        }
        this.host.tableContent.setContent(lines.join('\n'));
        this.host.tableContent.resetScroll();
        this.host.updateTableActions();
        this.host.screen.render();
    }
    renderPokerGameView(table) {
        const flopInnerHeight = Math.max(0, Number(this.host.flopPanel.height) - 2);
        const handInnerHeight = Math.max(0, Number(this.host.handPanel.height) - 2);
        const flopCardSize = flopInnerHeight >= 7 ? 'full' : 'mini';
        const handCardSize = handInnerHeight >= 7 ? 'full' : 'mini';
        const handState = this.host.loadTableHand(table);
        const boardCards = handState
            ? (0, bbs_door_sdk_1.pokerCardsToCards)(handState.engine.state.board)
            : (0, bbs_door_sdk_1.pokerCardsToCards)(table.lastHand?.board ?? []);
        const playerSeat = handState?.engine.state.players.find((seat) => seat?.id === this.host.currentProfile?.userId);
        const playerHand = (0, bbs_door_sdk_1.pokerCardsToCards)(playerSeat?.hand ?? (this.host.currentProfile ? table.lastHand?.hands[this.host.currentProfile.userId] : undefined) ?? []);
        const handStartedAt = table.hand?.startedAt ?? null;
        const shouldAnimate = Boolean(handState &&
            handStartedAt &&
            handStartedAt !== this.host.lastAnimatedHandStartedAt &&
            !this.host.dealAnimationInProgress);
        if (shouldAnimate) {
            this.host.lastAnimatedHandStartedAt = handStartedAt;
            void this.host.runDealAnimation(boardCards, playerHand, flopCardSize, handCardSize);
        }
        else if (!this.host.dealAnimationInProgress) {
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
            const tag = (0, lib_1.isBotPlayer)(player) ? '*' : ' ';
            const name = `${player.username}${tag}`.slice(0, nameWidth);
            const nameValue = (0, lib_1.padColumn)(`{cyan-fg}${name}{/}`, nameWidth);
            const stackValue = (0, lib_1.padColumn)(`{yellow-fg}${player.stack}{/}`, stackWidth);
            return `${(0, lib_1.pad)(String(player.seat + 1), seatWidth)} ${nameValue} ${stackValue}`;
        });
        if (playersLines.length === 0) {
            playersLines.push('No players seated.');
        }
        this.host.playersContent.setContent(playersLines.join('\n'));
        this.host.playersContent.resetScroll();
        this.host.updateActivityPanel(table, handState?.engine ?? null);
    }
    renderUnoGameView(table) {
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
            /*
             * TRANSLATED, exactly as the text path translates. These cards go to
             * the SDK's renderer, which spells the action cards `skip`/`draw2`/
             * `wild4`; handing it this engine's `Skip` drew "Gundef" on the card
             * (sysop, 2026-09-16). A value the renderer cannot draw is left as it
             * was rather than dropped - a card missing from a hand is worse than a
             * card drawn plainly.
             */
            this.host.cardButtons.render(player.hand.map((card) => ({
                kind: 'uno',
                card: (0, uno_engine_1.toEngineUnoCard)(card) ?? card,
            })), {
                selected: selectedIndex,
                playable: playableIndices,
                onFocus: (index) => this.host.selectUnoCard(index),
                onPick: (index) => this.host.selectUnoCard(index),
            });
        }
        else {
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
    renderSkitgubbeGameView(table) {
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
        this.host.renderBoardAndHand(state.table, (me?.hand ?? []), 'auto', 'auto', true);
        // Who is where, and how much they are still carrying. In phase one the
        // pile in front of a player is what they have WON and will have to shed,
        // which is the number that actually matters.
        const lines = [];
        lines.push(state.phase === 'tricks'
            ? '{cyan-fg}Phase 1{/} - win tricks'
            : state.phase === 'shedding'
                ? '{cyan-fg}Phase 2{/} - get rid of them'
                : '{cyan-fg}Game over{/}');
        lines.push(state.trump ? `Trumps: {yellow-fg}${games_1.SUIT_NAMES[state.trump]}{/}` : 'Trumps: not turned yet');
        if (state.phase === 'tricks')
            lines.push(`Stock: ${state.stock.length}`);
        lines.push('');
        for (const player of state.players) {
            const marker = player.id === onTurn ? '{green-fg}>{/}' : ' ';
            const carrying = state.phase === 'tricks' ? player.won.length : player.hand.length;
            const label = player.out ? 'OUT' : `${carrying}`;
            const name = `${player.name}${player.isBot ? '*' : ''}`.slice(0, 12);
            lines.push(`${marker} ${(0, lib_1.pad)(name, 12)} ${(0, lib_1.pad)(label, 4)}`);
        }
        this.host.playersContent.setContent(lines.join('\n'));
        // The legend does the teaching: which keys are live right now, and which
        // cards in hand can legally be played.
        const activity = [state.lastAction];
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
        }
        else if (state.phase !== 'over') {
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
    renderPatienceGameView(table) {
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
        const label = (pile) => `${pile.type === 'tableau' ? 'T' : pile.type === 'foundation' ? 'F'
            : pile.type === 'cell' ? 'C' : pile.type === 'waste' ? 'W' : 'S'}${pile.index + 1}`;
        const board = [];
        const hand = [];
        piles.forEach((pile, index) => {
            const number = index + 1;
            const marker = pile.id === picked ? '{yellow-bg}{black-fg}' : '{green-fg}';
            const cards = pile.cards.length === 0
                ? `{${constants_1.UI_THEME.dim}-fg}-{/}`
                : pile.cards
                    .slice(-6)
                    .map((card) => (card.faceUp ? `${card.rank}${card.suit}` : '##'))
                    .join(' ');
            const hidden = pile.cards.length > 6 ? `{${constants_1.UI_THEME.dim}-fg}+${pile.cards.length - 6}{/} ` : '';
            const line = `${marker}[${number}]{/} ${(0, lib_1.pad)(label(pile), 3)} ${hidden}${cards}`;
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
    /**
     * Where a dragged card was let go - asked of BOTH rows.
     *
     * The row that owns the drag reports coordinates rather than an index,
     * because the card being dragged travels under the pointer and would answer
     * its own hit test. Whichever row has a card at that point takes the drop;
     * a drag that ends over nothing simply puts the card down where it was.
     */
    dropSwapAt(from, x, y) {
        const hand = this.host.cardButtons.indexAt(x, y, from === 'hand'
            ? this.host.cardButtons.dragging ?? undefined
            : undefined);
        if (hand !== null) {
            this.host.vandtia.dropOn('hand', hand);
            return;
        }
        const table = this.host.tableCardButtons.indexAt(x, y, from === 'table'
            ? this.host.tableCardButtons.dragging ?? undefined
            : undefined);
        if (table !== null) {
            this.host.vandtia.dropOn('table', table);
            return;
        }
        this.host.vandtia.releaseHeld();
    }
    renderVandtiaGameView(table) {
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
        this.host.renderBoardAndHand([], showing, 'auto', 'auto', true);
        /*
         * The top THREE of the pile, not the top one: a player who will not beat
         * the top card takes only that card, so what lies under it is the next
         * player's problem and worth reading before deciding.
         */
        /*
         * DURING THE SWAP, THE UPPER PANEL IS YOUR TABLE CARDS.
         *
         * "it's very hard to swap cards at the start of the skitgubbe game still
         * i need to see both card rows with open side up and select witch cards
         * two switch" (sysop, 2026-09-16). It was hard because the door asked for
         * a card it never showed: the swap is 1-3 for a hand card and 4-6 for the
         * table card it changes places with, and 4-6 pointed at three cards that
         * were nowhere on screen - the upper panel was holding the pile, which
         * during a swap is empty.
         *
         * So while the swap is on, the panel that has nothing to say lends itself
         * to the half of the caller's cards that had nowhere to go. Both rows are
         * face up, numbered the way the keys are, and either can be CLICKED -
         * which is the part that makes it easy rather than merely possible.
         */
        const top3 = swapping ? (me?.faceUp ?? []) : state.pile.slice(-3);
        const drewPile = this.host.tableCardButtons.renderStandard(top3, {
            selected: null,
            /*
             * DURING THE SWAP this row is the caller's OWN table cards, numbered
             * 4-6 and pickable; the rest of the time it is the pile, which is read
             * rather than picked.
             */
            playable: swapping ? (me?.faceUp ?? []).map((_, index) => index) : [],
            labels: swapping,
            labelFrom: swapping ? 4 : 1,
            /*
             * While arranging, this row shows the cursor - and the card being
             * carried, if it is up here. A held card is LIFTED, which is the same
             * signal a picked card gives everywhere else in this door.
             */
            ...(swapping ? {
                selected: this.host.vandtia.swapCursor.row === 'table'
                    ? this.host.vandtia.swapCursor.index
                    : null,
            } : {}),
            // A PILE, not three cards: each one lying on the last, all faces up,
            // the top card on top. "make them look like the pile in front of me
            // but with all cards open" (sysop, 2026-09-15).
            pile: !swapping,
            onPick: (index) => {
                if (swapping)
                    this.host.vandtia.selectCard(index + 3);
            },
            // Drag and drop, during the swap: pick a card up here, drop it on
            // either row. The same hold the keyboard sets, so a gesture can start
            // with the mouse and finish with the arrows.
            onGrab: swapping ? (index) => this.host.vandtia.grabAt('table', index) : undefined,
            onDrop: swapping ? (index) => this.host.vandtia.dropOn('table', index) : undefined,
            onDropAt: swapping ? (x, y) => this.dropSwapAt('table', x, y) : undefined,
        });
        /*
         * THE PANEL'S TEXT IS ALWAYS THIS GAME'S, drawn or not.
         *
         * It used to be written only when the card widgets declined, and
         * `renderBoardAndHand` above had already put POKER's "Board not dealt
         * yet." there - so a Skitgubbe pile that did draw left that sentence
         * underneath it, ready to appear the moment the panel got too small.
         *
         * And during the SWAP there is no pile to lead: "it says the pile is
         * empty but we are playing" (sysop, 2026-09-16). True, and useless - the
         * game has not started, the cards are being arranged. The panel says
         * which half of the game the caller is in.
         */
        this.host.flopContent.setContent(swapping
            ? `{${constants_1.UI_THEME.accent}-fg}Swap any card you like.{/}\n`
                + `{${constants_1.UI_THEME.dim}-fg}Pick one of yours, then the table card it changes places with.{/}`
            : top3.length > 0
                ? `{${constants_1.UI_THEME.accent}-fg}Pile{/} ${state.pile.length}   `
                    + `{${constants_1.UI_THEME.dim}-fg}Stock ${state.stock.length}{/}\n`
                    + top3.map((card) => `${card.rank}${card.suit}`).join('  ')
                : `The pile is empty - lead anything.\n{${constants_1.UI_THEME.dim}-fg}Stock ${state.stock.length}{/}`);
        void drewPile;
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
            : showing.map((card) => ({ kind: 'standard', card }));
        this.host.cardButtons.render(entries, {
            selected: showingTable ? null
                : swapping
                    ? (this.host.vandtia.swapCursor.row === 'hand'
                        ? this.host.vandtia.swapCursor.index
                        : this.host.vandtia.selectedHandIndex)
                    : this.host.vandtia.selectedCardIndex,
            playable: showingTable ? []
                : swapping ? (me?.hand ?? []).map((_, index) => index)
                    : loaded.engine.legalPlays(meId),
            faceDown: blind,
            labels: !showingTable,
            onFocus: (index) => { if (!showingTable)
                this.host.vandtia.selectCard(index); },
            onGrab: swapping ? (index) => this.host.vandtia.grabAt('hand', index) : undefined,
            onDrop: swapping ? (index) => this.host.vandtia.dropOn('hand', index) : undefined,
            onDropAt: swapping ? (x, y) => this.dropSwapAt('hand', x, y) : undefined,
            onPick: (index) => {
                if (showingTable)
                    return;
                this.host.vandtia.selectCard(index);
                // A click is the whole move at a table: pick it and play it. During
                // the swap it only picks, because the second half of a swap is the
                // table card you trade it with.
                if (!swapping && loaded.engine.currentPlayerId() === meId) {
                    this.host.vandtia.primaryAction();
                }
            },
        });
        const lines = [];
        lines.push(swapping
            ? `{cyan-fg}SWAP{/}  Stock ${state.stock.length}`
            : `{cyan-fg}Pile ${state.pile.length}{/}  Stock ${state.stock.length}  Burn ${state.burned.length}`);
        lines.push(`{${constants_1.UI_THEME.dim}-fg}            hnd up dn{/}`);
        for (const player of state.players) {
            const marker = player.id === onTurn && !swapping ? '{green-fg}>{/}' : ' ';
            const name = `${player.name}${player.isBot ? '*' : ''}`.slice(0, 9);
            const tag = player.out ? ' out' : swapping && player.ready ? ' ok' : '';
            lines.push(`${marker}${(0, lib_1.pad)(name, 10)}${(0, lib_1.pad)(String(player.hand.length), 4)}`
                + `${(0, lib_1.pad)(String(player.faceUp.length), 3)}${(0, lib_1.pad)(String(player.faceDown.length), 3)}${tag}`);
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
exports.GameViews = GameViews;
