/**
 * PhreakWars Player Management Module
 *
 * Handles player creation, stats, inventory, achievements, and daily limits.
 */
import { DAILY_LIMITS } from './types';
// Global game states (in production, this would be stored in database)
export const gameStates = new Map();
/**
 * Create new game state for player
 */
export function createNewGameState() {
    return {
        player: {
            handle: '',
            skillLevel: 0.0,
            money: 50,
            phoneBills: 0,
            computer: {
                ram: 64, // 64KB
                storage: 170, // 170KB floppy
                modemSpeed: 300, // 300 baud
                hasBlueBox: false,
                hasRedBox: false
            },
            skills: {
                phreaking: 0,
                programming: 0,
                hacking: 0
            },
            inventory: [],
            achievements: []
        },
        bbs: {
            name: 'Public Domain',
            security: 1,
            users: 25,
            messages: [
                {
                    subject: 'Welcome New Users!',
                    body: 'Welcome to the Public Domain BBS! This is a safe place for beginners to learn about computing.',
                    author: 'Sysop',
                    timestamp: new Date()
                }
            ],
            files: [
                {
                    name: 'BASICS.TXT',
                    description: 'Basic computing concepts for beginners',
                    size: 2048,
                    uploader: 'Sysop'
                }
            ]
        },
        shadow: {
            relationship: 0,
            messages: [],
            lastContact: new Date(),
            pendingReplies: []
        },
        dailyLimits: {
            lastReset: new Date(),
            phreakingAttempts: 0,
            hackingAttempts: 0,
            programmingSessions: 0,
            tradingVisits: 0,
            chatMessages: 0,
            downloads: 0,
            posts: 0,
            bbsHacks: 0
        },
        currentMode: 'character_creation',
        previousMode: 'main_menu',
        inputBuffer: ''
    };
}
/**
 * Update player skill level based on individual skills
 */
export function updateSkillLevel(gameState) {
    const avgSkill = (gameState.player.skills.phreaking + gameState.player.skills.programming + gameState.player.skills.hacking) / 3;
    gameState.player.skillLevel = Math.min(10.0, avgSkill / 10);
}
/**
 * Calculate overall game progress (0-100)
 */
export function calculateGameProgress(gameState) {
    let progress = 0;
    // Skill level progress (0-40 points)
    progress += (gameState.player.skillLevel / 10.0) * 40;
    // Achievement progress (0-30 points)
    const totalAchievements = 6; // Novice, Apprentice, Journeyman, Expert, Master, Legendary
    const achievementCount = gameState.player.achievements.length;
    progress += (achievementCount / totalAchievements) * 30;
    // Equipment progress (0-15 points)
    let equipmentScore = 0;
    if (gameState.player.computer.ram > 64)
        equipmentScore += 5;
    if (gameState.player.computer.storage > 170)
        equipmentScore += 5;
    if (gameState.player.computer.modemSpeed > 300)
        equipmentScore += 5;
    progress += equipmentScore;
    // Relationship progress (0-10 points)
    progress += (gameState.shadow.relationship / 100) * 10;
    // BBS ownership progress (0-5 points)
    if (gameState.ownBbs)
        progress += 5;
    return Math.min(100, Math.max(0, progress));
}
/**
 * Update achievements based on skill level
 */
export function updateAchievements(gameState) {
    if (gameState.player.skillLevel >= 1.0 && !gameState.player.achievements.includes('Novice Hacker')) {
        gameState.player.achievements.push('Novice Hacker');
    }
    if (gameState.player.skillLevel >= 3.0 && !gameState.player.achievements.includes('Apprentice Hacker')) {
        gameState.player.achievements.push('Apprentice Hacker');
    }
    if (gameState.player.skillLevel >= 5.0 && !gameState.player.achievements.includes('Journeyman Hacker')) {
        gameState.player.achievements.push('Journeyman Hacker');
    }
    if (gameState.player.skillLevel >= 7.0 && !gameState.player.achievements.includes('Expert Hacker')) {
        gameState.player.achievements.push('Expert Hacker');
    }
    if (gameState.player.skillLevel >= 9.0 && !gameState.player.achievements.includes('Master Hacker')) {
        gameState.player.achievements.push('Master Hacker');
    }
}
/**
 * Get next achievement milestone
 */
