/**
 * Tic-Tac-Toe - Multiplayer Example
 *
 * Demonstrates turn-based multiplayer with the Network Engine.
 *
 * Features:
 * - Turn-based gameplay
 * - Room/session management
 * - Player synchronization
 * - Win condition detection
 * - Rematch system
 */

import {
  Door,
  GraphicsEngine,
  NetworkEngine,
  AnsiColor
} from '@amiexpress/bbs-door-sdk';

type Player = 'X' | 'O';
type Cell = Player | null;
type Board = Cell[][];

class TicTacToe {
  private door: Door;
  private gfx: GraphicsEngine;
  private network: NetworkEngine;

  private board: Board;
  private currentPlayer: Player = 'X';
  private gameOver: boolean = false;
  private winner?: Player;
  private userId?: number;
  private opponentId?: number;
  private mySymbol?: Player;

  constructor() {
    this.door = new Door({
      name: 'Tic-Tac-Toe',
      version: '1.0.0',
      author: 'AmiExpress SDK Team',
      description: 'Turn-based multiplayer Tic-Tac-Toe',
      multiplayer: true
    });

    this.gfx = new GraphicsEngine({ width: 80, height: 24 });
    this.network = new NetworkEngine({ mode: 'turn-based' });

    this.board = this.createEmptyBoard();
    this.setupNetworkEvents();
    this.setupDoorEvents();
  }

  private createEmptyBoard(): Board {
    return [
      [null, null, null],
      [null, null, null],
      [null, null, null]
    ];
  }

  private setupDoorEvents() {
    this.door.onConnect(async (user: any) => {
      this.userId = user.id;
      await this.network.init(user.id, user.name);
      this.showMainMenu();
    });

    this.door.onInput((user, keyEvent) => {
      if (this.gameOver) {
        if (keyEvent.key.toLowerCase() === 'r') {
          this.resetGame();
        } else if (keyEvent.key.toLowerCase() === 'q') {
          this.quit();
        }
        return;
      }

      // Handle move input (1-9 for cells)
      const move = parseInt(keyEvent.key);
      if (move >= 1 && move <= 9) {
        this.makeMove(move - 1);
      }
    });

    this.door.onDisconnect(() => {
      this.network.leaveRoom();
      this.network.dispose();
    });
  }

  private setupNetworkEvents() {
    this.network.onPlayerJoin((player) => {
      if (!this.userId) return;
      if (player.id !== this.userId) {
        this.opponentId = player.id;
        this.gfx.clear(AnsiColor.Black);
        this.gfx.drawText(25, 10, `${player.name} joined the game!`, AnsiColor.Green);
        this.gfx.drawText(25, 12, 'Press any key to start...', AnsiColor.Yellow);
        this.door.sendAnsi(this.gfx.render(), this.userId);

        // Start game if we have 2 players
        const room = this.network.getCurrentRoom();
        if (room && room.players.length === 2) {
          setTimeout(() => this.startGame(), 2000);
        }
      }
    });

    this.network.onMessage((message) => {
      if (message.type === 'move') {
        this.handleOpponentMove(message.data);
      } else if (message.type === 'rematch') {
        this.resetGame();
      }
    });

    this.network.onTurnStart((player) => {
      if (!this.userId) return;
      const isMyTurn = player.id === this.userId;
      this.render();

      if (isMyTurn) {
        this.gfx.drawText(28, 20, "It's your turn!", AnsiColor.Green);
      } else {
        this.gfx.drawText(25, 20, `Waiting for ${player.name}...`, AnsiColor.Yellow);
      }
      this.door.sendAnsi(this.gfx.render(), this.userId);
    });

    this.network.onGameStart(() => {
      this.startGame();
    });
  }

