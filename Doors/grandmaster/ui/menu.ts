/**
 * Main Menu Screen
 *
 * Displays game mode selection and options
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/core/screen';
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { AppState } from '../core/types';
import type { SoundEngine } from '../audio/sounds';

export type MenuSelection =
  | 'master'
  | 'death'
  | 'sprint'
  | 'marathon'
  | 'cpu_battle'
  | 'versus'
  | 'training'
  | 'settings'
  | 'stats'
  | 'quit';

/**
 * Main menu screen
 */
export class MenuScreen {
  constructor(
    private screen: Screen,
    private state: AppState,
    private sounds: SoundEngine
  ) {}

  /**
   * Show menu and wait for selection
   */
  async show(): Promise<MenuSelection> {
    return new Promise((resolve) => {
      // Play menu music
      this.sounds.playMusic('menu', true);

      // Clear screen completely
      this.screen.children.forEach(child => child.destroy());

      // Full-screen background to clear any previous content
      const background = createBox({
        parent: this.screen,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        style: {
          bg: 'black',
        },
      });

      // Title box - centered, wide enough for ASCII art
      const title = createBox({
        parent: this.screen,
        top: 1,
        left: 'center',
        width: 70,
        height: 7,
        content: this.getTitleArt(),
        style: {
          fg: 'yellow',
          bg: 'black',
        },
      });

      // Calculate centered layout for 80 columns
      // Total width: 24 + 1 + 28 + 1 + 18 = 72, margin = (80-72)/2 = 4
      const leftMargin = 4;

      // Mode selection list - left panel
      const menu = createList({
        parent: this.screen,
        top: 9,
        left: leftMargin,
        width: 24,
        height: 12,
        border: { type: 'line' },
        label: ' SELECT MODE ',
        style: {
          border: { fg: 'cyan' },
          selected: { bg: 'cyan', fg: 'black' },
          item: { fg: 'white' },
        },
        keys: true,
        vi: true,
        mouse: true,
        items: [
          'MASTER MODE',
          'DEATH MODE',
          'SPRINT 40L',
          'MARATHON',
          'CPU BATTLE',
          'VERSUS',
          'TRAINING',
          '',
          'Settings',
          'Statistics',
          '{red-fg}Quit{/red-fg}',
        ],
      });

      // Mode description box - middle panel
      const descBox = createBox({
        parent: this.screen,
        top: 9,
        left: leftMargin + 25,  // After menu + 1 gap
        width: 28,
        height: 12,
        border: { type: 'line' },
        label: ' DESCRIPTION ',
        style: { border: { fg: 'gray' } },
        content: this.getModeDescription(0),
      });

      // Update description when selection changes
      menu.on('select item', (_item: any, index: number) => {
        descBox.setContent(this.getModeDescription(index));
        this.screen.render();
      });

      // Info box - right panel
      const info = createBox({
        parent: this.screen,
        top: 9,
        left: leftMargin + 54,  // After menu + descBox + gaps
        width: 18,
        height: 12,
        border: { type: 'line' },
        label: ' PLAYER ',
        style: { border: { fg: 'gray' } },
        content: this.getPlayerInfo(),
      });

      // Instructions
      const instructions = createBox({
        parent: this.screen,
        bottom: 0,
        left: 0,
        width: '100%',
        height: 1,
        align: 'center',
        style: { fg: 'gray', bg: 'black' },
        content: 'Arrow Keys: Navigate  |  Enter: Select  |  Q: Quit',
      });

      // Ensure title is rendered on top (z-index fix)
      title.setFront();
      this.screen.render();

      // Handle selection
      menu.on('select', (_item: any, index: number) => {
        const selections: MenuSelection[] = [
          'master',
          'death',
          'sprint',
          'marathon',
          'cpu_battle',
          'versus',
          'training',
          'master',  // Separator line, default to master
          'settings',
          'stats',
          'quit',
        ];

        const selection = selections[index];
        this.sounds.playSfx('move');

        // Clean up
        background.destroy();
        title.destroy();
        menu.destroy();
        descBox.destroy();
        info.destroy();
        instructions.destroy();
        this.screen.render();

        resolve(selection);
      });

      // Handle quit key
      menu.key(['q', 'Q'], () => {
        menu.emit('select', null, 9);  // Trigger quit selection
      });

      // Focus and render
      menu.focus();
      this.screen.render();
    });
  }

  /**
   * Get title ASCII art
   */
  private getTitleArt(): string {
    return `{bold}{yellow-fg}
 _____ _____ _____ _____ ____  _____ _____ _____ _____ _____ _____
|   __|  _  |  _  |   | |    \\|     |  _  |   __|_   _|   __| __  |
|  |  |     |     |\\    |  |  | | | |     |__   | | | |   __|    -|
|_____|__|__|__|__|_|___|____/|_|_|_|__|__|_____| |_| |_____|__|__|

{/yellow-fg}{gray-fg}TGM3-Inspired Multiplayer Tetris{/gray-fg}{/bold}`;
  }

  /**
   * Get mode description for selected index
   */
  private getModeDescription(index: number): string {
    const descriptions = [
      // MASTER MODE
      '{bold}{cyan-fg}MASTER MODE{/cyan-fg}{/bold}\n\n' +
      'Classic TGM3-style\n' +
      'grading system.\n\n' +
      'Reach GM grade by\n' +
      'mastering speed,\n' +
      'efficiency & skill.',

      // DEATH MODE
      '{bold}{red-fg}DEATH MODE{/red-fg}{/bold}\n\n' +
      '20G gravity from\n' +
      'the very start!\n\n' +
      'Shirase-style\n' +
      'extreme challenge.',

      // SPRINT 40L
      '{bold}{green-fg}SPRINT 40L{/green-fg}{/bold}\n\n' +
      'Clear 40 lines as\n' +
      'fast as possible.\n\n' +
      'Pure speed test.',

      // MARATHON
      '{bold}{yellow-fg}MARATHON{/yellow-fg}{/bold}\n\n' +
      'Endless survival.\n' +
      'How long can you\n' +
      'last?\n\n' +
      'No level cap.',

      // CPU BATTLE
      '{bold}{magenta-fg}CPU BATTLE{/magenta-fg}{/bold}\n\n' +
      'Battle against AI\n' +
      'opponents.\n\n' +
      'Test your skills\n' +
      'vs the computer.',

      // VERSUS
      '{bold}{blue-fg}VERSUS{/blue-fg}{/bold}\n\n' +
      'Online multiplayer!\n\n' +
      'Battle other BBS\n' +
      'users in real-time.',

      // TRAINING
      '{bold}{white-fg}TRAINING{/white-fg}{/bold}\n\n' +
      'Practice mode.\n\n' +
      'Learn techniques,\n' +
      'no pressure.',

      // Empty separator
      '',

      // Settings
      '{gray-fg}Configure game\noptions, controls,\nand preferences.{/gray-fg}',

      // Statistics
      '{gray-fg}View your play\nhistory, records,\nand achievements.{/gray-fg}',

      // Quit
      '{gray-fg}Exit GRANDMASTER\nand return to BBS.{/gray-fg}',
    ];

    return descriptions[index] || '';
  }

  /**
   * Get player info display
   */
  private getPlayerInfo(): string {
    const stats = this.state.stats;
    return `{cyan-fg}${this.state.playerName}{/cyan-fg}\n\n` +
      `Grade: {yellow-fg}${stats.bestGrade}{/yellow-fg}\n` +
      `Level: ${stats.bestLevel}\n` +
      `Games: ${stats.gamesPlayed}\n` +
      `Lines: ${stats.totalLines}`;
  }
}
