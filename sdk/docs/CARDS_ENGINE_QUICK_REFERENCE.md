# CardEngine Quick Reference

Fast lookup for CardEngine APIs. Renders ASCII/ANSI playing cards for card games.

## Import

```typescript
import { CardEngine } from '@amiexpress/sdk/engines/cards';
const cards = new CardEngine();
```

## Card Types

```typescript
// Standard playing card
interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
  faceUp: boolean;
}

// UNO card
interface UnoCard {
  color: 'red' | 'yellow' | 'green' | 'blue' | 'wild';
  value: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' |
         'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';
}
```

## Building Decks

```typescript
// Standard 52-card deck
const deck = cards.buildStandardDeck();

// With jokers (54 cards)
const deckWithJokers = cards.buildStandardDeck({ includeJokers: true });

// UNO deck (108 cards)
const unoDeck = cards.buildUnoDeck();

// Shuffle deck
cards.shuffleDeck(deck);

// Draw cards
const hand = cards.drawCards(deck, 5);  // Draw 5 cards
```

## Rendering Single Cards

```typescript
// Render face-up card (returns string[])
const lines = cards.renderCard({ suit: 'hearts', rank: 'A', faceUp: true });
// Output:
// +-----+
// |A    |
// |  H  |
// |    A|
// +-----+

// Render face-down card
const back = cards.renderCard({ suit: 'hearts', rank: 'A', faceUp: false });
// Output:
// +-----+
// |#####|
// |#####|
// |#####|
// +-----+

// Render with ANSI colors
const colored = cards.renderCard(card, { useColor: true });
// Hearts/Diamonds = red, Clubs/Spades = white
```

## Rendering Hands

```typescript
// Render hand horizontally (overlapping)
const handLines = cards.renderHand(hand, {
  overlap: 3,      // Cards overlap by 3 chars (default)
  useColor: true   // ANSI colors
});

// Render hand spread out
const spreadHand = cards.renderHand(hand, { overlap: 0 });

// Render selected card highlighted
const withSelection = cards.renderHand(hand, { selectedIndex: 2 });
```

## Rendering Stacks

```typescript
// Render stack (vertical pile)
const stackLines = cards.renderStack(stack, {
  showTop: 3,      // Show top 3 cards
  useColor: true
});

// Render discard pile (only top visible)
const discardLines = cards.renderStack(discard, { showTop: 1 });
```

## Rendering UNO Cards

```typescript
// Render UNO card
const unoLines = cards.renderUnoCard({ color: 'red', value: '7' });
// Output:
// +-----+
// |  7  |
// | RED |
// |  7  |
// +-----+

// Special cards
const skipLines = cards.renderUnoCard({ color: 'blue', value: 'skip' });
const wildLines = cards.renderUnoCard({ color: 'wild', value: 'wild' });
```

## Card Suits (ASCII/Unicode)

| Suit | ASCII | Unicode | Color |
|------|-------|---------|-------|
| Hearts | `H` | `\u2665` | Red |
| Diamonds | `D` | `\u2666` | Red |
| Clubs | `C` | `\u2663` | White |
| Spades | `S` | `\u2660` | White |

## UNO Colors (ANSI)

| Color | ANSI Code |
|-------|-----------|
| Red | `\x1b[91m` (bright red) |
| Yellow | `\x1b[93m` (bright yellow) |
| Green | `\x1b[92m` (bright green) |
| Blue | `\x1b[94m` (bright blue) |
| Wild | `\x1b[97m` (bright white) |

## Render Options

```typescript
interface RenderOptions {
  useColor: boolean;      // Use ANSI colors (default: true)
  useUnicode: boolean;    // Use Unicode suits (default: false)
  cardWidth: number;      // Card width in chars (default: 7)
  cardHeight: number;     // Card height in lines (default: 5)
  overlap: number;        // Horizontal overlap (default: 3)
  selectedIndex: number;  // Highlight card at index
  showBack: boolean;      // Show card back pattern
}
```

## Utility Functions

```typescript
// Get card value (for comparing)
const value = cards.getCardValue(card);  // A=14, K=13, Q=12, J=11, 2-10

// Compare cards
const result = cards.compareCards(card1, card2);  // -1, 0, or 1

// Check if hand contains card
const hasAce = cards.handContains(hand, { rank: 'A' });

// Sort hand by value
cards.sortHand(hand);

// Sort by suit then value
cards.sortHand(hand, 'suit');
```

## Example: Blackjack Hand

```typescript
const cards = new CardEngine();
const deck = cards.buildStandardDeck();
cards.shuffleDeck(deck);

// Deal hands
const playerHand = cards.drawCards(deck, 2);
const dealerHand = cards.drawCards(deck, 2);
dealerHand[1].faceUp = false;  // Hide dealer's hole card

// Render
console.log('Player:');
cards.renderHand(playerHand, { useColor: true }).forEach(line => console.log(line));

console.log('\nDealer:');
cards.renderHand(dealerHand, { useColor: true }).forEach(line => console.log(line));
```

## Example: UNO Game

```typescript
const cards = new CardEngine();
const deck = cards.buildUnoDeck();
cards.shuffleDeck(deck);

// Deal hands
const players = [
  cards.drawCards(deck, 7),
  cards.drawCards(deck, 7)
];

// Start discard pile
const discard = [deck.pop()];

// Render game state
console.log('Your hand:');
cards.renderHand(players[0], { useColor: true }).forEach(line => console.log(line));

console.log('\nDiscard:');
cards.renderUnoCard(discard[discard.length - 1]).forEach(line => console.log(line));
```

## Card Back Patterns

```typescript
// Default pattern
// +-----+
// |#####|
// |#####|
// |#####|
// +-----+

// Custom pattern
const customBack = cards.renderCardBack({ pattern: '.' });
// +-----+
// |.....|
// |.....|
// |.....|
// +-----+
```
