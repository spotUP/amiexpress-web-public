/**
 * Bot Lobby Management
 *
 * Utilities for filling lobbies with AI bot players
 */
import { type BotDifficulty } from '../ai/bot-player';
import type { PlayerInfo } from './network-manager';
export type { BotDifficulty };
/**
 * Generate bot players to fill lobby
 */
export declare function generateBotPlayers(count: number, difficulty?: BotDifficulty): PlayerInfo[];
/**
 * Fill lobby to target player count with bots
 */
export declare function fillLobbyWithBots(currentPlayers: PlayerInfo[], targetCount: number, difficulty?: BotDifficulty): PlayerInfo[];
/**
 * Remove all bot players from lobby
 */
export declare function removeBots(players: PlayerInfo[]): PlayerInfo[];
/**
 * Replace bots with new difficulty
 */
export declare function replaceBots(players: PlayerInfo[], difficulty: BotDifficulty): PlayerInfo[];
/**
 * Get recommended bot count for mode
 */
export declare function getRecommendedBotCount(mode: string): number;
/**
 * Get bot difficulty name
 */
export declare function getBotDifficultyName(difficulty: BotDifficulty): string;
//# sourceMappingURL=bot-lobby.d.ts.map