import {
  ANSIColor,
  RPGCharacter,
  CombatSystem,
  HighScoreManager,
  GameUtils
} from '../../src/game-engine';

interface MazeCell {
  type: 'wall' | 'floor' | 'exit' | 'treasure' | 'monster';
  visited: boolean;
}

class RPGAdventure {
  private socket: any;
  private player: RPGCharacter;
  private combat: CombatSystem;
  private highScores: HighScoreManager;
  private username: string;
  private doorDirectory: string;
  private maze: MazeCell[][] = [];
  private playerX: number = 1;
  private playerY: number = 1;
  private score: number = 0;
  private treasuresFound: number = 0;
  private monstersDefeated: number = 0;
  private gameRunning: boolean = true;

  constructor(socket: any, bbsSession: any, doorDirectory: string) {
    this.socket = socket;
    this.username = bbsSession.username || 'Player';
    this.doorDirectory = doorDirectory;

    this.player = new RPGCharacter({
      name: this.username,
      level: 1,
      experience: 0,
      health: 100,
      maxHealth: 100,
      mana: 50,
      maxMana: 50,
      gold: 0,
      inventory: [],
      equipment: {}
    });

    this.combat = new CombatSystem();
    this.highScores = new HighScoreManager(doorDirectory);

    this.generateMaze(15, 15);
  }

  async run(): Promise<void> {
    try {
      await this.showIntro();
      await this.gameLoop();
      await this.showGameOver();
    } catch (error) {
      console.error('Game error:', error);
      this.output('\r\n[ERROR] An error occurred. Please contact the sysop.\r\n');
    }
  }

  private async showIntro(): Promise<void> {
    let output = '\x1b[2J\x1b[H'; // Clear screen
    output += '\x1b[36m'; // Cyan
    output += this.centerText('==============================================================') + '\r\n';
    output += this.centerText('                RPG ADVENTURE') + '\r\n';
    output += this.centerText('           Maze Explorer & Combat') + '\r\n';
    output += this.centerText('==============================================================') + '\r\n';
    output += '\x1b[0m\r\n'; // Reset

    output += 'Welcome, ' + this.username + '!\r\n\r\n';
    output += 'Your quest: Navigate the maze, defeat monsters, collect treasure,\r\n';
    output += 'and find the exit!\r\n\r\n';

    output += '\x1b[33mControls:\x1b[0m\r\n';
    output += '  W - Move North\r\n';
    output += '  S - Move South\r\n';
    output += '  A - Move West\r\n';
    output += '  D - Move East\r\n';
    output += '  I - View Inventory/Stats\r\n';
    output += '  Q - Quit Game\r\n\r\n';

    output += '\x1b[32mLegend:\x1b[0m\r\n';
    output += '  @ - You\r\n';
    output += '  # - Wall\r\n';
    output += '  . - Floor (visited)\r\n';
    output += '  ? - Unexplored\r\n';
    output += '  E - Exit\r\n';
    output += '  T - Treasure\r\n';
    output += '  M - Monster\r\n\r\n';

    output += 'Press any key to begin your adventure...\r\n';
    this.socket.emit('ansi-output', output);

    await this.waitForKey();
  }

  private generateMaze(width: number, height: number): void {
    // Initialize maze with walls
    for (let y = 0; y < height; y++) {
      this.maze[y] = [];
      for (let x = 0; x < width; x++) {
        this.maze[y][x] = { type: 'wall', visited: false };
      }
    }

    // Create paths using recursive backtracking
    this.carvePath(1, 1);

    // Place player at start
    this.playerX = 1;
    this.playerY = 1;
    this.maze[1][1].visited = true;

    // Place exit at opposite corner
    const exitX = width - 2;
    const exitY = height - 2;
    this.maze[exitY][exitX].type = 'exit';

    // Place treasures (5-8 random locations)
    const treasureCount = GameUtils.random(5, 8);
    for (let i = 0; i < treasureCount; i++) {
      const x = GameUtils.random(1, width - 2);
      const y = GameUtils.random(1, height - 2);
      if (this.maze[y][x].type === 'floor' && (x !== 1 || y !== 1)) {
        this.maze[y][x].type = 'treasure';
      }
    }

    // Place monsters (3-6 random locations)
    const monsterCount = GameUtils.random(3, 6);
    for (let i = 0; i < monsterCount; i++) {
      const x = GameUtils.random(1, width - 2);
      const y = GameUtils.random(1, height - 2);
      if (this.maze[y][x].type === 'floor' && (x !== 1 || y !== 1)) {
        this.maze[y][x].type = 'monster';
      }
    }
  }

