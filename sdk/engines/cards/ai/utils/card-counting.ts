/**
 * Card Counting for UNO AI
 *
 * Tracks cards played to make strategic decisions about color selection
 * and challenge timing.
 */

import type { CardCountingState } from '../types';

/**
 * Initialize card counting state
 */
export function initializeCardCounting(): CardCountingState {
  return {
    colorCounts: { R: 0, G: 0, B: 0, Y: 0, W: 0 },
    valueCounts: {},
    totalPlayed: 0,
    deckRemaining: 108, // Standard UNO deck size
  };
}

/**
 * Update card counting state with a played card
 *
 * @param state Current counting state
 * @param color Card color (R, G, B, Y, W)
 * @param value Card value (0-9, Skip, Reverse, etc.)
 */
export function trackCard(
  state: CardCountingState,
  color: string,
  value: string
): void {
  // Update color count
  if (state.colorCounts[color] !== undefined) {
    state.colorCounts[color]++;
  } else {
    state.colorCounts[color] = 1;
  }

  // Update value count
  if (state.valueCounts[value] !== undefined) {
    state.valueCounts[value]++;
  } else {
    state.valueCounts[value] = 1;
  }

  // Update totals
  state.totalPlayed++;
  state.deckRemaining = Math.max(0, 108 - state.totalPlayed);
}

/**
 * Get the most common color played
 */
export function getMostPlayedColor(state: CardCountingState): string {
  const colors = ['R', 'G', 'B', 'Y'];
  let maxColor = colors[0];
  let maxCount = state.colorCounts[maxColor] ?? 0;

  for (const color of colors) {
    const count = state.colorCounts[color] ?? 0;
    if (count > maxCount) {
      maxColor = color;
      maxCount = count;
    }
  }

  return maxColor;
}

/**
 * Get the least common color played (more likely to be in opponent hands)
 */
export function getLeastPlayedColor(state: CardCountingState): string {
  const colors = ['R', 'G', 'B', 'Y'];
  let minColor = colors[0];
  let minCount = state.colorCounts[minColor] ?? 0;

  for (const color of colors) {
    const count = state.colorCounts[color] ?? 0;
    if (count < minCount) {
      minColor = color;
      minCount = count;
    }
  }

  return minColor;
}

/**
 * Estimate probability that a color is still available
 *
 * Standard UNO has 25 cards per color (excluding wilds)
 */
export function getColorAvailability(
  state: CardCountingState,
  color: string
): number {
  const totalPerColor = 25;
  const played = state.colorCounts[color] ?? 0;
  const remaining = Math.max(0, totalPerColor - played);

  return remaining / totalPerColor;
}

/**
 * Choose best color based on hand and card counting
 *
 * @param handColors Colors in the AI's hand
 * @param state Card counting state
 * @param strategic Whether to use strategic selection
 */
export function chooseBestColor(
  handColors: string[],
  state: CardCountingState,
  strategic: boolean
): string {
  const colors = ['R', 'G', 'B', 'Y'];

  if (!strategic) {
    // Random selection
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // Count colors in hand
  const handColorCounts: Record<string, number> = {};
  for (const color of handColors) {
    if (colors.includes(color)) {
      handColorCounts[color] = (handColorCounts[color] ?? 0) + 1;
    }
  }

  // If no matching colors in hand, choose least played (harder for opponents)
  if (Object.keys(handColorCounts).length === 0) {
    return getLeastPlayedColor(state);
  }

  // Choose color with most cards in hand
  let bestColor = Object.keys(handColorCounts)[0];
  let bestCount = handColorCounts[bestColor];

  for (const color of Object.keys(handColorCounts)) {
    const count = handColorCounts[color];
    if (count > bestCount) {
      bestColor = color;
      bestCount = count;
    }
  }

  return bestColor;
}
