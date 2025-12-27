# PokerEngine Quick Reference

Fast lookup for PokerEngine APIs. Texas Hold'em game logic with ASCII card rendering.

## Import

```typescript
import { PokerEngine } from '@amiexpress/sdk/engines/poker';
const poker = new PokerEngine();
```

## Creating a Game

```typescript
// Create new Texas Hold'em game
const game = poker.createGame({
  players: ['player1', 'player2', 'player3'],
  smallBlind: 10,
  bigBlind: 20,
  startingChips: 1000
});
```

## Game Flow

```typescript
// Start new hand
poker.startHand();

// Deal hole cards
poker.dealHoleCards();

// Deal community cards
poker.dealFlop();     // 3 cards
poker.dealTurn();     // 1 card
poker.dealRiver();    // 1 card

// Check current street
const street = poker.getStreet();
// Returns: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
```

## Player Actions

```typescript
// Get available actions for current player
const actions = poker.getAvailableActions();
// Returns: ['fold', 'call', 'raise', 'check', 'all-in']

// Perform action
poker.fold('player1');
poker.call('player2');
poker.raise('player3', 100);  // Raise to 100
poker.check('player1');
poker.allIn('player2');

// Get current player to act
const toAct = poker.getCurrentPlayer();

// Check if betting round complete
const complete = poker.isBettingComplete();
```

## Getting Card Information

```typescript
// Get community cards (board)
const board = poker.getBoardCards();
// Returns: Card[] (flop, turn, river as dealt)

// Get player's hole cards
const holeCards = poker.getPlayerHoleCards('player1');
// Returns: Card[] (2 cards)

// Get all player cards (for showdown)
const allHands = poker.getAllHands();
// Returns: Map<string, Card[]>
```

## Rendering Cards

```typescript
// Render board (community cards)
const boardLines = poker.renderBoard({ useColor: true });
// Returns: string[] for display

// Render player's hand
const handLines = poker.renderPlayerHand('player1', {
  useColor: true,
  overlap: 3
});

// Render card backs (for hidden hands)
const hiddenLines = poker.renderHiddenHand(2);  // 2 face-down cards
```

## Hand Evaluation

```typescript
// Get hand ranking
const result = poker.evaluateHand('player1');
// Returns: {
//   rank: 'flush',
//   rankValue: 6,
//   description: 'Flush, King high',
//   cards: Card[]  // 5 best cards
// }

// Compare hands
const winner = poker.compareHands('player1', 'player2');
// Returns: 'player1' | 'player2' | 'tie'

// Get winner(s) of hand
const winners = poker.determineWinners();
// Returns: string[] (player IDs)
```

## Hand Rankings

| Rank | Name | Example |
|------|------|---------|
| 10 | Royal Flush | A K Q J 10 (same suit) |
| 9 | Straight Flush | 9 8 7 6 5 (same suit) |
| 8 | Four of a Kind | K K K K 2 |
| 7 | Full House | Q Q Q 7 7 |
| 6 | Flush | A J 8 4 2 (same suit) |
| 5 | Straight | 10 9 8 7 6 |
| 4 | Three of a Kind | J J J 9 4 |
| 3 | Two Pair | 10 10 6 6 K |
| 2 | One Pair | A A 9 5 3 |
| 1 | High Card | K Q 9 6 2 |

## Pot Management

```typescript
// Get current pot
const pot = poker.getPot();

// Get side pots (for all-in scenarios)
const sidePots = poker.getSidePots();
// Returns: { amount: number, eligiblePlayers: string[] }[]

// Award pot to winner(s)
poker.awardPot(winners);
```

## Player State

```typescript
// Get player chips
const chips = poker.getPlayerChips('player1');

// Get player bet in current round
const bet = poker.getCurrentBet('player1');

// Check if player is all-in
const allIn = poker.isAllIn('player1');

// Check if player is still in hand
const active = poker.isActive('player1');

// Get all active players
const activePlayers = poker.getActivePlayers();
```

## Game State

```typescript
// Get full game state
const state = poker.getGameState();
// Returns: {
//   street: string,
//   pot: number,
//   currentBet: number,
//   players: PlayerState[],
//   board: Card[],
//   currentPlayer: string
// }

// Reset for new hand
poker.resetHand();
```

## Events

```typescript
poker.on('handStart', () => { });
poker.on('streetChange', (street) => { });
poker.on('playerAction', (playerId, action, amount) => { });
poker.on('showdown', (hands) => { });
poker.on('potAwarded', (winnerId, amount) => { });
poker.on('playerEliminated', (playerId) => { });
```

## Example: Simple Poker Round

```typescript
const poker = new PokerEngine();

// Setup
poker.createGame({
  players: ['hero', 'villain'],
  smallBlind: 5,
  bigBlind: 10,
  startingChips: 500
});

// Deal
poker.startHand();
poker.dealHoleCards();

console.log('Your hand:');
poker.renderPlayerHand('hero', { useColor: true })
  .forEach(line => console.log(line));

// Preflop betting
if (poker.getCurrentPlayer() === 'hero') {
  poker.call('hero');  // Call big blind
}
poker.check('villain');

// Flop
poker.dealFlop();
console.log('\nBoard:');
poker.renderBoard({ useColor: true })
  .forEach(line => console.log(line));

// Continue betting rounds...
// ...

// Showdown
const winners = poker.determineWinners();
poker.awardPot(winners);

console.log(`Winner: ${winners[0]}`);
```

## Cleanup

```typescript
poker.dispose();  // End game and clean up
```
