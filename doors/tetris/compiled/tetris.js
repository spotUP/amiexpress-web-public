"use strict";
/**
 * TETRIS - Classic Block Puzzle Game
 *
 * A fully-featured Tetris implementation showcasing the SDK's capabilities:
 * - Animated falling blocks
 * - Rotation and movement
 * - Line clearing with effects
 * - Progressive difficulty
 * - High score tracking
 * - Professional HUD
 * - Sound effects
 *
 * Controls:
 * - Arrow Left/Right: Move piece
 * - Arrow Up: Rotate
 * - Arrow Down: Soft drop
 * - Space: Hard drop
 * - P: Pause
 * - Q: Quit
 *
 * @example
 * ```bash
 * # Run the game
 * npm run example tetris
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
/** Tetris piece shapes (tetrominos) */
const PIECES = {
    I: [[1, 1, 1, 1]],
    O: [
        [1, 1],
        [1, 1],
    ],
    T: [
        [0, 1, 0],
        [1, 1, 1],
    ],
    S: [
        [0, 1, 1],
        [1, 1, 0],
    ],
    Z: [
        [1, 1, 0],
        [0, 1, 1],
    ],
    J: [
        [1, 0, 0],
        [1, 1, 1],
    ],
    L: [
        [0, 0, 1],
        [1, 1, 1],
    ],
};
const PIECE_COLORS = {
    I: bbs_door_sdk_1.AnsiColor.Cyan,
    O: bbs_door_sdk_1.AnsiColor.Yellow,
    T: bbs_door_sdk_1.AnsiColor.Magenta,
    S: bbs_door_sdk_1.AnsiColor.Green,
    Z: bbs_door_sdk_1.AnsiColor.Red,
    J: bbs_door_sdk_1.AnsiColor.Blue,
    L: bbs_door_sdk_1.AnsiColor.BrightYellow,
};
class TetrisGame {
    constructor(door) {
        /** Current piece */
        this.currentPiece = null;
        /** Next piece */
        this.nextPiece = null;
        /** Game state */
        this.gameState = 'menu';
        /** Score */
        this.score = 0;
        /** Lines cleared */
        this.lines = 0;
        /** Level */
        this.level = 1;
        /** Drop speed (ms) */
        this.dropSpeed = 1000;
        /** Last drop time */
        this.lastDrop = 0;
        /** User ID */
        this.userId = 0;
        this.door = door;
        this.gfx = new bbs_door_sdk_1.GraphicsEngine({ width: 80, height: 24 });
        this.audio = new bbs_door_sdk_1.AudioEngine();
        this.hud = new bbs_door_sdk_1.HUDBuilder();
        this.saveMgr = new bbs_door_sdk_1.SaveManager({ userId: 0, gameId: 'tetris' });
        // Initialize board
        this.board = Array(20)
            .fill(0)
            .map(() => Array(10).fill(0));
    }
    /**
     * Initialize game
     */
    async init(userId) {
        this.userId = userId;
        this.saveMgr = new bbs_door_sdk_1.SaveManager({ userId, gameId: 'tetris' });
        await this.audio.init();
        // Setup HUD
        this.hud.addScoreCounter({
            position: { x: 55, y: 3 },
            format: 'SCORE: {score:06d}',
            animateOnChange: true,
        });
        this.hud.addText('lines', {
            position: { x: 55, y: 5 },
            format: 'LINES: {lines}',
            color: bbs_door_sdk_1.AnsiColor.Cyan,
        });
        this.hud.addText('level', {
            position: { x: 55, y: 7 },
            format: 'LEVEL: {level}',
            color: bbs_door_sdk_1.AnsiColor.Yellow,
        });
        // Show main menu
        await this.showMainMenu();
    }
    /**
     * Show main menu
     */
    async showMainMenu() {
        const menu = new bbs_door_sdk_1.MenuSystem({
            title: '╔═══ TETRIS ═══╗',
            style: 'retro-neon',
            navigation: 'arrow-keys',
            modal: false,
            position: { x: 30, y: 8 },
        });
        menu.addItem('New Game', () => this.startNewGame(), { key: 'N' });
        menu.addItem('High Scores', () => this.showHighScores(), { key: 'H' });
        menu.addItem('Instructions', () => this.showInstructions(), { key: 'I' });
        menu.addItem('Quit', () => this.quit(), { key: 'Q' });
        this.gameState = 'menu';
        await menu.show(this.door, this.userId);
    }
    /**
     * Start new game
     */
    async startNewGame() {
        // Reset game state
        this.board = Array(20)
            .fill(0)
            .map(() => Array(10).fill(0));
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.dropSpeed = 1000;
        this.hud.setValue('score', 0);
        this.hud.setValue('lines', 0);
        this.hud.setValue('level', 1);
        // Spawn first piece
        this.spawnPiece();
        this.spawnNextPiece();
        this.gameState = 'playing';
        this.lastDrop = Date.now();
        // Play music
        this.audio.generateMusic({
            prompt: 'upbeat retro game music',
            tempo: 120,
            pattern: 'x-x-x-x-',
            instruments: ['square'],
        });
        // Start game loop
        await this.gameLoop();
    }
    /**
     * Spawn new piece
     */
    spawnPiece() {
        if (this.nextPiece) {
            this.currentPiece = this.nextPiece;
            this.currentPiece.position = { x: 3, y: 0 };
        }
        else {
            const types = Object.keys(PIECES);
            const type = types[Math.floor(Math.random() * types.length)];
            this.currentPiece = {
                shape: PIECES[type],
                position: { x: 3, y: 0 },
                type,
                color: PIECE_COLORS[type],
            };
        }
        this.spawnNextPiece();
        // Check game over
        if (this.checkCollision(this.currentPiece)) {
            this.gameOver();
        }
    }
    /**
     * Spawn next piece preview
     */
    spawnNextPiece() {
        const types = Object.keys(PIECES);
        const type = types[Math.floor(Math.random() * types.length)];
        this.nextPiece = {
            shape: PIECES[type],
            position: { x: 0, y: 0 },
            type,
            color: PIECE_COLORS[type],
        };
    }
    /**
     * Main game loop
     */
    async gameLoop() {
        while (this.gameState === 'playing' || this.gameState === 'paused') {
            const now = Date.now();
            const delta = now - this.lastDrop;
            // Handle input (non-blocking)
            const key = await this.door.waitForInput(this.userId, 0);
            if (key) {
                await this.handleInput(key.key);
            }
            // Auto-drop piece
            if (this.gameState === 'playing' && delta >= this.dropSpeed) {
                this.movePieceDown();
                this.lastDrop = now;
            }
            // Update HUD
            this.hud.update(delta);
            // Render frame
            this.render();
            // Small delay to prevent CPU spinning
            await this.door.wait(16); // ~60 FPS
        }
    }
    /**
     * Handle keyboard input
     */
    async handleInput(key) {
        if (this.gameState === 'paused') {
            if (key === 'p' || key === 'P') {
                this.gameState = 'playing';
                this.audio.setMusicState('playing', 1.0);
            }
            return;
        }
        if (!this.currentPiece)
            return;
        if (key === 'ArrowLeft') {
            this.movePiece(-1, 0);
            this.audio.playSound('menu-beep');
        }
        else if (key === 'ArrowRight') {
            this.movePiece(1, 0);
            this.audio.playSound('menu-beep');
        }
        else if (key === 'ArrowDown') {
            if (this.movePieceDown()) {
                this.score += 1;
                this.hud.setValue('score', this.score);
            }
        }
        else if (key === 'ArrowUp') {
            this.rotatePiece();
            this.audio.playSound('menu-beep', { frequency: 1200 });
        }
        else if (key === ' ') {
            // Hard drop
            this.hardDrop();
            this.audio.playSound('hit');
        }
        else if (key === 'p' || key === 'P') {
            this.gameState = 'paused';
            this.audio.setMusicState('paused', 0.3, 'fade');
        }
        else if (key === 'q' || key === 'Q') {
            this.quit();
        }
    }
    /**
     * Move piece horizontally
     */
    movePiece(dx, dy) {
        if (!this.currentPiece)
            return false;
        this.currentPiece.position.x += dx;
        this.currentPiece.position.y += dy;
        if (this.checkCollision(this.currentPiece)) {
            this.currentPiece.position.x -= dx;
            this.currentPiece.position.y -= dy;
            return false;
        }
        return true;
    }
    /**
     * Move piece down one row
     */
    movePieceDown() {
        if (!this.movePiece(0, 1)) {
            // Piece has landed
            this.lockPiece();
            return false;
        }
        return true;
    }
    /**
     * Hard drop piece
     */
    hardDrop() {
        if (!this.currentPiece)
            return;
        let dropDistance = 0;
        while (this.movePiece(0, 1)) {
            dropDistance++;
        }
        this.score += dropDistance * 2;
        this.hud.setValue('score', this.score);
        this.lockPiece();
    }
    /**
     * Rotate piece clockwise
     */
    rotatePiece() {
        if (!this.currentPiece)
            return;
        const oldShape = this.currentPiece.shape;
        const newShape = this.rotateMatrix(oldShape);
        this.currentPiece.shape = newShape;
        if (this.checkCollision(this.currentPiece)) {
            // Try wall kicks
            if (!this.movePiece(1, 0) && !this.movePiece(-1, 0)) {
                this.currentPiece.shape = oldShape;
            }
        }
    }
    /**
     * Rotate matrix 90 degrees clockwise
     */
    rotateMatrix(matrix) {
        const rows = matrix.length;
        const cols = matrix[0].length;
        const rotated = [];
        for (let c = 0; c < cols; c++) {
            rotated[c] = [];
            for (let r = rows - 1; r >= 0; r--) {
                rotated[c][rows - 1 - r] = matrix[r][c];
            }
        }
        return rotated;
    }
    /**
     * Check collision
     */
    checkCollision(piece) {
        for (let r = 0; r < piece.shape.length; r++) {
            for (let c = 0; c < piece.shape[r].length; c++) {
                if (piece.shape[r][c]) {
                    const boardX = piece.position.x + c;
                    const boardY = piece.position.y + r;
                    // Check boundaries
                    if (boardX < 0 || boardX >= 10 || boardY >= 20) {
                        return true;
                    }
                    // Check board collision
                    if (boardY >= 0 && this.board[boardY][boardX]) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    /**
     * Lock piece to board
     */
    lockPiece() {
        if (!this.currentPiece)
            return;
        // Add piece to board
        for (let r = 0; r < this.currentPiece.shape.length; r++) {
            for (let c = 0; c < this.currentPiece.shape[r].length; c++) {
                if (this.currentPiece.shape[r][c]) {
                    const boardX = this.currentPiece.position.x + c;
                    const boardY = this.currentPiece.position.y + r;
                    if (boardY >= 0 && boardY < 20) {
                        this.board[boardY][boardX] = this.currentPiece.color;
                    }
                }
            }
        }
        // Check for completed lines
        this.clearLines();
        // Spawn next piece
        this.spawnPiece();
    }
    /**
     * Clear completed lines
     */
    clearLines() {
        const linesToClear = [];
        // Find completed lines
        for (let r = 0; r < 20; r++) {
            if (this.board[r].every((cell) => cell !== 0)) {
                linesToClear.push(r);
            }
        }
        if (linesToClear.length > 0) {
            // Play sound
            this.audio.playSound('powerup');
            // Update score
            const points = [0, 40, 100, 300, 1200][linesToClear.length] * this.level;
            this.score += points;
            this.lines += linesToClear.length;
            this.hud.setValue('score', this.score);
            this.hud.setValue('lines', this.lines);
            // Update level
            const newLevel = Math.floor(this.lines / 10) + 1;
            if (newLevel > this.level) {
                this.level = newLevel;
                this.dropSpeed = Math.max(100, 1000 - (this.level - 1) * 100);
                this.hud.setValue('level', this.level);
                this.audio.setMusicState('level-up', this.level / 10);
            }
            // Remove lines
            linesToClear.sort((a, b) => b - a);
            for (const line of linesToClear) {
                this.board.splice(line, 1);
                this.board.unshift(Array(10).fill(0));
            }
        }
    }
    /**
     * Game over
     */
    async gameOver() {
        this.gameState = 'gameover';
        this.audio.playSound('gameover');
        this.audio.stopMusic();
        // Save high score
        await this.saveHighScore();
        this.door.send('\r\n\r\n', this.userId);
        this.door.send('╔════════════════════╗\r\n', this.userId);
        this.door.send('║   GAME OVER!!!    ║\r\n', this.userId);
        this.door.send('╚════════════════════╝\r\n', this.userId);
        this.door.send(`\r\nFinal Score: ${this.score}\r\n`, this.userId);
        this.door.send(`Lines: ${this.lines}\r\n`, this.userId);
        this.door.send(`Level: ${this.level}\r\n\r\n`, this.userId);
        this.door.send('Press any key to continue...\r\n', this.userId);
        await this.door.waitForInput(this.userId, 0);
        await this.showMainMenu();
    }
    /**
     * Render game frame
     */
    render() {
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        // Draw board border
        this.gfx.drawBox({ x: 25, y: 1, width: 22, height: 22 }, 'double', bbs_door_sdk_1.AnsiColor.White);
        // Draw board
        for (let r = 0; r < 20; r++) {
            for (let c = 0; c < 10; c++) {
                const cell = this.board[r][c];
                if (cell) {
                    this.gfx.drawChar(26 + c * 2, 2 + r, '█', cell);
                }
            }
        }
        // Draw current piece
        if (this.currentPiece && this.gameState === 'playing') {
            for (let r = 0; r < this.currentPiece.shape.length; r++) {
                for (let c = 0; c < this.currentPiece.shape[r].length; c++) {
                    if (this.currentPiece.shape[r][c]) {
                        const x = 26 + (this.currentPiece.position.x + c) * 2;
                        const y = 2 + this.currentPiece.position.y + r;
                        this.gfx.drawChar(x, y, '█', this.currentPiece.color);
                    }
                }
            }
        }
        // Draw next piece preview
        if (this.nextPiece) {
            this.gfx.drawText(55, 10, 'NEXT:', bbs_door_sdk_1.AnsiColor.White);
            for (let r = 0; r < this.nextPiece.shape.length; r++) {
                for (let c = 0; c < this.nextPiece.shape[r].length; c++) {
                    if (this.nextPiece.shape[r][c]) {
                        this.gfx.drawChar(55 + c * 2, 12 + r, '█', this.nextPiece.color);
                    }
                }
            }
        }
        // Draw HUD
        const hudOutput = this.hud.render();
        // Draw paused indicator
        if (this.gameState === 'paused') {
            this.gfx.drawText(30, 11, 'PAUSED', bbs_door_sdk_1.AnsiColor.Yellow);
            this.gfx.drawText(28, 12, 'Press P to resume', bbs_door_sdk_1.AnsiColor.White);
        }
        // Send output
        const output = this.gfx.render() + hudOutput;
        this.door.sendAnsi(output, this.userId);
    }
    /**
     * Save high score
     */
    async saveHighScore() {
        try {
            // Load existing high scores
            const save = await this.saveMgr.load(1);
            let highScores = [];
            if (save && save.state && Array.isArray(save.state.highScores)) {
                highScores = save.state.highScores;
            }
            // Add current score
            highScores.push({
                score: this.score,
                lines: this.lines,
                level: this.level,
                date: new Date().toISOString().split('T')[0]
            });
            // Sort by score descending and keep top 10
            highScores.sort((a, b) => b.score - a.score);
            highScores = highScores.slice(0, 10);
            // Save
            await this.saveMgr.save(1, { highScores });
        }
        catch (error) {
            console.error('Failed to save high score:', error);
        }
    }
    /**
     * Show high scores
     */
    async showHighScores() {
        this.door.clearScreen(this.userId);
        this.door.send('\r\n', this.userId);
        this.door.send('╔═══════════════════════════════════╗\r\n', this.userId);
        this.door.send('║         HIGH SCORES             ║\r\n', this.userId);
        this.door.send('╠═══════════════════════════════════╣\r\n', this.userId);
        this.door.send('║ #  Score    Lines  Level  Date   ║\r\n', this.userId);
        this.door.send('╠═══════════════════════════════════╣\r\n', this.userId);
        try {
            const save = await this.saveMgr.load(1);
            let highScores = [];
            if (save && save.state && Array.isArray(save.state.highScores)) {
                highScores = save.state.highScores;
            }
            if (highScores.length === 0) {
                this.door.send('║   No high scores yet!           ║\r\n', this.userId);
            }
            else {
                for (let i = 0; i < Math.min(10, highScores.length); i++) {
                    const hs = highScores[i];
                    const rank = (i + 1).toString().padStart(2);
                    const score = hs.score.toString().padStart(7);
                    const lines = hs.lines.toString().padStart(5);
                    const level = hs.level.toString().padStart(5);
                    const date = hs.date.substring(5); // MM-DD
                    this.door.send(`║ ${rank} ${score} ${lines}  ${level}  ${date} ║\r\n`, this.userId);
                }
            }
        }
        catch (error) {
            this.door.send('║   Error loading scores          ║\r\n', this.userId);
        }
        this.door.send('╚═══════════════════════════════════╝\r\n', this.userId);
        this.door.send('\r\nPress any key...\r\n', this.userId);
        await this.door.waitForInput(this.userId, 0);
        await this.showMainMenu();
    }
    /**
     * Show instructions
     */
    async showInstructions() {
        this.door.clearScreen(this.userId);
        this.door.send('\r\n', this.userId);
        this.door.send('╔══════════════════════╗\r\n', this.userId);
        this.door.send('║   INSTRUCTIONS     ║\r\n', this.userId);
        this.door.send('╚══════════════════════╝\r\n', this.userId);
        this.door.send('\r\n', this.userId);
        this.door.send('← →  : Move piece\r\n', this.userId);
        this.door.send('↑    : Rotate\r\n', this.userId);
        this.door.send('↓    : Soft drop\r\n', this.userId);
        this.door.send('SPACE: Hard drop\r\n', this.userId);
        this.door.send('P    : Pause\r\n', this.userId);
        this.door.send('Q    : Quit\r\n\r\n', this.userId);
        this.door.send('Press any key...\r\n', this.userId);
        await this.door.waitForInput(this.userId, 0);
        await this.showMainMenu();
    }
    /**
     * Quit game
     */
    quit() {
        this.audio.dispose();
        this.door.disconnect(this.userId);
    }
}
// Main entry point
const door = new bbs_door_sdk_1.Door({
    name: 'Tetris',
    version: '1.0.0',
    author: 'AmiExpress SDK',
    description: 'Classic block puzzle game',
});
door.onConnect(async (user) => {
    const game = new TetrisGame(door);
    await game.init(user.id);
});
door.start();
exports.default = TetrisGame;
