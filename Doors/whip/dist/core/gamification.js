"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateLevel = calculateLevel;
exports.getLevelStars = getLevelStars;
exports.getLevelColor = getLevelColor;
exports.getPointsForNextLevel = getPointsForNextLevel;
exports.getProgressToNextLevel = getProgressToNextLevel;
exports.createProgressBar = createProgressBar;
exports.formatPoints = formatPoints;
exports.getPriorityColor = getPriorityColor;
exports.getStatusColor = getStatusColor;
function calculateLevel(points) {
    if (points < 100)
        return 'lamer';
    if (points < 500)
        return 'scener';
    if (points < 2000)
        return 'elite';
    return 'legend';
}
function getLevelStars(level) {
    switch (level) {
        case 'lamer': return '*---';
        case 'scener': return '**--';
        case 'elite': return '***-';
        case 'legend': return '****';
    }
}
function getLevelColor(level) {
    switch (level) {
        case 'lamer': return 'gray';
        case 'scener': return 'cyan';
        case 'elite': return 'yellow';
        case 'legend': return 'magenta';
    }
}
function getPointsForNextLevel(level) {
    switch (level) {
        case 'lamer': return 100;
        case 'scener': return 500;
        case 'elite': return 2000;
        case 'legend': return 0; // Max level
    }
}
function getProgressToNextLevel(user) {
    const currentThreshold = getPointsForPreviousLevel(user.level);
    const nextThreshold = getPointsForNextLevel(user.level);
    if (nextThreshold === 0)
        return 100; // Max level
    const pointsInCurrentLevel = user.points - currentThreshold;
    const pointsNeededForLevel = nextThreshold - currentThreshold;
    return Math.floor((pointsInCurrentLevel / pointsNeededForLevel) * 100);
}
function getPointsForPreviousLevel(level) {
    switch (level) {
        case 'lamer': return 0;
        case 'scener': return 100;
        case 'elite': return 500;
        case 'legend': return 2000;
    }
}
function createProgressBar(percent, width = 20) {
    const filled = Math.floor((percent / 100) * width);
    const empty = width - filled;
    return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}
function formatPoints(points) {
    return points.toLocaleString();
}
function getPriorityColor(priority) {
    switch (priority) {
        case 'lamer': return 'gray';
        case 'scener': return 'cyan';
        case 'elite': return 'yellow';
        case 'legend': return 'magenta';
        default: return 'white';
    }
}
function getStatusColor(status) {
    switch (status) {
        case 'todo': return 'white';
        case 'in-progress': return 'yellow';
        case 'testing': return 'cyan';
        case 'done': return 'green';
        default: return 'white';
    }
}
