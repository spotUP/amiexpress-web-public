/**
 * Difficulty Configuration
 *
 * Defines behavior parameters for each AI difficulty level.
 * Higher skill levels make fewer mistakes and play more optimally.
 */

import { Difficulty, DifficultyConfig } from './types';

/**
 * Get configuration for a specific difficulty level
 */
export function getDifficultyConfig(difficulty: Difficulty): DifficultyConfig {
  const configs: Record<Difficulty, DifficultyConfig> = {
    [Difficulty.EASY]: {
      skillLevel: 0.30, // 30% optimal play, 70% mistakes
      aggression: 0.20,
      thinkingDelay: { min: 500, max: 1500 },
      poker: {
        usePotOdds: false, // Ignores pot odds
        usePositionAwareness: false, // Doesn't adjust for position
        monteCarloSamples: 0, // No equity calculation
        bluffFrequency: 0.05, // Rarely bluffs
      },
      uno: {
        useCardCounting: false, // Doesn't track cards
        challengeProbability: 0.0, // Never challenges
        strategicColorChoice: false, // Random color selection
      },
    },

    [Difficulty.MEDIUM]: {
      skillLevel: 0.60, // 60% optimal play
      aggression: 0.35,
      thinkingDelay: { min: 800, max: 2000 },
      poker: {
        usePotOdds: true, // Uses basic pot odds
        usePositionAwareness: true, // Basic position adjustment
        monteCarloSamples: 50, // Basic equity estimation
        bluffFrequency: 0.15,
      },
      uno: {
        useCardCounting: true, // Tracks some cards
        challengeProbability: 0.50, // 50% random challenges
        strategicColorChoice: true, // Chooses most common color
      },
    },

    [Difficulty.HARD]: {
      skillLevel: 0.85, // 85% optimal play
      aggression: 0.45,
      thinkingDelay: { min: 600, max: 1800 },
      poker: {
        usePotOdds: true,
        usePositionAwareness: true, // Advanced position play
        monteCarloSamples: 100, // Good equity estimation
        bluffFrequency: 0.25,
      },
      uno: {
        useCardCounting: true, // Full card tracking
        challengeProbability: 0.80, // Probability-based challenges
        strategicColorChoice: true, // Strategic color selection
      },
    },

    [Difficulty.EXPERT]: {
      skillLevel: 0.95, // 95% optimal play (near-perfect)
      aggression: 0.50,
      thinkingDelay: { min: 400, max: 1200 },
      poker: {
        usePotOdds: true,
        usePositionAwareness: true, // Expert position play
        monteCarloSamples: 200, // Accurate equity calculation
        bluffFrequency: 0.30, // Balanced bluffing
      },
      uno: {
        useCardCounting: true, // Perfect card tracking
        challengeProbability: 0.95, // Nearly always challenges correctly
        strategicColorChoice: true, // Optimal color selection
      },
    },
  };

  return configs[difficulty];
}

/**
 * Apply thinking delay to make AI feel more human-like
 */
export async function applyThinkingDelay(difficulty: Difficulty): Promise<void> {
  const config = getDifficultyConfig(difficulty);
  const delay =
    config.thinkingDelay.min +
    Math.random() * (config.thinkingDelay.max - config.thinkingDelay.min);

  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Check if AI should make a mistake based on skill level
 */
export function shouldMakeMistake(difficulty: Difficulty): boolean {
  const config = getDifficultyConfig(difficulty);
  return Math.random() > config.skillLevel;
}
