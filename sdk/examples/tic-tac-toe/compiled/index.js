"use strict";
/**
 * Tic-Tac-Toe - Simple BBS Door Game
 * Single player vs AI
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
class TicTacToe {
    constructor() {
        this.board = [[' ', ' ', ' '], [' ', ' ', ' '], [' ', ' ', ' ']];
        this.currentPlayer = 'X';
        this.gameOver = false;
        this.winner = null;
        this.currentUserId = 0;
        this.door = new bbs_door_sdk_1.Door({
            name: 'Tic-Tac-Toe',
            version: '1.0.0',
            author: 'AmiExpress Team',
        });
        this.gfx = new bbs_door_sdk_1.GraphicsEngine({ width: 80, height: 24 });
        this.door.onConnect((user) => {
            this.currentUserId = user.id;
            this.render();
        });
        this.door.onInput((_user, key) => {
            this.handleInput(key.key);
        });
    }
    handleInput(key) {
        if (this.gameOver) {
            if (key === 'n' || key === 'N') {
                this.resetGame();
            }
            else if (key === 'q' || key === 'Q') {
                this.door.disconnect(this.currentUserId);
            }
            return;
        }
        // Only allow player X to move
        if (this.currentPlayer !== 'X')
            return;
        const moves = {
            '1': [2, 0], '2': [2, 1], '3': [2, 2],
            '4': [1, 0], '5': [1, 1], '6': [1, 2],
            '7': [0, 0], '8': [0, 1], '9': [0, 2],
        };
        if (key in moves) {
            const [row, col] = moves[key];
            if (this.board[row][col] === ' ') {
                this.board[row][col] = 'X';
                this.checkWinner();
                this.render();
                if (!this.gameOver) {
                    // AI move
                    setTimeout(() => {
                        this.aiMove();
                        this.checkWinner();
                        this.render();
                    }, 500);
                }
            }
        }
        else if (key === 'q' || key === 'Q') {
            this.door.disconnect(this.currentUserId);
        }
    }
    aiMove() {
        // Simple AI: find first empty cell
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                if (this.board[row][col] === ' ') {
                    this.board[row][col] = 'O';
                    this.currentPlayer = 'X';
                    return;
                }
            }
        }
    }
    checkWinner() {
        // Check rows
        for (let row = 0; row < 3; row++) {
            if (this.board[row][0] !== ' ' &&
                this.board[row][0] === this.board[row][1] &&
                this.board[row][1] === this.board[row][2]) {
                this.gameOver = true;
                this.winner = this.board[row][0];
                return;
            }
        }
        // Check columns
        for (let col = 0; col < 3; col++) {
            if (this.board[0][col] !== ' ' &&
                this.board[0][col] === this.board[1][col] &&
                this.board[1][col] === this.board[2][col]) {
                this.gameOver = true;
                this.winner = this.board[0][col];
                return;
            }
        }
        // Check diagonals
        if (this.board[0][0] !== ' ' &&
            this.board[0][0] === this.board[1][1] &&
            this.board[1][1] === this.board[2][2]) {
            this.gameOver = true;
            this.winner = this.board[0][0];
            return;
        }
        if (this.board[0][2] !== ' ' &&
            this.board[0][2] === this.board[1][1] &&
            this.board[1][1] === this.board[2][0]) {
            this.gameOver = true;
            this.winner = this.board[0][2];
            return;
        }
        // Check for draw
        let hasEmpty = false;
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                if (this.board[row][col] === ' ') {
                    hasEmpty = true;
                    break;
                }
            }
        }
        if (!hasEmpty) {
            this.gameOver = true;
            this.winner = 'Draw';
        }
    }
    resetGame() {
        this.board = [[' ', ' ', ' '], [' ', ' ', ' '], [' ', ' ', ' ']];
        this.currentPlayer = 'X';
        this.gameOver = false;
        this.winner = null;
        this.render();
    }
    render() {
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        // Title
        this.gfx.drawText(30, 2, 'TIC-TAC-TOE', bbs_door_sdk_1.AnsiColor.Cyan);
        // Draw board
        const startX = 30;
        const startY = 6;
        // Horizontal lines
        this.gfx.drawText(startX, startY + 2, '---+---+---', bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(startX, startY + 4, '---+---+---', bbs_door_sdk_1.AnsiColor.White);
        // Draw cells
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const x = startX + col * 4 + 1;
                const y = startY + row * 2;
                const cell = this.board[row][col];
                const color = cell === 'X' ? bbs_door_sdk_1.AnsiColor.Green : cell === 'O' ? bbs_door_sdk_1.AnsiColor.Red : bbs_door_sdk_1.AnsiColor.White;
                this.gfx.drawText(x, y, cell === ' ' ? ' ' : cell, color);
            }
        }
        // Draw number hints
        const hints = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];
        let hintIdx = 0;
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                if (this.board[row][col] === ' ') {
                    const x = startX + col * 4 + 1;
                    const y = startY + row * 2;
                    this.gfx.drawText(x, y, hints[hintIdx], bbs_door_sdk_1.AnsiColor.BrightBlack);
                }
                hintIdx++;
            }
        }
        // Status
        if (this.gameOver) {
            if (this.winner === 'Draw') {
                this.gfx.drawText(28, 14, "IT'S A DRAW!", bbs_door_sdk_1.AnsiColor.Yellow);
            }
            else {
                this.gfx.drawText(26, 14, `${this.winner} WINS!`, bbs_door_sdk_1.AnsiColor.Green);
            }
            this.gfx.drawText(22, 16, 'N=NEW GAME  Q=QUIT', bbs_door_sdk_1.AnsiColor.White);
        }
        else {
            this.gfx.drawText(20, 14, `Your turn (X) - Press 1-9`, bbs_door_sdk_1.AnsiColor.Yellow);
            this.gfx.drawText(28, 16, 'Q=QUIT', bbs_door_sdk_1.AnsiColor.White);
        }
        this.door.sendAnsi(this.gfx.render(), this.currentUserId);
    }
    start() {
        this.door.start();
    }
}
const game = new TicTacToe();
game.start();
