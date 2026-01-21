"use strict";
/**
 * UNO Game Engine
 * Core game logic for UNO (Standard and House Rules variants)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnoGameEngine = void 0;
// ============================================================================
// CARD UTILITIES
// ============================================================================
function createCard(id) {
    // Parse card ID (e.g., "R5", "W4", "GSkip", "HR1")
    if (id.startsWith('HR')) {
        return { color: 'W', value: id, id };
    }
    if (id.startsWith('W')) {
        if (id === 'WildChange') {
            return { color: 'W', value: 'WildChange', id: 'WildChange' };
        }
        const value = id.substring(1);
        return { color: 'W', value, id };
    }
    const color = id[0];
    const value = id.substring(1);
    return { color, value, id };
}
function createDeck(variant) {
    const cards = [];
    const colors = ['R', 'G', 'B', 'Y'];
    // Standard UNO deck
    for (const color of colors) {
        // One 0 per color
        cards.push(createCard(`${color}0`));
        // Two of each 1-9 per color
        for (let num = 1; num <= 9; num++) {
            cards.push(createCard(`${color}${num}`));
            cards.push(createCard(`${color}${num}`));
        }
        // Two of each action card per color
        cards.push(createCard(`${color}Skip`));
        cards.push(createCard(`${color}Skip`));
        cards.push(createCard(`${color}Reverse`));
        cards.push(createCard(`${color}Reverse`));
        cards.push(createCard(`${color}Draw2`));
        cards.push(createCard(`${color}Draw2`));
    }
    // Four Wild cards
    for (let i = 0; i < 4; i++) {
        cards.push(createCard('Wild'));
    }
    // Four Wild Draw 4 cards
    for (let i = 0; i < 4; i++) {
        cards.push(createCard('Wild4'));
    }
    // House Rules variant additions
    if (variant === 'house-rules') {
        // Add House Rules cards (1-5) - 2 of each
        for (let i = 1; i <= 5; i++) {
            cards.push(createCard(`HR${i}`));
            cards.push(createCard(`HR${i}`));
        }
        // Add 2 Wild Game Changer cards
        cards.push(createCard('WildChange'));
        cards.push(createCard('WildChange'));
    }
    return cards;
}
function shuffleDeck(cards) {
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
// ============================================================================
// UNO GAME ENGINE
// ============================================================================
class UnoGameEngine {
    constructor(variant, playerIds, playerNames, isBot) {
        // Create initial deck
        const deck = shuffleDeck(createDeck(variant));
        // Create players and deal 7 cards each
        const players = playerIds.map((id, index) => ({
            id,
            name: playerNames[index],
            seat: index,
            hand: deck.splice(0, 7),
            calledUno: false,
            isBot: isBot[index] || false,
        }));
        // Start discard pile with one card
        const firstCard = deck.shift();
        const discardPile = [firstCard];
        // Determine starting color
        let currentColor = 'R';
        if (firstCard.color !== 'W') {
            currentColor = firstCard.color;
        }
        this.state = {
            variant,
            players,
            drawPile: deck,
            discardPile,
            currentPlayerIndex: 0,
            direction: 1,
            currentColor,
            drawStack: 0,
            lastAction: `Game started. First card: ${firstCard.id}`,
            winners: [],
            houseRules: variant === 'house-rules' ? new Map() : undefined,
        };
        // Handle special first card effects
        this.handleFirstCardEffect(firstCard);
    }
    handleFirstCardEffect(card) {
        if (card.value === 'Skip') {
            this.state.currentPlayerIndex = this.getNextPlayerIndex();
            this.state.lastAction += '. First player skipped!';
        }
        else if (card.value === 'Reverse') {
            this.state.direction *= -1;
            this.state.lastAction += '. Direction reversed!';
        }
        else if (card.value === 'Draw2') {
            this.state.drawStack = 2;
            this.state.lastAction += '. First player must draw 2!';
        }
    }
    // ============================================================================
    // CORE GAME ACTIONS
    // ============================================================================
    playCard(playerId, cardIndex, chosenColor) {
        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer || currentPlayer.id !== playerId) {
            return { success: false, message: 'Not your turn' };
        }
        if (cardIndex < 0 || cardIndex >= currentPlayer.hand.length) {
            return { success: false, message: 'Invalid card index' };
        }
        const card = currentPlayer.hand[cardIndex];
        // Validate card can be played
        if (!this.canPlayCard(playerId, card)) {
            return { success: false, message: 'Card cannot be played' };
        }
        // Wild cards require color choice - validate it's provided before proceeding
        if ((card.value === 'Wild' || card.value === 'Wild4' || card.value === 'WildChange') && !chosenColor) {
            return {
                success: false,
                message: 'Must choose a color for wild cards',
                needsColorChoice: true
            };
        }
        // Check if Wild Draw 4 is legal (player must not have any cards of current color)
        let wasIllegalWild4 = false;
        if (card.value === 'Wild4') {
            const hasCurrentColor = currentPlayer.hand.some(c => c.color === this.state.currentColor);
            wasIllegalWild4 = hasCurrentColor;
        }
        // Remove card from hand and add to discard pile
        currentPlayer.hand.splice(cardIndex, 1);
        this.state.discardPile.push(card);
        // Apply card effects
        const result = this.applyCardEffect(card, chosenColor, wasIllegalWild4, playerId);
        // Check for UNO call
        if (currentPlayer.hand.length === 1 && !currentPlayer.calledUno) {
            this.openUnoChallenge(playerId);
        }
        // Check for win
        if (currentPlayer.hand.length === 0) {
            this.state.winners.push(playerId);
            this.state.lastAction = `${currentPlayer.name} wins!`;
        }
        // Advance to next player (unless game is over)
        if (this.state.winners.length === 0 || this.state.winners.length < this.state.players.length - 1) {
            this.state.currentPlayerIndex = this.getNextPlayerIndex();
        }
        return result;
    }
    chooseColor(playerId, color) {
        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer || currentPlayer.id !== playerId) {
            return false;
        }
        this.state.currentColor = color;
        this.state.lastAction = `${currentPlayer.name} chose ${this.getColorName(color)}`;
        return true;
    }
    drawCard(playerId) {
        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer || currentPlayer.id !== playerId) {
            return {
                success: false,
                message: 'Not your turn',
                cards: [],
                canPlayDrawnCard: false
            };
        }
        // Handle draw stack (from Draw 2 or Wild Draw 4)
        const wasDrawStack = this.state.drawStack > 0;
        const cardsToDraw = wasDrawStack ? this.state.drawStack : 1;
        const drawnCards = [];
        for (let i = 0; i < cardsToDraw; i++) {
            if (this.state.drawPile.length === 0) {
                this.reshuffleDeck();
            }
            const card = this.state.drawPile.shift();
            if (card) {
                currentPlayer.hand.push(card);
                drawnCards.push(card);
            }
        }
        // Clear draw stack
        this.state.drawStack = 0;
        // Reset UNO call if player now has more than 1 card
        if (currentPlayer.hand.length > 1) {
            currentPlayer.calledUno = false;
        }
        // Check if drawn card is playable (only for voluntary single draw, not from stack)
        let canPlayDrawnCard = false;
        if (!wasDrawStack && drawnCards.length === 1) {
            canPlayDrawnCard = this.canPlayCard(playerId, drawnCards[0]);
        }
        // Turn always ends if: drew from stack, drew multiple cards, or can't play drawn card
        if (wasDrawStack || !canPlayDrawnCard || drawnCards.length > 1) {
            this.state.currentPlayerIndex = this.getNextPlayerIndex();
        }
        this.state.lastAction = `${currentPlayer.name} drew ${drawnCards.length} card(s)`;
        return {
            success: true,
            message: `Drew ${drawnCards.length} card(s)`,
            cards: drawnCards,
            canPlayDrawnCard,
        };
    }
    callUno(playerId) {
        const player = this.state.players.find(p => p.id === playerId);
        if (player) {
            player.calledUno = true;
            this.state.lastAction = `${player.name} called UNO!`;
            // Close any open UNO challenge window for this player
            if (this.state.challengeWindow?.type === 'uno' &&
                this.state.challengeWindow.targetPlayerId === playerId) {
                delete this.state.challengeWindow;
            }
        }
    }
    challengeUno(challengerId, targetId) {
        const challenger = this.state.players.find(p => p.id === challengerId);
        const target = this.state.players.find(p => p.id === targetId);
        if (!challenger || !target) {
            return { success: false, message: 'Invalid player', penaltyCards: 0, loser: '' };
        }
        // Check if challenge is valid (target has 1 card and didn't call UNO)
        if (target.hand.length === 1 && !target.calledUno) {
            // Challenge succeeds - target draws 2 cards
            for (let i = 0; i < 2; i++) {
                if (this.state.drawPile.length === 0)
                    this.reshuffleDeck();
                const card = this.state.drawPile.shift();
                if (card)
                    target.hand.push(card);
            }
            this.state.lastAction = `${challenger.name} caught ${target.name}! ${target.name} draws 2`;
            delete this.state.challengeWindow;
            return {
                success: true,
                message: 'Challenge successful!',
                penaltyCards: 2,
                loser: targetId
            };
        }
        else {
            // Challenge fails - challenger draws 2 cards
            for (let i = 0; i < 2; i++) {
                if (this.state.drawPile.length === 0)
                    this.reshuffleDeck();
                const card = this.state.drawPile.shift();
                if (card)
                    challenger.hand.push(card);
            }
            this.state.lastAction = `${challenger.name}'s challenge failed! Draws 2`;
            delete this.state.challengeWindow;
            return {
                success: false,
                message: 'Challenge failed!',
                penaltyCards: 2,
                loser: challengerId
            };
        }
    }
    challengeWildDrawFour(challengerId) {
        const challenger = this.state.players.find(p => p.id === challengerId);
        if (!challenger || !this.state.challengeWindow ||
            this.state.challengeWindow.type !== 'wild-draw-four') {
            return { success: false, message: 'No challenge window', penaltyCards: 0, loser: '' };
        }
        const targetId = this.state.challengeWindow.targetPlayerId;
        const target = this.state.players.find(p => p.id === targetId);
        if (!target) {
            return { success: false, message: 'Invalid target', penaltyCards: 0, loser: '' };
        }
        // Get whether the Wild Draw 4 was illegal from the challenge window
        const wasIllegal = this.state.challengeWindow.wasIllegalWildDrawFour || false;
        delete this.state.challengeWindow;
        if (wasIllegal) {
            // Challenge succeeds - target draws 4 + 2 = 6 cards, challenger draws 0
            for (let i = 0; i < 6; i++) {
                if (this.state.drawPile.length === 0)
                    this.reshuffleDeck();
                const card = this.state.drawPile.shift();
                if (card)
                    target.hand.push(card);
            }
            this.state.lastAction = `${challenger.name} challenged successfully! ${target.name} draws 6`;
            return { success: true, message: 'Challenge successful!', penaltyCards: 6, loser: targetId };
        }
        else {
            // Challenge fails - challenger draws 4 + 2 = 6 cards
            for (let i = 0; i < 6; i++) {
                if (this.state.drawPile.length === 0)
                    this.reshuffleDeck();
                const card = this.state.drawPile.shift();
                if (card)
                    challenger.hand.push(card);
            }
            this.state.lastAction = `${challenger.name}'s challenge failed! Draws 6`;
            return { success: false, message: 'Challenge failed!', penaltyCards: 6, loser: challengerId };
        }
    }
    // ============================================================================
    // CARD VALIDATION
    // ============================================================================
    canPlayCard(playerId, card) {
        const player = this.state.players.find(p => p.id === playerId);
        if (!player)
            return false;
        // Wild cards can always be played
        if (card.color === 'W')
            return true;
        // Can play if color matches
        if (card.color === this.state.currentColor)
            return true;
        // Can play if value matches (number or action)
        const topCard = this.state.discardPile[this.state.discardPile.length - 1];
        if (card.value === topCard.value)
            return true;
        return false;
    }
    getPlayableCards(playerId) {
        const player = this.state.players.find(p => p.id === playerId);
        if (!player)
            return [];
        const playableIndices = [];
        player.hand.forEach((card, index) => {
            if (this.canPlayCard(playerId, card)) {
                playableIndices.push(index);
            }
        });
        return playableIndices;
    }
    // ============================================================================
    // CARD EFFECTS
    // ============================================================================
    applyCardEffect(card, chosenColor, wasIllegalWild4, playerId) {
        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer) {
            return { success: false, message: 'No current player' };
        }
        let message = `${currentPlayer.name} played ${card.id}`;
        let drewCards = 0;
        let challengeOpened = false;
        switch (card.value) {
            case 'Skip':
                this.state.currentPlayerIndex = this.getNextPlayerIndex();
                message += '. Next player skipped!';
                break;
            case 'Reverse':
                if (this.state.players.length === 2) {
                    // In 2-player, Reverse acts like Skip
                    this.state.currentPlayerIndex = this.getNextPlayerIndex();
                    message += '. Next player skipped!';
                }
                else {
                    this.state.direction *= -1;
                    message += '. Direction reversed!';
                }
                break;
            case 'Draw2':
                this.state.drawStack += 2;
                message += '. Next player draws 2!';
                drewCards = 2;
                break;
            case 'Wild':
                if (chosenColor) {
                    this.state.currentColor = chosenColor;
                    message += `. Color changed to ${this.getColorName(chosenColor)}`;
                }
                break;
            case 'Wild4':
                if (chosenColor) {
                    this.state.currentColor = chosenColor;
                    this.state.drawStack += 4;
                    message += `. Color changed to ${this.getColorName(chosenColor)}. Next player draws 4!`;
                    drewCards = 4;
                    // Always open challenge window for Wild Draw 4
                    if (playerId) {
                        this.openWildDraw4Challenge(playerId, wasIllegalWild4 || false);
                        challengeOpened = true;
                    }
                }
                break;
            default:
                // Number cards - just update color
                if (card.color !== 'W') {
                    this.state.currentColor = card.color;
                }
                break;
        }
        this.state.lastAction = message;
        return { success: true, message, drewCards, challengeOpened };
    }
    // ============================================================================
    // CHALLENGE WINDOWS
    // ============================================================================
    openUnoChallenge(targetPlayerId) {
        const eligibleChallengers = this.state.players
            .filter(p => p.id !== targetPlayerId)
            .map(p => p.id);
        this.state.challengeWindow = {
            type: 'uno',
            targetPlayerId,
            expiresAt: Date.now() + 5000, // 5 second window
            eligibleChallengers,
        };
    }
    openWildDraw4Challenge(targetPlayerId, wasIllegal) {
        const nextPlayer = this.state.players[this.getNextPlayerIndex()];
        this.state.challengeWindow = {
            type: 'wild-draw-four',
            targetPlayerId,
            expiresAt: Date.now() + 10000, // 10 second window
            eligibleChallengers: [nextPlayer.id], // Only next player can challenge
            wasIllegalWildDrawFour: wasIllegal,
        };
    }
    checkExpiredChallengeWindow() {
        if (this.state.challengeWindow && Date.now() > this.state.challengeWindow.expiresAt) {
            delete this.state.challengeWindow;
            return true;
        }
        return false;
    }
    // ============================================================================
    // GAME STATE QUERIES
    // ============================================================================
    getCurrentPlayer() {
        if (this.state.currentPlayerIndex < 0 ||
            this.state.currentPlayerIndex >= this.state.players.length) {
            return null;
        }
        return this.state.players[this.state.currentPlayerIndex];
    }
    getPlayer(playerId) {
        return this.state.players.find(p => p.id === playerId) || null;
    }
    getGameState() {
        return this.state;
    }
    isGameOver() {
        // Game is over when all but one player have gone out
        return this.state.winners.length >= this.state.players.length - 1;
    }
    getScores() {
        // Calculate points - sum card values in each player's hand
        const scores = {};
        for (const player of this.state.players) {
            let points = 0;
            for (const card of player.hand) {
                points += this.getCardValue(card);
            }
            scores[player.id] = points;
        }
        return scores;
    }
    getCardValue(card) {
        // Number cards = face value
        if (/^\d$/.test(card.value)) {
            return parseInt(card.value, 10);
        }
        // Action cards = 20 points
        if (['Skip', 'Reverse', 'Draw2'].includes(card.value)) {
            return 20;
        }
        // Wild cards = 50 points
        if (['Wild', 'Wild4', 'WildChange'].includes(card.value)) {
            return 50;
        }
        // House Rules cards = 30 points
        if (card.value.startsWith('HR')) {
            return 30;
        }
        return 0;
    }
    // ============================================================================
    // HELPER METHODS
    // ============================================================================
    getNextPlayerIndex() {
        let nextIndex = this.state.currentPlayerIndex + this.state.direction;
        // Wrap around
        if (nextIndex >= this.state.players.length) {
            nextIndex = 0;
        }
        else if (nextIndex < 0) {
            nextIndex = this.state.players.length - 1;
        }
        return nextIndex;
    }
    reshuffleDeck() {
        if (this.state.discardPile.length <= 1) {
            // Can't reshuffle - no cards available
            return;
        }
        // Keep top card, shuffle rest back into draw pile
        const topCard = this.state.discardPile.pop();
        const cardsToShuffle = this.state.discardPile;
        this.state.discardPile = [topCard];
        this.state.drawPile = shuffleDeck(cardsToShuffle);
        this.state.lastAction = 'Deck reshuffled';
    }
    getColorName(color) {
        const names = {
            'R': 'Red',
            'G': 'Green',
            'B': 'Blue',
            'Y': 'Yellow',
        };
        return names[color] || color;
    }
    // ============================================================================
    // SERIALIZATION
    // ============================================================================
    serialize() {
        return {
            variant: this.state.variant,
            drawPile: this.state.drawPile.map(c => c.id),
            discardPile: this.state.discardPile.map(c => c.id),
            players: this.state.players.map(p => ({
                id: p.id,
                name: p.name,
                seat: p.seat,
                hand: p.hand.map(c => c.id),
                calledUno: p.calledUno,
                isBot: p.isBot,
            })),
            currentPlayerIndex: this.state.currentPlayerIndex,
            direction: this.state.direction,
            currentColor: this.state.currentColor,
            drawStack: this.state.drawStack,
            lastAction: this.state.lastAction,
            winners: this.state.winners,
            challengeWindow: this.state.challengeWindow,
            houseRules: this.state.houseRules ? Array.from(this.state.houseRules.values()) : undefined,
            activeHouseRuleChallenge: this.state.activeHouseRuleChallenge,
        };
    }
    static deserialize(snapshot) {
        // Create a dummy engine to get the structure
        const engine = new UnoGameEngine(snapshot.variant, snapshot.players.map(p => p.id), snapshot.players.map(p => p.name), snapshot.players.map(p => p.isBot));
        // Replace state with deserialized data
        engine.state = {
            variant: snapshot.variant,
            drawPile: snapshot.drawPile.map(id => createCard(id)),
            discardPile: snapshot.discardPile.map(id => createCard(id)),
            players: snapshot.players.map(p => ({
                id: p.id,
                name: p.name,
                seat: p.seat,
                hand: p.hand.map(id => createCard(id)),
                calledUno: p.calledUno,
                isBot: p.isBot,
            })),
            currentPlayerIndex: snapshot.currentPlayerIndex,
            direction: snapshot.direction,
            currentColor: snapshot.currentColor,
            drawStack: snapshot.drawStack,
            lastAction: snapshot.lastAction,
            winners: snapshot.winners,
            challengeWindow: snapshot.challengeWindow,
            houseRules: snapshot.houseRules ? new Map(snapshot.houseRules.map(r => [r.number, r])) : undefined,
            activeHouseRuleChallenge: snapshot.activeHouseRuleChallenge,
        };
        return engine;
    }
}
exports.UnoGameEngine = UnoGameEngine;
