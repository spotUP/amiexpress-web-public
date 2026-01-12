/**
 * Leaderboard Screen
 *
 * Displays high scores and rankings for all game modes
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { createDockable } from './dockable';
import type { HighScoreManager, HighScoreEntry } from '../core/high-scores';
import type { SoundEngine } from '../audio/sounds';
import type { GameMode } from '../core/types';

/**
 * Leaderboard screen
 */
export class LeaderboardScreen {
  private currentMode: GameMode = 'master';
  private playerName: string;

  constructor(
    private screen: Screen,
    private highScores: HighScoreManager,
    private sounds: SoundEngine,
    playerName: string
  ) {
    this.playerName = playerName;
  }

  /**
   * Show leaderboard and wait for exit
   */
  async show(): Promise<void> {
    // Enable mouse control for tab switching
    this.screen.program.enableMouse();

    return new Promise((resolve) => {
      this.render();

      // Handle key events
      const keyHandler = (ch: any, key: any) => {
        if (!key) return;

        if (key.name === 'escape' || key.name === 'q') {
          this.screen.unkey(['escape', 'q'], keyHandler);
          this.screen.unkey(['left', 'right', 'tab'], modeHandler);
          this.sounds.playSfx('menu_select');
          resolve();
        }
      };

      const modeHandler = (ch: any, key: any) => {
        if (!key) return;

        if (key.name === 'left' || (key.name === 'tab' && key.shift)) {
          this.previousMode();
          this.sounds.playSfx('menu_select');
          this.render();
        } else if (key.name === 'right' || key.name === 'tab') {
          this.nextMode();
          this.sounds.playSfx('menu_select');
          this.render();
        }
      };

      this.screen.key(['escape', 'q'], keyHandler);
      this.screen.key(['left', 'right', 'tab'], modeHandler);
    });
  }

  /**
   * Cycle to previous mode
   */
  private previousMode(): void {
    const modes: GameMode[] = ['master', 'death', 'sprint', 'marathon', 'versus', 'training'];
    const index = modes.indexOf(this.currentMode);
    this.currentMode = modes[(index - 1 + modes.length) % modes.length];
  }

  /**
   * Cycle to next mode
   */
  private nextMode(): void {
    const modes: GameMode[] = ['master', 'death', 'sprint', 'marathon', 'versus', 'training'];
    const index = modes.indexOf(this.currentMode);
    this.currentMode = modes[(index + 1) % modes.length];
  }

  /**
   * Render leaderboard
   */
  private render(): void {
    // Clear screen
    this.screen.children.forEach(child => child.destroy());

    // Title
    const title = createBox({
      parent: this.screen,
      top: 0,
      left: 'center',
      width: 70,
      height: 3,
      content: '{bold}{yellow-fg}═══ LEADERBOARDS ═══{/yellow-fg}{/bold}',
    });

    // Mode tabs
    const modeTabs = this.renderModeTabs();
    const modeTabsBox = createBox({
      parent: this.screen,
      top: 3,
      left: 'center',
      width: 70,
      height: 3,
      content: modeTabs,
    });

    // Top scores
    const topScores = this.highScores.getTopScores(this.currentMode, 10);
    const scoresContent = this.renderScoresTable(topScores);
    const scoresBox = createDockable({
      parent: this.screen,
      top: 6,
      left: 2,
      width: 76,
      height: 14,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      label: ` Top 10 - ${this.getModeName(this.currentMode)} `,
      content: scoresContent,
      persistenceKey: 'grandmaster.leaderboard.scores',
    });

    // Personal best
    const personalBest = this.highScores.getPersonalBest(this.playerName, this.currentMode);
    const personalContent = this.renderPersonalBest(personalBest);
    const personalBox = createDockable({
      parent: this.screen,
      top: 20,
      left: 2,
      width: 76,
      height: 4,
      border: { type: 'line' },
      style: { border: { fg: 'magenta' } },
      label: ' Your Best ',
      content: personalContent,
      persistenceKey: 'grandmaster.leaderboard.personal',
    });

    // Instructions
    const instructions = createBox({
      parent: this.screen,
      bottom: 0,
      left: 'center',
      width: 70,
      height: 1,
      content: '{gray-fg}← → / TAB: Change Mode  |  Q/ESC: Back{/gray-fg}',
    });

    this.screen.render();
  }

