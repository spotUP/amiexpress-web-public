/**
 * High Score Persistence System
 *
 * Manages saving, loading, and querying high scores per game mode
 */

import type { GameMode, GameResult, TGMGrade } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * High score entry
 */
export interface HighScoreEntry {
  rank: number;
  playerName: string;
  mode: GameMode;
  score: number;
  level: number;
  lines: number;
  grade: TGMGrade;
  time: number | null;  // milliseconds
  date: string;  // ISO 8601
  completed: boolean;  // Did they finish the mode?
}

/**
 * High score storage structure
 */
interface HighScoreData {
  version: string;
  entries: HighScoreEntry[];
}

/**
 * High score manager
 */
export class HighScoreManager {
  private filePath: string;
  private data: HighScoreData;
  private maxEntriesPerMode: number = 10;

  constructor(filePath?: string) {
    // Default to data directory in SDK
    this.filePath = filePath || path.join(__dirname, '../../data/high-scores.json');
    this.data = this.load();
  }

  /**
   * Load high scores from disk
   */
  private load(): HighScoreData {
    try {
      if (fs.existsSync(this.filePath)) {
        const json = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(json);
      }
    } catch (error) {
      console.error('Failed to load high scores:', error);
    }

    // Return empty data if file doesn't exist or failed to load
    return {
      version: '1.0.0',
      entries: [],
    };
  }

  /**
   * Save high scores to disk
   */
  private save(): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write to file
      const json = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(this.filePath, json, 'utf-8');
    } catch (error) {
      console.error('Failed to save high scores:', error);
    }
  }

  /**
   * Add a new score entry
   */
  addScore(
    playerName: string,
    result: GameResult
  ): { isHighScore: boolean; rank: number | null } {
    // Create new entry
    const entry: HighScoreEntry = {
      rank: 0,  // Will be calculated
      playerName,
      mode: result.mode,
      score: result.score,
      level: result.level,
      lines: result.lines,
      grade: result.grade as TGMGrade,
      time: result.time,
      date: new Date().toISOString(),
      completed: result.completed,
    };

    // Get existing scores for this mode
    const modeEntries = this.data.entries.filter(e => e.mode === result.mode);

    // Add new entry
    modeEntries.push(entry);

    // Sort by score (descending), then by time (ascending for ties)
    modeEntries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.time === null) return 1;
      if (b.time === null) return -1;
      return a.time - b.time;
    });

    // Keep only top N entries
    const topEntries = modeEntries.slice(0, this.maxEntriesPerMode);

    // Check if our entry made it to the leaderboard
    const rank = topEntries.findIndex(e =>
      e.playerName === playerName &&
      e.score === result.score &&
      e.date === entry.date
    );

    const isHighScore = rank !== -1;

    if (isHighScore) {
      // Assign ranks
      topEntries.forEach((e, i) => {
        e.rank = i + 1;
      });

      // Replace mode entries with top entries
      this.data.entries = this.data.entries.filter(e => e.mode !== result.mode);
      this.data.entries.push(...topEntries);

      // Save to disk
      this.save();

      return { isHighScore: true, rank: rank + 1 };
    }

    return { isHighScore: false, rank: null };
  }

  /**
   * Get top scores for a specific mode
   */
  getTopScores(mode: GameMode, limit: number = 10): HighScoreEntry[] {
    return this.data.entries
      .filter(e => e.mode === mode)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.time === null) return 1;
        if (b.time === null) return -1;
        return a.time - b.time;
      })
      .slice(0, limit);
  }

  /**
   * Get personal best for a player in a mode
   */
  getPersonalBest(playerName: string, mode: GameMode): HighScoreEntry | null {
    const entries = this.data.entries
      .filter(e => e.mode === mode && e.playerName === playerName)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.time === null) return 1;
        if (b.time === null) return -1;
        return a.time - b.time;
      });

    return entries.length > 0 ? entries[0] : null;
  }

  /**
   * Get all-time top scores across all modes
   */
  getAllTimeTop(limit: number = 10): HighScoreEntry[] {
    return this.data.entries
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.time === null) return 1;
        if (b.time === null) return -1;
        return a.time - b.time;
      })
      .slice(0, limit);
  }

  /**
   * Check if a score qualifies as a high score (without adding it)
   */
  isHighScore(mode: GameMode, score: number): boolean {
    const modeEntries = this.data.entries.filter(e => e.mode === mode);

    // If we have fewer than max entries, it's automatically a high score
    if (modeEntries.length < this.maxEntriesPerMode) {
      return true;
    }

    // Check if score beats the lowest entry
    const lowestScore = Math.min(...modeEntries.map(e => e.score));
    return score > lowestScore;
  }

  /**
   * Get statistics for a player
   */
  getPlayerStats(playerName: string): {
    totalGames: number;
    highestScore: number;
    bestGrade: TGMGrade;
    averageScore: number;
    modesPlayed: GameMode[];
  } {
    const entries = this.data.entries.filter(e => e.playerName === playerName);

    if (entries.length === 0) {
      return {
        totalGames: 0,
        highestScore: 0,
        bestGrade: '9',
        averageScore: 0,
        modesPlayed: [],
      };
    }

    const highestScore = Math.max(...entries.map(e => e.score));
    const averageScore = Math.floor(
      entries.reduce((sum, e) => sum + e.score, 0) / entries.length
    );

    // Get unique modes
    const modesPlayed = Array.from(new Set(entries.map(e => e.mode)));

    // Find best grade (GM > M > m > S > numeric)
    const gradeOrder: TGMGrade[] = [
      'GMM', 'GM', 'MO', 'MV', 'MK', 'M',
      'm9', 'm8', 'm7', 'm6', 'm5', 'm4', 'm3', 'm2', 'm1',
      'S13', 'S12', 'S11', 'S10',
      'S9', 'S8', 'S7', 'S6', 'S5', 'S4', 'S3', 'S2', 'S1',
      '1', '2', '3', '4', '5', '6', '7', '8', '9'
    ];

    let bestGrade: TGMGrade = '9';
    for (const grade of gradeOrder) {
      if (entries.some(e => e.grade === grade)) {
        bestGrade = grade;
        break;
      }
    }

    return {
      totalGames: entries.length,
      highestScore,
      bestGrade,
      averageScore,
      modesPlayed,
    };
  }

  /**
   * Clear all high scores (for testing)
   */
  clear(): void {
    this.data = {
      version: '1.0.0',
      entries: [],
    };
    this.save();
  }

  /**
   * Reset high scores for a specific mode
   */
  clearMode(mode: GameMode): void {
    this.data.entries = this.data.entries.filter(e => e.mode !== mode);
    this.save();
  }
}