  private carvePath(x: number, y: number): void {
    this.maze[y][x].type = 'floor';

    const directions = [
      { dx: 0, dy: -2 }, // North
      { dx: 0, dy: 2 },  // South
      { dx: -2, dy: 0 }, // West
      { dx: 2, dy: 0 }   // East
    ];

    GameUtils.shuffle(directions);

    for (const dir of directions) {
      const newX = x + dir.dx;
      const newY = y + dir.dy;

      if (
        newY > 0 &&
        newY < this.maze.length - 1 &&
        newX > 0 &&
        newX < this.maze[0].length - 1 &&
        this.maze[newY][newX].type === 'wall'
      ) {
        // Carve path between current and new cell
        this.maze[y + dir.dy / 2][x + dir.dx / 2].type = 'floor';
        this.carvePath(newX, newY);
      }
    }
  }

  private async gameLoop(): Promise<void> {
    while (this.gameRunning) {
      this.drawMaze();
      const input = await this.getInput();

      if (!input) continue;

      const key = input.toLowerCase();

      switch (key) {
        case 'w': await this.move(0, -1); break;
        case 's': await this.move(0, 1); break;
        case 'a': await this.move(-1, 0); break;
        case 'd': await this.move(1, 0); break;
        case 'i': await this.showStats(); break;
        case 'q':
          this.gameRunning = false;
          break;
      }

      if (!this.player.isAlive()) {
        this.gameRunning = false;
        this.output('\r\n\x1b[31mYou have been defeated!\x1b[0m\r\n');
        await this.waitForKey();
      }
    }
  }

  private drawMaze(): void {
    let output = '\x1b[2J\x1b[H'; // Clear screen

    // Header
    output += '\x1b[33mRPG Adventure\x1b[0m - ' + this.username + '\r\n';
    output += `HP: \x1b[32m${this.player.health}/${this.player.maxHealth}\x1b[0m | `;
    output += `Score: \x1b[33m${this.score}\x1b[0m | `;
    output += `Treasure: \x1b[33m${this.treasuresFound}\x1b[0m | `;
    output += `Monsters: \x1b[31m${this.monstersDefeated}\x1b[0m\r\n\r\n`;

    // Draw maze
    for (let y = 0; y < this.maze.length; y++) {
      for (let x = 0; x < this.maze[y].length; x++) {
        if (x === this.playerX && y === this.playerY) {
          output += '\x1b[36m@\x1b[0m'; // Player in cyan
        } else {
          const cell = this.maze[y][x];
          switch (cell.type) {
            case 'wall':
              output += '#';
              break;
            case 'floor':
              output += cell.visited ? '.' : ' ';
              break;
            case 'exit':
              output += '\x1b[32mE\x1b[0m'; // Green exit
              break;
            case 'treasure':
              output += cell.visited ? '.' : '\x1b[33mT\x1b[0m'; // Yellow treasure
              break;
            case 'monster':
              output += cell.visited ? '.' : '\x1b[31mM\x1b[0m'; // Red monster
              break;
          }
        }
      }
      output += '\r\n';
    }

    output += '\r\n[W/A/S/D] Move  [I] Stats  [Q] Quit\r\n';
    this.socket.emit('ansi-output', output);
  }

  private async move(dx: number, dy: number): Promise<void> {
    const newX = this.playerX + dx;
    const newY = this.playerY + dy;

    // Check bounds
    if (
      newY < 0 ||
      newY >= this.maze.length ||
      newX < 0 ||
      newX >= this.maze[0].length
    ) {
      return;
    }

    const targetCell = this.maze[newY][newX];

    // Can't move through walls
    if (targetCell.type === 'wall') {
      return;
    }

    // Move player
    this.playerX = newX;
    this.playerY = newY;
    targetCell.visited = true;

    // Handle cell type
    if (targetCell.type === 'treasure') {
      await this.foundTreasure();
      targetCell.type = 'floor';
    } else if (targetCell.type === 'monster') {
      await this.encounterMonster();
      targetCell.type = 'floor';
    } else if (targetCell.type === 'exit') {
      this.gameRunning = false;
      this.output('\r\n\x1b[32m[SUCCESS] You found the exit!\x1b[0m\r\n');
      this.score += 1000;
      await this.waitForKey();
    }
  }

  private async foundTreasure(): Promise<void> {
    const goldFound = GameUtils.random(20, 100);
    this.player.addGold(goldFound);
    this.treasuresFound++;
    this.score += 100;

    let output = '\r\n\x1b[33m[TREASURE] You found ' + goldFound + ' gold!\x1b[0m\r\n';
    output += 'Press any key...\r\n';
    this.socket.emit('ansi-output', output);

    await this.waitForKey();
  }

