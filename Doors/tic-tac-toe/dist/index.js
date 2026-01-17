"use strict";
/**
 * Tic-Tac-Toe - SDK v2.0 Demo Door
 * Simple single-player vs AI game
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
class TicTacToeGame {
    constructor() {
        this.board = [[' ', ' ', ' '], [' ', ' ', ' '], [' ', ' ', ' ']];
        this.gameOver = false;
        this.winner = null;
    }
    setContext(ctx) {
        this.ctx = ctx;
    }
    handleInput(key) {
        if (this.gameOver) {
            if (key === 'n' || key === 'N') {
                this.resetGame();
            }
            else if (key === 'q' || key === 'Q') {
                // Exit door by clearing input handler
                if (this.ctx.bbsSession) {
                    this.ctx.bbsSession.doorInputHandler = null;
                }
            }
            return;
        }
        const moves = {
            '7': [0, 0], '8': [0, 1], '9': [0, 2],
            '4': [1, 0], '5': [1, 1], '6': [1, 2],
            '1': [2, 0], '2': [2, 1], '3': [2, 2],
        };
        if (key in moves) {
            const [row, col] = moves[key];
            if (this.board[row][col] === ' ') {
                this.board[row][col] = 'X';
                this.checkWinner();
                this.render();
                if (!this.gameOver) {
                    this.aiMove();
                    this.checkWinner();
                    this.render();
                }
            }
        }
        else if (key === 'q' || key === 'Q') {
            // Exit door by clearing input handler
            if (this.ctx.bbsSession) {
                this.ctx.bbsSession.doorInputHandler = null;
            }
        }
    }
    aiMove() {
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                if (this.board[row][col] === ' ') {
                    this.board[row][col] = 'O';
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
        this.gameOver = false;
        this.winner = null;
        this.render();
    }
    render() {
        // Clear screen
        this.ctx.output.write('\x1b[2J\x1b[H');
        // Title
        this.ctx.output.write('\x1b[36m\r\n  TIC-TAC-TOE\x1b[0m\r\n\r\n');
        // Draw board
        for (let row = 0; row < 3; row++) {
            this.ctx.output.write('     ');
            for (let col = 0; col < 3; col++) {
                const cell = this.board[row][col];
                if (cell === 'X') {
                    this.ctx.output.write('\x1b[32mX\x1b[0m');
                }
                else if (cell === 'O') {
                    this.ctx.output.write('\x1b[31mO\x1b[0m');
                }
                else {
                    // Show number hint
                    const num = String((2 - row) * 3 + col + 1);
                    this.ctx.output.write(`\x1b[90m${num}\x1b[0m`);
                }
                if (col < 2)
                    this.ctx.output.write(' | ');
            }
            this.ctx.output.write('\r\n');
            if (row < 2) {
                this.ctx.output.write('     ----------\r\n');
            }
        }
        this.ctx.output.write('\r\n');
        // Status
        if (this.gameOver) {
            if (this.winner === 'Draw') {
                this.ctx.output.write('\x1b[33m  IT\'S A DRAW!\x1b[0m\r\n\r\n');
            }
            else {
                const color = this.winner === 'X' ? '\x1b[32m' : '\x1b[31m';
                this.ctx.output.write(`${color}  ${this.winner} WINS!\x1b[0m\r\n\r\n`);
            }
            this.ctx.output.write('  N=New Game  Q=Quit\r\n');
        }
        else {
            this.ctx.output.write('  Your turn (X) - Press 1-9\r\n');
            this.ctx.output.write('  Q=Quit\r\n');
        }
    }
}
// SDK v2.0 Pattern
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'Tic-Tac-Toe',
    version: '2.0.0',
    author: 'SDK v2.0 Team',
});
let game;
door.onStart(async (ctx) => {
    game = new TicTacToeGame();
    game.setContext(ctx);
    game.render();
});
door.onInput(async (ctx, keyPress) => {
    if (!game) {
        return;
    }
    game.handleInput(keyPress.key);
});
door.onClose(async (ctx) => {
    ctx.output.writeLine('\r\nThanks for playing!\r\n');
});
door.onError(async (ctx, error) => {
    ctx.output.writeLine(`\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
});
exports.default = door;
