"use strict";
/**
 * Gamification System - Points, Badges, Achievements
 *
 * Features:
 * - Points for bug reports
 * - Achievement system
 * - User levels
 * - Leaderboards
 * - Badges and titles
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GamificationSystem = void 0;
class GamificationSystem {
    constructor() {
        this.userStats = new Map();
        this.achievements = [];
        this.badges = [];
        this.initializeAchievements();
        this.initializeBadges();
    }
    /**
     * Initialize achievement system
     */
    initializeAchievements() {
        this.achievements = [
            // Reporting achievements
            {
                id: 'first-bug',
                name: 'First Bug',
                description: 'Report your first bug',
                icon: '🐛',
                points: 10,
                condition: (stats) => stats.bugsReported >= 1
            },
            {
                id: 'bug-hunter',
                name: 'Bug Hunter',
                description: 'Report 10 bugs',
                icon: '🎯',
                points: 50,
                condition: (stats) => stats.bugsReported >= 10
            },
            {
                id: 'bug-master',
                name: 'Bug Master',
                description: 'Report 50 bugs',
                icon: '⭐',
                points: 200,
                condition: (stats) => stats.bugsReported >= 50
            },
            {
                id: 'bug-legend',
                name: 'Bug Legend',
                description: 'Report 100 bugs',
                icon: '👑',
                points: 500,
                condition: (stats) => stats.bugsReported >= 100
            },
            // Critical bugs
            {
                id: 'critical-finder',
                name: 'Critical Finder',
                description: 'Find your first critical bug',
                icon: '⚠️',
                points: 100,
                condition: (stats) => stats.criticalBugsFound >= 1
            },
            {
                id: 'crisis-spotter',
                name: 'Crisis Spotter',
                description: 'Find 5 critical bugs',
                icon: '🚨',
                points: 500,
                condition: (stats) => stats.criticalBugsFound >= 5
            },
            // Engagement
            {
                id: 'commentator',
                name: 'Commentator',
                description: 'Post 20 comments',
                icon: '💬',
                points: 50,
                condition: (stats) => stats.commentsPosted >= 20
            },
            {
                id: 'helpful',
                name: 'Helpful',
                description: 'Have 10 bugs marked as fixed',
                icon: '✅',
                points: 150,
                condition: (stats) => stats.bugsFixed >= 10
            },
            // Milestones
            {
                id: 'level-5',
                name: 'Rising Star',
                description: 'Reach level 5',
                icon: '🌟',
                points: 100,
                condition: (stats) => stats.level >= 5
            },
            {
                id: 'level-10',
                name: 'Expert',
                description: 'Reach level 10',
                icon: '💎',
                points: 300,
                condition: (stats) => stats.level >= 10
            },
            {
                id: 'early-adopter',
                name: 'Early Adopter',
                description: 'Among the first 10 users',
                icon: '🚀',
                points: 200,
                condition: (stats) => stats.userId <= 10
            },
            // Special
            {
                id: 'perfectionist',
                name: 'Perfectionist',
                description: 'Report 5 bugs with all fields filled',
                icon: '💯',
                points: 150,
                condition: (stats) => stats.bugsReported >= 5
            }
        ];
    }
    /**
     * Initialize badge system
     */
    initializeBadges() {
        this.badges = [
            // Common badges
            {
                id: 'reporter',
                name: 'Bug Reporter',
                description: 'Report at least 1 bug',
                icon: '🐛',
                rarity: 'common'
            },
            {
                id: 'active',
                name: 'Active User',
                description: 'Regular participation',
                icon: '⚡',
                rarity: 'common'
            },
            // Uncommon badges
            {
                id: 'contributor',
                name: 'Contributor',
                description: 'Report 10+ bugs',
                icon: '🎯',
                rarity: 'uncommon'
            },
            {
                id: 'quality-assurance',
                name: 'Quality Assurance',
                description: 'High quality bug reports',
                icon: '✓',
                rarity: 'uncommon'
            },
            // Rare badges
            {
                id: 'master-reporter',
                name: 'Master Reporter',
                description: 'Report 50+ bugs',
                icon: '⭐',
                rarity: 'rare'
            },
            {
                id: 'critical-hunter',
                name: 'Critical Hunter',
                description: 'Find 5+ critical bugs',
                icon: '🚨',
                rarity: 'rare'
            },
            // Epic badges
            {
                id: 'legend',
                name: 'BBS Legend',
                description: 'Report 100+ bugs',
                icon: '👑',
                rarity: 'epic'
            },
            {
                id: 'mvp',
                name: 'MVP',
                description: 'Most valuable contributor',
                icon: '🏆',
                rarity: 'epic'
            },
            // Legendary badges
            {
                id: 'hall-of-fame',
                name: 'Hall of Fame',
                description: 'Top contributor of all time',
                icon: '💫',
                rarity: 'legendary'
            }
        ];
    }
    /**
     * Get or create user stats
     */
    getUserStats(userId, userName) {
        if (!this.userStats.has(userId)) {
            this.userStats.set(userId, {
                userId,
                userName,
                points: 0,
                level: 1,
                bugsReported: 0,
                bugsFixed: 0,
                criticalBugsFound: 0,
                commentsPosted: 0,
                achievements: [],
                achievementUnlockTimes: {},
                badges: [],
                joinedAt: Date.now(),
                lastActive: Date.now()
            });
        }
        const stats = this.userStats.get(userId);
        stats.lastActive = Date.now();
        // Ensure achievementUnlockTimes exists (for backward compatibility with old saves)
        if (!stats.achievementUnlockTimes) {
            stats.achievementUnlockTimes = {};
        }
        return stats;
    }
    /**
     * Award points to user
     */
    awardPoints(userId, userName, points, reason) {
        const stats = this.getUserStats(userId, userName);
        stats.points += points;
        // Check for level up
        const newLevel = this.calculateLevel(stats.points);
        if (newLevel > stats.level) {
            stats.level = newLevel;
            // Level up achievement check
            this.checkAchievements(stats);
        }
    }
    /**
     * Calculate level from points
     */
    calculateLevel(points) {
        // Formula: level = floor(sqrt(points / 100)) + 1
        return Math.floor(Math.sqrt(points / 100)) + 1;
    }
    /**
     * Calculate points needed for next level
     */
    getPointsForNextLevel(currentLevel) {
        // Reverse formula: points = (level - 1)^2 * 100
        return Math.pow(currentLevel, 2) * 100;
    }
    /**
     * Record bug report
     */
    recordBugReport(userId, userName, isCritical) {
        const stats = this.getUserStats(userId, userName);
        stats.bugsReported++;
        if (isCritical) {
            stats.criticalBugsFound++;
            this.awardPoints(userId, userName, 50, 'Critical bug reported');
        }
        else {
            this.awardPoints(userId, userName, 10, 'Bug reported');
        }
        this.checkAchievements(stats);
    }
    /**
     * Record bug fixed (called by sysop)
     */
    recordBugFixed(reporterUserId) {
        const stats = this.userStats.get(reporterUserId);
        if (stats) {
            stats.bugsFixed++;
            this.awardPoints(reporterUserId, stats.userName, 20, 'Bug fixed');
            this.checkAchievements(stats);
        }
    }
    /**
     * Record comment posted
     */
    recordComment(userId, userName) {
        const stats = this.getUserStats(userId, userName);
        stats.commentsPosted++;
        this.awardPoints(userId, userName, 2, 'Comment posted');
        this.checkAchievements(stats);
    }
    /**
     * Check and unlock achievements
     */
    checkAchievements(stats) {
        const unlocked = [];
        const now = Date.now();
        for (const achievement of this.achievements) {
            if (!stats.achievements.includes(achievement.id) && achievement.condition(stats)) {
                stats.achievements.push(achievement.id);
                stats.achievementUnlockTimes[achievement.id] = now;
                this.awardPoints(stats.userId, stats.userName, achievement.points, `Achievement: ${achievement.name}`);
                unlocked.push(achievement.id);
                // Award corresponding badge
                this.awardBadge(stats, achievement.id);
            }
        }
        return unlocked;
    }
    /**
     * Award badge to user
     */
    awardBadge(stats, badgeId) {
        if (!stats.badges.includes(badgeId)) {
            stats.badges.push(badgeId);
        }
    }
    /**
     * Get leaderboard
     */
    getLeaderboard(limit = 10) {
        return Array.from(this.userStats.values())
            .sort((a, b) => b.points - a.points)
            .slice(0, limit);
    }
    /**
     * Get user rank
     */
    getUserRank(userId) {
        const leaderboard = Array.from(this.userStats.values())
            .sort((a, b) => b.points - a.points);
        return leaderboard.findIndex(s => s.userId === userId) + 1;
    }
    /**
     * Get unlocked achievements for user
     */
    getUserAchievements(userId) {
        const stats = this.userStats.get(userId);
        if (!stats)
            return [];
        return this.achievements
            .filter(a => stats.achievements.includes(a.id))
            .map(a => ({
            ...a,
            unlockedAt: stats.achievementUnlockTimes[a.id]
        }));
    }
    /**
     * Get available achievements (not yet unlocked)
     */
    getAvailableAchievements(userId) {
        const stats = this.userStats.get(userId);
        if (!stats)
            return this.achievements;
        return this.achievements.filter(a => !stats.achievements.includes(a.id));
    }
    /**
     * Get user badges
     */
    getUserBadges(userId) {
        const stats = this.userStats.get(userId);
        if (!stats)
            return [];
        return this.badges.filter(b => stats.badges.includes(b.id));
    }
    /**
     * Get user title based on level/achievements
     */
    getUserTitle(userId) {
        const stats = this.userStats.get(userId);
        if (!stats)
            return 'Newbie';
        if (stats.level >= 20)
            return 'Legendary Bug Hunter';
        if (stats.level >= 15)
            return 'Master Bug Hunter';
        if (stats.level >= 10)
            return 'Expert Bug Hunter';
        if (stats.level >= 5)
            return 'Bug Hunter';
        if (stats.bugsReported >= 1)
            return 'Bug Reporter';
        return 'Newbie';
    }
    /**
     * Save stats to file
     */
    save(filepath) {
        const fs = require('fs');
        const statsArray = Array.from(this.userStats.values());
        fs.writeFileSync(filepath, JSON.stringify(statsArray, null, 2));
    }
    /**
     * Load stats from file
     */
    load(filepath) {
        const fs = require('fs');
        if (fs.existsSync(filepath)) {
            const data = fs.readFileSync(filepath, 'utf-8');
            const statsArray = JSON.parse(data);
            statsArray.forEach(stats => {
                this.userStats.set(stats.userId, stats);
            });
        }
    }
}
exports.GamificationSystem = GamificationSystem;