  private showMainMenu() {
    if (!this.userId) return;

    this.gfx.clear(AnsiColor.Black);
    this.gfx.drawText(30, 5, '╔════════════════╗', AnsiColor.Cyan);
    this.gfx.drawText(30, 6, '║ TIC-TAC-TOE   ║', AnsiColor.Cyan);
    this.gfx.drawText(30, 7, '╚════════════════╝', AnsiColor.Cyan);

    this.gfx.drawText(28, 10, '1. Create Game', AnsiColor.Yellow);
    this.gfx.drawText(28, 11, '2. Join Game', AnsiColor.Yellow);
    this.gfx.drawText(28, 12, 'Q. Quit', AnsiColor.Yellow);

    this.gfx.drawText(25, 15, 'Select an option:', AnsiColor.White);
    this.door.sendAnsi(this.gfx.render(), this.userId);

    // Handle menu input
    const menuHandler = (user: any, keyEvent: any) => {
      if (keyEvent.key === '1') {
        this.createGame();
        this.door.off('input', menuHandler);
      } else if (keyEvent.key === '2') {
        this.joinGame();
        this.door.off('input', menuHandler);
      } else if (keyEvent.key.toLowerCase() === 'q') {
        this.quit();
      }
    };

    this.door.onInput(menuHandler);
  }

  private createGame() {
    if (!this.userId) return;

    const roomId = `ttt_${Date.now()}`;
    this.network.createRoom(roomId, {
      maxPlayers: 2,
      turnBased: true,
      allowSpectators: false
    });

    this.mySymbol = 'X'; // Host is always X

    this.gfx.clear(AnsiColor.Black);
    this.gfx.drawText(25, 10, 'Game created!', AnsiColor.Green);
    this.gfx.drawText(25, 12, 'Waiting for opponent...', AnsiColor.Yellow);
    this.gfx.drawText(25, 14, `Room ID: ${roomId}`, AnsiColor.Cyan);
    this.door.sendAnsi(this.gfx.render(), this.userId);
  }

  private joinGame() {
    if (!this.userId) return;

    // In production, show room list
    // For now, join the first available room
    const rooms = this.network.listRooms();
    if (rooms.length === 0) {
      this.gfx.clear(AnsiColor.Black);
      this.gfx.drawText(25, 10, 'No games available!', AnsiColor.Red);
      this.gfx.drawText(25, 12, 'Press any key to return...', AnsiColor.Yellow);
      this.door.sendAnsi(this.gfx.render(), this.userId);

      setTimeout(() => this.showMainMenu(), 2000);
      return;
    }

    this.network.joinRoom(rooms[0].config.id);
    this.mySymbol = 'O'; // Joiner is always O
  }

  private startGame() {
    if (!this.userId) return;

    this.resetBoard();
    this.gameOver = false;
    this.winner = undefined;
    this.currentPlayer = 'X';

    this.render();

    const turnPlayer = this.network.getCurrentTurnPlayer();
    if (turnPlayer?.id === this.userId) {
      this.gfx.drawText(28, 20, "It's your turn!", AnsiColor.Green);
    } else {
      this.gfx.drawText(25, 20, "Waiting for opponent...", AnsiColor.Yellow);
    }

    this.door.sendAnsi(this.gfx.render(), this.userId);
  }

  private resetBoard() {
    this.board = this.createEmptyBoard();
  }

  private makeMove(position: number) {
    if (!this.userId) return;

    const turnPlayer = this.network.getCurrentTurnPlayer();
    if (!turnPlayer || turnPlayer.id !== this.userId) {
      return; // Not our turn
    }

    const row = Math.floor(position / 3);
    const col = position % 3;

    if (this.board[row][col] !== null) {
      return; // Cell already taken
    }

    // Make the move
    this.board[row][col] = this.mySymbol!;

    // Send move to opponent
    if (this.opponentId) {
      this.network.sendTo(this.opponentId, 'move', { position, player: this.mySymbol });
    }

    // Check win condition
    if (this.checkWin(this.mySymbol!)) {
      this.gameOver = true;
      this.winner = this.mySymbol;
      this.showGameOver();
      return;
    }

    // Check draw
    if (this.isBoardFull()) {
      this.gameOver = true;
      this.showGameOver();
      return;
    }

    // End turn
    this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
    this.network.endTurn();
  }

