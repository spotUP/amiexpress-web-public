"use strict";
/**
 * Bot Lobby Management
 *
 * Utilities for filling lobbies with AI bot players
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBotPlayers = generateBotPlayers;
exports.fillLobbyWithBots = fillLobbyWithBots;
exports.removeBots = removeBots;
exports.replaceBots = replaceBots;
exports.getRecommendedBotCount = getRecommendedBotCount;
exports.getBotDifficultyName = getBotDifficultyName;
const bot_player_1 = require("../ai/bot-player");
/**
 * Generate bot players to fill lobby
 */
function generateBotPlayers(count, difficulty) {
    const bots = [];
    for (let i = 0; i < count; i++) {
        const botDifficulty = difficulty || (Math.floor(Math.random() * 10) + 1);
        const botName = bot_player_1.BotPlayerFactory.getBotName(botDifficulty);
        bots.push({
            id: `bot_${Date.now()}_${i}`,
            name: `CPU ${botName}`,
            rank: 1000 - (botDifficulty * 100), // Higher difficulty = higher rank
            rating: 1000 + (botDifficulty * 100), // Higher difficulty = higher rating
            ready: true, // Bots are always ready
            isBot: true,
            botDifficulty,
        });
    }
    return bots;
}
/**
 * Fill lobby to target player count with bots
 */
function fillLobbyWithBots(currentPlayers, targetCount, difficulty) {
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
function removeBots(players) {
    return players.filter(p => !p.isBot);
}
/**
 * Replace bots with new difficulty
 */
function replaceBots(players, difficulty) {
    const humanPlayers = players.filter(p => !p.isBot);
    const botCount = players.filter(p => p.isBot).length;
    if (botCount === 0) {
        return players;
    }
    const newBots = generateBotPlayers(botCount, difficulty);
    return [...humanPlayers, ...newBots];
}
/**
 * Get recommended bot count for mode
 */
function getRecommendedBotCount(mode) {
    const recommendations = {
        versus_1v1: 1, // 1 bot opponent
        team_2v2: 3, // 3 bots (fill 4-player team)
        battle_royale: 5, // 5 bots (6 players total)
    };
    return recommendations[mode] || 1;
}
/**
 * Get bot difficulty name
 */
function getBotDifficultyName(difficulty) {
    const names = {
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
//# sourceMappingURL=bot-lobby.js.map