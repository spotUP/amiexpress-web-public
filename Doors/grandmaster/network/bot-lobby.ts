/**
 * Bot Lobby Management
 *
 * Utilities for filling lobbies with AI bot players
 */

import { BotPlayerFactory, type BotDifficulty } from '../ai/bot-player';
import type { PlayerInfo } from './network-manager';

// Re-export BotDifficulty for convenience
export type { BotDifficulty };

/**
 * Generate bot players to fill lobby
 */
export function generateBotPlayers(count: number, difficulty?: BotDifficulty): PlayerInfo[] {
  const bots: PlayerInfo[] = [];

  for (let i = 0; i < count; i++) {
    const botDifficulty = difficulty || (Math.floor(Math.random() * 10) + 1) as BotDifficulty;
    const botName = BotPlayerFactory.getBotName(botDifficulty);

    bots.push({
      id: `bot_${Date.now()}_${i}`,
      name: `CPU ${botName}`,
      rank: 1000 - (botDifficulty * 100),  // Higher difficulty = higher rank
      rating: 1000 + (botDifficulty * 100),  // Higher difficulty = higher rating
      ready: true,  // Bots are always ready
      isBot: true,
      botDifficulty,
    });
  }

  return bots;
}

/**
 * Fill lobby to target player count with bots
 */
export function fillLobbyWithBots(
  currentPlayers: PlayerInfo[],
  targetCount: number,
  difficulty?: BotDifficulty
): PlayerInfo[] {
  const humanPlayers = currentPlayers.filter(p => !p.isBot);
  const neededBots = Math.max(0, targetCount - humanPlayers.length);

  if (neededBots === 0) {
    return currentPlayers;
  }

  const bots = generateBotPlayers(neededBots, difficulty);
  return [...humanPlayers, ...bots];
}

/**
 * Remove all bot players from lobby
 */
export function removeBots(players: PlayerInfo[]): PlayerInfo[] {
  return players.filter(p => !p.isBot);
}

/**
 * Replace bots with new difficulty
 */
export function replaceBots(players: PlayerInfo[], difficulty: BotDifficulty): PlayerInfo[] {
  const humanPlayers = players.filter(p => !p.isBot);
  const botCount = players.filter(p => p.isBot).length;

  if (botCount === 0) {
    return players;
  }

  const newBots = generateBotPlayers(botCount, difficulty);
  return [...humanPlayers, ...newBots];
}

/**
 * How many players a mode is played with, humans and bots together.
 *
 * ONE table, because there were two and they disagreed: this file said a
 * battle royale wanted six players and the lobby adapter's own literal said
 * TWO, so "Battle Royale (99)" started with one CPU opponent ("in gmaster
 * only one bot joins in battle royale 99, that's not much of a battle
 * royale", 2026-09-01). The adapter reads this now.
 *
 * 99 is what the menu has always promised and the engine turns out not to
 * mind: 98 bots playing for thirty seconds of game time cost 0.16 ms per
 * frame, measured, against a 50 ms tick. The limit was never the CPU.
 */
export const MODE_PLAYER_TARGET: Record<string, number> = {
  versus_1v1: 2,
  team_2v2: 4,
  battle_royale: 99,
  // TETRIS ATTACK is a duel, and has no bot lobby: its CPU opponent is a mode
  // of its own rather than a seat in this one.
  panels_1v1: 2,
};

/** Players a mode wants in total. Unknown modes are a duel. */
export function modePlayerTarget(mode: string): number {
  return MODE_PLAYER_TARGET[mode] ?? 2;
}

/** Bots a mode wants beside one human. */
export function getRecommendedBotCount(mode: string): number {
  return Math.max(1, modePlayerTarget(mode) - 1);
}

/**
 * Get bot difficulty name
 */
export function getBotDifficultyName(difficulty: BotDifficulty): string {
  const names: Record<BotDifficulty, string> = {
    1: 'Beginner',
    2: 'Novice',
    3: 'Amateur',
    4: 'Intermediate',
    5: 'Skilled',
    6: 'Advanced',
    7: 'Expert',
    8: 'Master',
    9: 'Grandmaster',
    10: 'God',
  };

  return names[difficulty];
}