  private async encounterMonster(): Promise<void> {
    // Create enemy
    const enemy = new RPGCharacter({
      name: 'Dungeon Monster',
      level: GameUtils.random(1, 3),
      experience: 0,
      health: GameUtils.random(30, 60),
      maxHealth: 60,
      mana: 0,
      maxMana: 0,
      gold: 0,
      inventory: [],
      equipment: {}
    });

    let output = '\r\n\x1b[31m[BATTLE] A monster appears!\x1b[0m\r\n';
    output += `Enemy: ${enemy.name} (HP: ${enemy.health})\r\n\r\n`;
    output += 'Press any key to fight...\r\n';
    this.socket.emit('ansi-output', output);
    await this.waitForKey();

    // Combat loop
    while (this.player.isAlive() && enemy.isAlive()) {
      // Player attacks
      const playerDamage = GameUtils.random(10, 25);
      enemy.takeDamage(playerDamage);

      output = `\r\nYou attack for ${playerDamage} damage!\r\n`;
      output += `Enemy HP: ${enemy.health}/${enemy.maxHealth}\r\n`;

      if (!enemy.isAlive()) {
        output += '\x1b[32m[VICTORY] Monster defeated!\x1b[0m\r\n';
        this.monstersDefeated++;
        this.score += 200;

        const xpGain = 50;
        this.player.gainExperience(xpGain);
        output += `Gained ${xpGain} XP!\r\n`;

        this.socket.emit('ansi-output', output);
        await this.waitForKey();
        break;
      }

      // Enemy attacks
      const enemyDamage = GameUtils.random(5, 15);
      this.player.takeDamage(enemyDamage);

      output += `\r\nMonster attacks for ${enemyDamage} damage!\r\n`;
      output += `Your HP: ${this.player.health}/${this.player.maxHealth}\r\n`;
      output += '\r\nPress any key...\r\n';

      this.socket.emit('ansi-output', output);
      await this.waitForKey();

      if (!this.player.isAlive()) {
        break;
      }
    }
  }

  private async showStats(): Promise<void> {
    const stats = this.player.formatCharacterSheet();

    let output = '\x1b[2J\x1b[H'; // Clear screen
    output += stats;
    output += `\r\nScore: ${this.score}\r\n`;
    output += `Treasures Found: ${this.treasuresFound}\r\n`;
    output += `Monsters Defeated: ${this.monstersDefeated}\r\n`;
    output += '\r\nPress any key...\r\n';

    this.socket.emit('ansi-output', output);
    await this.waitForKey();
  }

  private async showGameOver(): Promise<void> {
    let output = '\x1b[2J\x1b[H'; // Clear screen
    output += '\x1b[36m'; // Cyan
    output += this.centerText('==============================================================') + '\r\n';
    output += this.centerText('                GAME OVER') + '\r\n';
    output += this.centerText('==============================================================') + '\r\n';
    output += '\x1b[0m\r\n'; // Reset

    output += `Final Score: \x1b[33m${this.score}\x1b[0m\r\n`;
    output += `Treasures Found: \x1b[33m${this.treasuresFound}\x1b[0m\r\n`;
    output += `Monsters Defeated: \x1b[31m${this.monstersDefeated}\x1b[0m\r\n`;
    output += `Final Level: \x1b[32m${this.player.level}\x1b[0m\r\n\r\n`;

    // Save high score
    this.highScores.addScore({
      playerName: this.username,
      score: this.score,
      level: this.player.level,
      timestamp: Date.now()
    });

    // Show high scores
    const topScores = this.highScores.getTopScores(5);
    if (topScores.length > 0) {
      output += '\x1b[33mHigh Scores:\x1b[0m\r\n';
      topScores.forEach((score, i) => {
        output += `${i + 1}. ${score.playerName} - ${score.score} pts (Lvl ${score.level})\r\n`;
      });
      output += '\r\n';
    }

    output += 'Thanks for playing!\r\n';
    output += 'Press any key to exit...\r\n';
    this.socket.emit('ansi-output', output);

    await this.waitForKey();
  }

  private centerText(text: string, width: number = 80): string {
    return GameUtils.centerText(text, width);
  }

  private output(text: string): void {
    this.socket.emit('ansi-output', text);
  }

  private async getInput(): Promise<string> {
    return new Promise((resolve) => {
      const handler = (data: string) => {
        this.socket.removeListener('user-input', handler);
        resolve(data.trim());
      };
      this.socket.on('user-input', handler);
    });
  }

  private async waitForKey(): Promise<void> {
    return new Promise((resolve) => {
      const handler = () => {
        this.socket.removeListener('user-input', handler);
        resolve();
      };
      this.socket.once('user-input', handler);
    });
  }
}

// Export door function
export async function runDoor(doorSession: any): Promise<void> {
  const doorDirectory = doorSession.doorDirectory || process.cwd();
  const game = new RPGAdventure(doorSession.socket, doorSession, doorDirectory);
  await game.run();
}
