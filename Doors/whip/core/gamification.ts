import type { UserLevel, UserStats } from '../types/user';

export function calculateLevel(points: number): UserLevel {
  if (points < 100) return 'lamer';
  if (points < 500) return 'scener';
  if (points < 2000) return 'elite';
  return 'legend';
}

export function getLevelStars(level: UserLevel): string {
  switch (level) {
    case 'lamer': return '*---';
    case 'scener': return '**--';
    case 'elite': return '***-';
    case 'legend': return '****';
  }
}

export function getLevelColor(level: UserLevel): string {
  switch (level) {
    case 'lamer': return 'gray';
    case 'scener': return 'cyan';
    case 'elite': return 'yellow';
    case 'legend': return 'magenta';
  }
}

export function getPointsForNextLevel(level: UserLevel): number {
  switch (level) {
    case 'lamer': return 100;
    case 'scener': return 500;
    case 'elite': return 2000;
    case 'legend': return 0; // Max level
  }
}

export function getProgressToNextLevel(user: UserStats): number {
  const currentThreshold = getPointsForPreviousLevel(user.level);
  const nextThreshold = getPointsForNextLevel(user.level);

  if (nextThreshold === 0) return 100; // Max level

  const pointsInCurrentLevel = user.points - currentThreshold;
  const pointsNeededForLevel = nextThreshold - currentThreshold;

  return Math.floor((pointsInCurrentLevel / pointsNeededForLevel) * 100);
}

function getPointsForPreviousLevel(level: UserLevel): number {
  switch (level) {
    case 'lamer': return 0;
    case 'scener': return 100;
    case 'elite': return 500;
    case 'legend': return 2000;
  }
}

export function createProgressBar(percent: number, width: number = 20): string {
  const filled = Math.floor((percent / 100) * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

export function formatPoints(points: number): string {
  return points.toLocaleString();
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'lamer': return 'gray';
    case 'scener': return 'cyan';
    case 'elite': return 'yellow';
    case 'legend': return 'magenta';
    default: return 'white';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'todo': return 'white';
    case 'in-progress': return 'yellow';
    case 'testing': return 'cyan';
    case 'done': return 'green';
    default: return 'white';
  }
}
