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
export declare const MODE_PLAYER_TARGET: Record<string, number>;
/** Players a mode wants in total. Unknown modes are a duel. */
export declare function modePlayerTarget(mode: string): number;
/** Bots a mode wants beside one human. */
export declare function getRecommendedBotCount(mode: string): number;
/**
 * Get bot difficulty name
 */
export declare function getBotDifficultyName(difficulty: BotDifficulty): string;
//# sourceMappingURL=bot-lobby.d.ts.map