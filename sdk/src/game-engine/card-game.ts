/**
 * Card Game utilities for building card-based games
 */
export class CardGame {
  private deck: string[];
  private suits = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs (ASCII-safe)
  private ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  constructor() {
    this.deck = this.createDeck();
  }

  /**
   * Create a standard 52-card deck
   */
  private createDeck(): string[] {
    const deck: string[] = [];
    for (const suit of this.suits) {
      for (const rank of this.ranks) {
        deck.push(rank + suit);
      }
    }
    return deck;
  }

  /**
   * Shuffle the deck
   */
  shuffle(): void {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  /**
   * Deal a card
   */
  deal(): string | undefined {
    return this.deck.pop();
  }

  /**
   * Deal multiple cards
   */
  dealHand(count: number): string[] {
    const hand: string[] = [];
    for (let i = 0; i < count && this.deck.length > 0; i++) {
      const card = this.deal();
      if (card) hand.push(card);
    }
    return hand;
  }

  /**
   * Get remaining cards
   */
  remaining(): number {
    return this.deck.length;
  }

  /**
   * Reset deck
   */
  reset(): void {
    this.deck = this.createDeck();
  }

  /**
   * Get card value for blackjack
   */
  getBlackjackValue(card: string): number {
    const rank = card.slice(0, -1); // Remove suit
    if (rank === 'A') return 11;
    if (['K', 'Q', 'J'].includes(rank)) return 10;
    return parseInt(rank);
  }

  /**
   * Calculate hand value for blackjack
   */
  getHandValue(hand: string[]): number {
    let value = 0;
    let aces = 0;

    for (const card of hand) {
      const cardValue = this.getBlackjackValue(card);
      value += cardValue;
      if (card.startsWith('A')) aces++;
    }

    // Handle aces
    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }

    return value;
  }

  /**
   * Format a card for display (ASCII-safe)
   */
  formatCard(card: string): string {
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);

    const suitSymbol = {
      'S': 'S', // Spades
      'H': 'H', // Hearts
      'D': 'D', // Diamonds
      'C': 'C'  // Clubs
    }[suit] || suit;

    return `[${rank}${suitSymbol}]`;
  }

  /**
   * Format a hand of cards for display
   */
  formatHand(hand: string[], label: string = 'Hand'): string {
    let output = `${label}: `;
    hand.forEach(card => {
      output += this.formatCard(card) + ' ';
    });
    return output + '\r\n';
  }

  /**
   * Get suit name
   */
  getSuitName(card: string): string {
    const suit = card.slice(-1);
    return {
      'S': 'Spades',
      'H': 'Hearts',
      'D': 'Diamonds',
      'C': 'Clubs'
    }[suit] || 'Unknown';
  }

  /**
   * Get rank name
   */
  getRankName(card: string): string {
    const rank = card.slice(0, -1);
    return {
      'A': 'Ace',
      'J': 'Jack',
      'Q': 'Queen',
      'K': 'King'
    }[rank] || rank;
  }
}
