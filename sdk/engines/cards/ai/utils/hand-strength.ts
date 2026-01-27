/**
 * Hand Strength Evaluation for Poker AI
 *
 * Provides hand evaluation and equity calculation using Monte Carlo simulation.
 */

import { evaluateStrings, getCardCodes, rank, rankDescription, HandRank } from '@pokertools/evaluator';
import type { HandStrength, PotOdds } from '../types';

/**
 * Parse a poker card string to evaluator format
 * Input: "AS", "KH", "10D", etc.
 * Output: Card object for evaluator (e.g., "As", "Kh")
 */
function parsePokerCard(card: string): string {
  const trimmed = card.trim().toUpperCase();
  const suit = trimmed.slice(-1).toLowerCase(); // Lowercase suit for @pokertools/evaluator
  const rank = trimmed.slice(0, -1);

  // Convert 10 to T for evaluator
  const normalizedRank = rank === '10' ? 'T' : rank;

  return `${normalizedRank}${suit}`;
}

/**
 * Evaluate current hand strength without simulation
 */
export function evaluateHandStrength(
  holeCards: readonly string[],
  boardCards: readonly string[]
): HandStrength {
  if (holeCards.length !== 2) {
    throw new Error(`Invalid hole cards: expected 2, got ${holeCards.length}`);
  }

  const allCards = [
    ...holeCards.map(parsePokerCard),
    ...boardCards.map(parsePokerCard),
  ];

  if (allCards.length < 2) {
    return {
      rank: 0,
      equity: 0.5,
      description: 'No cards',
    };
  }

  try {
    const codes = getCardCodes(allCards);
    const handRank = rank(codes);
    const description = rankDescription(handRank);

    return {
      rank: handRank,
      equity: 0.5, // Base equity, refined by Monte Carlo
      description,
    };
  } catch (error) {
    console.error('[HandStrength] Evaluation error:', error);
    return {
      rank: 0,
      equity: 0.5,
      description: 'High Card',
    };
  }
}

/**
 * Estimate win equity using Monte Carlo simulation
 *
 * @param holeCards Player's hole cards
 * @param boardCards Community cards
 * @param numOpponents Number of opponents in the hand
 * @param samples Number of simulations to run
 * @returns Win equity (0.0 - 1.0)
 */
export function calculateEquity(
  holeCards: readonly string[],
  boardCards: readonly string[],
  numOpponents: number,
  samples: number = 100
): number {
  if (samples === 0 || numOpponents === 0) {
    return 0.5; // Default equity
  }

  let wins = 0;
  let ties = 0;

  const myCards = holeCards.map(parsePokerCard);
  const board = boardCards.map(parsePokerCard);

  // Cards already used
  const deadCards = new Set([...myCards, ...board]);

  // Full deck
  const deck = createDeck().filter(c => !deadCards.has(c));

  // Validate we have enough cards for simulation
  const cardsNeededPerSim = numOpponents * 2 + (5 - board.length);
  if (cardsNeededPerSim > deck.length) {
    // Not enough cards - reduce opponents to what's possible
    const maxOpponents = Math.floor((deck.length - (5 - board.length)) / 2);
    if (maxOpponents < 1) {
      return 0.5; // Can't simulate, return default
    }
    numOpponents = maxOpponents;
  }

  for (let i = 0; i < samples; i++) {
    const shuffled = shuffle(deck.slice());

    // Deal opponent hands
    const opponentHands: string[][] = [];
    let cardIndex = 0;

    for (let opp = 0; opp < numOpponents; opp++) {
      opponentHands.push([shuffled[cardIndex++], shuffled[cardIndex++]]);
    }

    // Complete the board if needed
    const cardsNeeded = 5 - board.length;
    const fullBoard = [...board, ...shuffled.slice(cardIndex, cardIndex + cardsNeeded)];

    // Evaluate all hands
    const myHandValue = evaluateStrings([...myCards, ...fullBoard]);
    const opponentValues = opponentHands.map(oppCards =>
      evaluateStrings([...oppCards, ...fullBoard])
    );

    // Compare (lower value = better hand in @pokertools/evaluator)
    const minValue = Math.min(myHandValue, ...opponentValues);
    const winnersCount = [myHandValue, ...opponentValues].filter(v => v === minValue).length;

    if (minValue === myHandValue && winnersCount === 1) {
      wins++;
    } else if (minValue === myHandValue && winnersCount > 1) {
      ties++;
    }
  }

  return (wins + ties / 2) / samples;
}

/**
 * Create a full 52-card deck
 */
function createDeck(): string[] {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const suits = ['s', 'h', 'd', 'c'];
  const deck: string[] = [];

  for (const rank of ranks) {
    for (const suit of suits) {
      deck.push(`${rank}${suit}`);
    }
  }

  return deck;
}

/**
 * Fisher-Yates shuffle
 */
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Calculate pot odds for a call decision
 */
export function calculatePotOdds(
  currentPot: number,
  callAmount: number
): PotOdds {
  // Handle edge case: no bet to call (can check for free)
  if (callAmount === 0) {
    return {
      callAmount: 0,
      potSize: currentPot,
      odds: Infinity,
      requiredEquity: 0, // Any hand is profitable
    };
  }

  const potSize = currentPot + callAmount;
  const odds = potSize / callAmount;
  const requiredEquity = callAmount / potSize;

  return {
    callAmount,
    potSize,
    odds,
    requiredEquity,
  };
}

/**
 * Check if calling is profitable based on pot odds
 */
export function isProfitableCall(
  equity: number,
  potOdds: PotOdds
): boolean {
  return equity >= potOdds.requiredEquity;
}
