import { HighScore } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * High Score Manager for tracking game scores
 */
export class HighScoreManager {
  private scores: HighScore[] = [];
  private maxScores: number;
  private filename: string;
  private doorDirectory: string;

  constructor(doorDirectory: string, filename: string = 'highscores.json', maxScores: number = 10) {
    this.doorDirectory = doorDirectory;
    this.filename = filename;
    this.maxScores = maxScores;
    this.loadScores();
  }

  /**
   * Add a new high score
   */
  addScore(username: string, score: number, level?: number): boolean {
    const newScore: HighScore = {
      username,
      score,
      date: new Date(),
      level
    };

    this.scores.push(newScore);
    this.scores.sort((a, b) => b.score - a.score);
    this.scores = this.scores.slice(0, this.maxScores);

    this.saveScores();
    return this.scores.some(s => s.username === username && s.score === score);
  }

  /**
   * Get all high scores
   */
  getScores(): HighScore[] {
    return [...this.scores];
  }

  /**
   * Check if score qualifies for high score list
   */
  isHighScore(score: number): boolean {
    return this.scores.length < this.maxScores || score > (this.scores[this.scores.length - 1]?.score || 0);
  }

  /**
   * Get rank of a score (1-based)
   */
  getRank(score: number): number {
    for (let i = 0; i < this.scores.length; i++) {
      if (score > this.scores[i].score) {
        return i + 1;
      }
    }
    return this.scores.length + 1;
  }

  /**
   * Generate formatted high scores table
   */
  formatScores(title: string = 'High Scores'): string {
    let output = '';
    output += title + '\r\n';
    output += '─'.repeat(60) + '\r\n';

    if (this.scores.length === 0) {
      output += 'No high scores yet!\r\n';
      return output;
    }

    output += 'Rank  Score     Player              Date\r\n';
    output += '────  ────────  ──────────────────  ───────────\r\n';

    this.scores.forEach((score, index) => {
      const rank = (index + 1).toString().padStart(4);
      const scoreStr = score.score.toString().padStart(9);
      const player = score.username.padEnd(17);
      const date = score.date.toLocaleDateString().padEnd(12);

      output += `${rank}  ${scoreStr}  ${player}  ${date}\r\n`;
    });

    return output;
  }

  /**
   * Clear all scores
   */
  clear(): void {
    this.scores = [];
    this.saveScores();
  }

  private loadScores(): void {
    try {
      const filePath = path.join(this.doorDirectory, this.filename);

      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(data);
        this.scores = parsed.map((s: any) => ({
          ...s,
          date: new Date(s.date)
        }));
      }
    } catch (error) {
      console.error('Error loading high scores:', error);
      this.scores = [];
    }
  }

  private saveScores(): void {
    try {
      const filePath = path.join(this.doorDirectory, this.filename);
      fs.writeFileSync(filePath, JSON.stringify(this.scores, null, 2));
    } catch (error) {
      console.error('Error saving high scores:', error);
    }
  }
}