export function getNextMilestone(gameState) {
    if (gameState.player.skillLevel < 1.0)
        return 'Reach skill level 1.0 for Novice Hacker';
    if (gameState.player.skillLevel < 3.0)
        return 'Reach skill level 3.0 for Apprentice Hacker';
    if (gameState.player.skillLevel < 5.0)
        return 'Reach skill level 5.0 for Journeyman Hacker';
    if (gameState.player.skillLevel < 7.0)
        return 'Reach skill level 7.0 for Expert Hacker';
    if (gameState.player.skillLevel < 9.0)
        return 'Reach skill level 9.0 for Master Hacker';
    if (gameState.player.skillLevel < 10.0)
        return 'Reach skill level 10.0 for LEGENDARY HACKER';
    return '';
}
/**
 * Check and reset daily limits if a new day has started
 */
export function checkAndResetDailyLimits(gameState) {
    const now = new Date();
    const lastReset = new Date(gameState.dailyLimits.lastReset);
    // Check if it's a new day (reset at midnight)
    if (now.getDate() !== lastReset.getDate() ||
        now.getMonth() !== lastReset.getMonth() ||
        now.getFullYear() !== lastReset.getFullYear()) {
        // Reset all daily limits
        gameState.dailyLimits = {
            lastReset: now,
            phreakingAttempts: 0,
            hackingAttempts: 0,
            programmingSessions: 0,
            tradingVisits: 0,
            chatMessages: 0,
            downloads: 0,
            posts: 0,
            bbsHacks: 0
        };
    }
}
/**
 * Check if player has reached daily limit for an action
 */
export function checkDailyLimit(gameState, limitType, currentCount) {
    const limit = DAILY_LIMITS[limitType];
    return currentCount >= limit;
}
/**
 * Display daily limits status
 */
export function displayDailyLimits(socket, gameState) {
    socket.emit('ansi-output', '\x1b[36m-= DAILY ACTIVITY LIMITS =-\x1b[0m\r\n\r\n');
    const limits = [
        { name: 'Phreaking Attempts', current: gameState.dailyLimits.phreakingAttempts, max: DAILY_LIMITS.PHREAKING_ATTEMPTS },
        { name: 'Hacking Attempts', current: gameState.dailyLimits.hackingAttempts, max: DAILY_LIMITS.HACKING_ATTEMPTS },
        { name: 'Programming Sessions', current: gameState.dailyLimits.programmingSessions, max: DAILY_LIMITS.PROGRAMMING_SESSIONS },
        { name: 'Trading Visits', current: gameState.dailyLimits.tradingVisits, max: DAILY_LIMITS.TRADING_VISITS },
        { name: 'Chat Messages', current: gameState.dailyLimits.chatMessages, max: DAILY_LIMITS.CHAT_MESSAGES },
        { name: 'File Downloads', current: gameState.dailyLimits.downloads, max: DAILY_LIMITS.DOWNLOADS },
        { name: 'Message Posts', current: gameState.dailyLimits.posts, max: DAILY_LIMITS.POSTS },
        { name: 'BBS Hacks', current: gameState.dailyLimits.bbsHacks, max: DAILY_LIMITS.BBS_HACKS }
    ];
    limits.forEach(limit => {
        const color = limit.current >= limit.max ? '\x1b[31m' : '\x1b[32m';
        socket.emit('ansi-output', `${color}${limit.name}: ${limit.current}/${limit.max}\x1b[0m\r\n`);
    });
    socket.emit('ansi-output', '\r\n\x1b[33mLimits reset daily at midnight!\x1b[0m\r\n');
}
/**
 * Delete player and create new one
 */
export function deletePlayer(userId) {
    gameStates.delete(userId);
    const newGameState = createNewGameState();
    gameStates.set(userId, newGameState);
    return newGameState;
}