  /**
   * Render mode tabs
   */
  private renderModeTabs(): string {
    const modes: Array<{ mode: GameMode; name: string }> = [
      { mode: 'master', name: 'MASTER' },
      { mode: 'death', name: 'DEATH' },
      { mode: 'sprint', name: 'SPRINT' },
      { mode: 'marathon', name: 'MARATHON' },
      { mode: 'versus', name: 'VERSUS' },
      { mode: 'training', name: 'TRAINING' },
    ];

    let tabs = '';
    for (const { mode, name } of modes) {
      if (mode === this.currentMode) {
        tabs += `{black-bg}{white-fg}{bold}[ ${name} ]{/bold}{/white-fg}{/black-bg} `;
      } else {
        tabs += `{gray-fg}  ${name}  {/gray-fg} `;
      }
    }
    tabs += '';

    return tabs;
  }

  /**
   * Get display name for mode
   */
  private getModeName(mode: GameMode): string {
    const names: Record<GameMode, string> = {
      master: 'Master Mode',
      death: 'Death Mode (Shirase)',
      sprint: '40-Line Sprint',
      marathon: 'Marathon',
      versus: 'Versus Mode',
      training: 'Training Mode',
      dig: 'Dig Mode',
      ultra: 'Ultra Mode',
      blitz: 'Blitz Mode',
      combo: 'Combo Challenge',
      survival: 'Survival Mode',
      classic: 'Classic Mode',
      zen: 'Zen Mode',
      cpu_battle: 'CPU Battle',
      tetrinet: 'TetriNET',
    };
    return names[mode];
  }

  /**
   * Render scores table
   */
  private renderScoresTable(scores: HighScoreEntry[]): string {
    if (scores.length === 0) {
      return '\n\n{gray-fg}No scores yet{/gray-fg}\n\nBe the first to set a record!';
    }

    let content = '{bold}  #  Player              Grade  Level    Score      Time      Date{/bold}\n';
    content += '  ───────────────────────────────────────────────────────────────────\n';

    for (let i = 0; i < 10; i++) {
      if (i < scores.length) {
        const entry = scores[i];
        const rank = this.formatRank(i + 1);
        const player = this.formatPlayer(entry.playerName);
        const grade = this.formatGrade(entry.grade);
        const level = this.formatLevel(entry.level);
        const score = this.formatScore(entry.score);
        const time = this.formatTime(entry.time);
        const date = this.formatDate(entry.date);

        content += `  ${rank}  ${player}  ${grade}  ${level}  ${score}  ${time}  ${date}\n`;
      } else {
        content += `  ${this.formatRank(i + 1)}  {gray-fg}───{/gray-fg}\n`;
      }
    }

    return content;
  }

  /**
   * Render personal best
   */
  private renderPersonalBest(best: HighScoreEntry | null): string {
    if (!best) {
      return '{gray-fg}No personal record in this mode yet{/gray-fg}';
    }

    return (
      `Grade: ${this.formatGrade(best.grade)}  |  ` +
      `Level: ${this.formatLevel(best.level)}  |  ` +
      `Score: ${this.formatScore(best.score)}  |  ` +
      `Time: ${this.formatTime(best.time)}  |  ` +
      `Date: ${this.formatDate(best.date)}`
    );
  }

  /**
   * Format rank
   */
  private formatRank(rank: number): string {
    const color = rank === 1 ? 'yellow' : rank === 2 ? 'white' : rank === 3 ? 'red' : 'gray';
    return `{${color}-fg}${rank.toString().padStart(2, ' ')}{/${color}-fg}`;
  }

  /**
   * Format player name
   */
  private formatPlayer(name: string): string {
    return `{cyan-fg}${name.substring(0, 15).padEnd(15, ' ')}{/cyan-fg}`;
  }

  /**
   * Format grade
   */
  private formatGrade(grade: string): string {
    const color = grade === 'GMM' || grade === 'GM' ? 'yellow' : grade.startsWith('M') ? 'red' : grade.startsWith('m') ? 'magenta' : grade.startsWith('S') ? 'cyan' : 'white';
    return `{${color}-fg}{bold}${grade.padEnd(4, ' ')}{/bold}{/${color}-fg}`;
  }

  /**
   * Format level
   */
  private formatLevel(level: number): string {
    return `{white-fg}${level.toString().padStart(4, ' ')}{/white-fg}`;
  }

  /**
   * Format score
   */
  private formatScore(score: number): string {
    return `{yellow-fg}${score.toLocaleString().padStart(8, ' ')}{/yellow-fg}`;
  }

  /**
   * Format time
   */
  private formatTime(time: number | null): string {
    if (time === null) {
      return '{gray-fg}  --:--  {/gray-fg}';
    }

    const minutes = Math.floor(time / 60000);
    const seconds = Math.floor((time % 60000) / 1000);
    const ms = Math.floor((time % 1000) / 10);

    return `{white-fg}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}{/white-fg}`;
  }

  /**
   * Format date
   */
  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear().toString().substring(2);
    return `{gray-fg}${month}/${day}/${year}{/gray-fg}`;
  }
}