  private handleOpponentMove(data: { position: number; player: Player }) {
    const row = Math.floor(data.position / 3);
    const col = data.position % 3;

    this.board[row][col] = data.player;

    // Check win condition
    if (this.checkWin(data.player)) {
      this.gameOver = true;
      this.winner = data.player;
      this.showGameOver();
      return;
    }

    // Check draw
    if (this.isBoardFull()) {
      this.gameOver = true;
      this.showGameOver();
      return;
    }

    this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
    this.render();
  }

  private checkWin(player: Player): boolean {
    // Check rows
    for (let row = 0; row < 3; row++) {
      if (this.board[row].every(cell => cell === player)) {
        return true;
      }
    }

    // Check columns
    for (let col = 0; col < 3; col++) {
      if (this.board.every(row => row[col] === player)) {
        return true;
      }
    }

    // Check diagonals
    if (this.board[0][0] === player && this.board[1][1] === player && this.board[2][2] === player) {
      return true;
    }
    if (this.board[0][2] === player && this.board[1][1] === player && this.board[2][0] === player) {
      return true;
    }

    return false;
  }

  private isBoardFull(): boolean {
    return this.board.every(row => row.every(cell => cell !== null));
  }

  private render() {
    if (!this.userId) return;

    this.gfx.clear(AnsiColor.Black);

    // Title
    this.gfx.drawText(32, 2, 'TIC-TAC-TOE', AnsiColor.Cyan);

    // Board
    const boardX = 32;
    const boardY = 6;

    this.gfx.drawText(boardX, boardY,     ' 1 │ 2 │ 3 ', AnsiColor.White);
    this.gfx.drawText(boardX, boardY + 1, '───┼───┼───', AnsiColor.White);
    this.gfx.drawText(boardX, boardY + 2, ' 4 │ 5 │ 6 ', AnsiColor.White);
    this.gfx.drawText(boardX, boardY + 3, '───┼───┼───', AnsiColor.White);
    this.gfx.drawText(boardX, boardY + 4, ' 7 │ 8 │ 9 ', AnsiColor.White);

    // Draw pieces
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cell = this.board[row][col];
        if (cell) {
          const x = boardX + 1 + (col * 4);
          const y = boardY + (row * 2);
          const color = cell === 'X' ? AnsiColor.Cyan : AnsiColor.Magenta;
          this.gfx.drawChar(x, y, cell, color);
        }
      }
    }

    // Instructions
    this.gfx.drawText(20, 14, 'Press 1-9 to place your mark', AnsiColor.Yellow);
    this.gfx.drawText(20, 15, `You are: ${this.mySymbol}`, AnsiColor.Green);

    this.door.sendAnsi(this.gfx.render(), this.userId);
  }

  private showGameOver() {
    if (!this.userId) return;

    this.render();

    if (this.winner) {
      const iWon = this.winner === this.mySymbol;
      const message = iWon ? 'YOU WIN!' : 'YOU LOSE!';
      const color = iWon ? AnsiColor.Green : AnsiColor.Red;
      this.gfx.drawText(33, 18, message, color);
    } else {
      this.gfx.drawText(34, 18, "IT'S A DRAW!", AnsiColor.Yellow);
    }

    this.gfx.drawText(30, 20, 'R: Rematch   Q: Quit', AnsiColor.White);
    this.door.sendAnsi(this.gfx.render(), this.userId);
  }

  private resetGame() {
    this.resetBoard();
    this.gameOver = false;
    this.winner = undefined;
    this.currentPlayer = 'X';

    if (this.opponentId) {
      this.network.sendTo(this.opponentId, 'rematch', {});
    }

    this.startGame();
  }

  private quit() {
    if (this.userId) {
      this.door.disconnect(this.userId);
    }
  }

  start() {
    this.door.start();
  }
}

const game = new TicTacToe();
game.start();
