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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
/** Tetris piece shapes (tetrominos) */
var PIECES = {
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
var PIECE_COLORS = {
    I: bbs_door_sdk_1.AnsiColor.Cyan,
    O: bbs_door_sdk_1.AnsiColor.Yellow,
    T: bbs_door_sdk_1.AnsiColor.Magenta,
    S: bbs_door_sdk_1.AnsiColor.Green,
    Z: bbs_door_sdk_1.AnsiColor.Red,
    J: bbs_door_sdk_1.AnsiColor.Blue,
    L: bbs_door_sdk_1.AnsiColor.BrightYellow,
};
var TetrisGame = /** @class */ (function () {
    function TetrisGame(door) {
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
            .map(function () { return Array(10).fill(0); });
    }
    /**
     * Initialize game
     */
    TetrisGame.prototype.init = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.userId = userId;
                        this.saveMgr = new bbs_door_sdk_1.SaveManager({ userId: userId, gameId: 'tetris' });
                        return [4 /*yield*/, this.audio.init()];
                    case 1:
                        _a.sent();
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
                        return [4 /*yield*/, this.showMainMenu()];
                    case 2:
                        // Show main menu
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Show main menu
     */
    TetrisGame.prototype.showMainMenu = function () {
        return __awaiter(this, void 0, void 0, function () {
            var menu;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        menu = new bbs_door_sdk_1.MenuSystem({
                            title: '╔═══ TETRIS ═══╗',
                            style: 'retro-neon',
                            navigation: 'arrow-keys',
                            modal: false,
                            position: { x: 30, y: 8 },
                        });
                        menu.addItem('New Game', function () { return _this.startNewGame(); }, { key: 'N' });
                        menu.addItem('High Scores', function () { return _this.showHighScores(); }, { key: 'H' });
                        menu.addItem('Instructions', function () { return _this.showInstructions(); }, { key: 'I' });
                        menu.addItem('Quit', function () { return _this.quit(); }, { key: 'Q' });
                        this.gameState = 'menu';
                        return [4 /*yield*/, menu.show(this.door, this.userId)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Start new game
     */
    TetrisGame.prototype.startNewGame = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // Reset game state
                        this.board = Array(20)
                            .fill(0)
                            .map(function () { return Array(10).fill(0); });
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
                        return [4 /*yield*/, this.gameLoop()];
                    case 1:
                        // Start game loop
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Spawn new piece
     */
    TetrisGame.prototype.spawnPiece = function () {
        if (this.nextPiece) {
            this.currentPiece = this.nextPiece;
            this.currentPiece.position = { x: 3, y: 0 };
        }
        else {
            var types = Object.keys(PIECES);
            var type = types[Math.floor(Math.random() * types.length)];
            this.currentPiece = {
                shape: PIECES[type],
                position: { x: 3, y: 0 },
                type: type,
                color: PIECE_COLORS[type],
            };
        }
        this.spawnNextPiece();
        // Check game over
        if (this.checkCollision(this.currentPiece)) {
            this.gameOver();
        }
    };
    /**
     * Spawn next piece preview
     */
    TetrisGame.prototype.spawnNextPiece = function () {
        var types = Object.keys(PIECES);
        var type = types[Math.floor(Math.random() * types.length)];
        this.nextPiece = {
            shape: PIECES[type],
            position: { x: 0, y: 0 },
            type: type,
            color: PIECE_COLORS[type],
        };
    };
    /**
     * Main game loop
     */
    TetrisGame.prototype.gameLoop = function () {
        return __awaiter(this, void 0, void 0, function () {
            var now, delta, key;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(this.gameState === 'playing' || this.gameState === 'paused')) return [3 /*break*/, 5];
                        now = Date.now();
                        delta = now - this.lastDrop;
                        return [4 /*yield*/, this.door.waitForInput(this.userId, 0)];
                    case 1:
                        key = _a.sent();
                        if (!key) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.handleInput(key.key)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
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
                        return [4 /*yield*/, this.door.wait(16)];
                    case 4:
                        // Small delay to prevent CPU spinning
                        _a.sent(); // ~60 FPS
                        return [3 /*break*/, 0];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Handle keyboard input
     */
    TetrisGame.prototype.handleInput = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.gameState === 'paused') {
                    if (key === 'p' || key === 'P') {
                        this.gameState = 'playing';
                        this.audio.setMusicState('playing', 1.0);
                    }
                    return [2 /*return*/];
                }
                if (!this.currentPiece)
                    return [2 /*return*/];
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
                return [2 /*return*/];
            });
        });
    };
    /**
     * Move piece horizontally
     */
    TetrisGame.prototype.movePiece = function (dx, dy) {
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
    };
    /**
     * Move piece down one row
     */
    TetrisGame.prototype.movePieceDown = function () {
        if (!this.movePiece(0, 1)) {
            // Piece has landed
            this.lockPiece();
            return false;
        }
        return true;
    };
    /**
     * Hard drop piece
     */
    TetrisGame.prototype.hardDrop = function () {
        if (!this.currentPiece)
            return;
        var dropDistance = 0;
        while (this.movePiece(0, 1)) {
            dropDistance++;
        }
        this.score += dropDistance * 2;
        this.hud.setValue('score', this.score);
        this.lockPiece();
    };
    /**
     * Rotate piece clockwise
     */
    TetrisGame.prototype.rotatePiece = function () {
        if (!this.currentPiece)
            return;
        var oldShape = this.currentPiece.shape;
        var newShape = this.rotateMatrix(oldShape);
        this.currentPiece.shape = newShape;
        if (this.checkCollision(this.currentPiece)) {
            // Try wall kicks
            if (!this.movePiece(1, 0) && !this.movePiece(-1, 0)) {
                this.currentPiece.shape = oldShape;
            }
        }
    };
    /**
     * Rotate matrix 90 degrees clockwise
     */
    TetrisGame.prototype.rotateMatrix = function (matrix) {
        var rows = matrix.length;
        var cols = matrix[0].length;
        var rotated = [];
        for (var c = 0; c < cols; c++) {
            rotated[c] = [];
            for (var r = rows - 1; r >= 0; r--) {
                rotated[c][rows - 1 - r] = matrix[r][c];
            }
        }
        return rotated;
    };
    /**
     * Check collision
     */
    TetrisGame.prototype.checkCollision = function (piece) {
        for (var r = 0; r < piece.shape.length; r++) {
            for (var c = 0; c < piece.shape[r].length; c++) {
                if (piece.shape[r][c]) {
                    var boardX = piece.position.x + c;
                    var boardY = piece.position.y + r;
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
    };
    /**
     * Lock piece to board
     */
    TetrisGame.prototype.lockPiece = function () {
        if (!this.currentPiece)
            return;
        // Add piece to board
        for (var r = 0; r < this.currentPiece.shape.length; r++) {
            for (var c = 0; c < this.currentPiece.shape[r].length; c++) {
                if (this.currentPiece.shape[r][c]) {
                    var boardX = this.currentPiece.position.x + c;
                    var boardY = this.currentPiece.position.y + r;
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
    };
    /**
     * Clear completed lines
     */
    TetrisGame.prototype.clearLines = function () {
        var linesToClear = [];
        // Find completed lines
        for (var r = 0; r < 20; r++) {
            if (this.board[r].every(function (cell) { return cell !== 0; })) {
                linesToClear.push(r);
            }
        }
        if (linesToClear.length > 0) {
            // Play sound
            this.audio.playSound('powerup');
            // Update score
            var points = [0, 40, 100, 300, 1200][linesToClear.length] * this.level;
            this.score += points;
            this.lines += linesToClear.length;
            this.hud.setValue('score', this.score);
            this.hud.setValue('lines', this.lines);
            // Update level
            var newLevel = Math.floor(this.lines / 10) + 1;
            if (newLevel > this.level) {
                this.level = newLevel;
                this.dropSpeed = Math.max(100, 1000 - (this.level - 1) * 100);
                this.hud.setValue('level', this.level);
                this.audio.setMusicState('level-up', this.level / 10);
            }
            // Remove lines
            linesToClear.sort(function (a, b) { return b - a; });
            for (var _i = 0, linesToClear_1 = linesToClear; _i < linesToClear_1.length; _i++) {
                var line = linesToClear_1[_i];
                this.board.splice(line, 1);
                this.board.unshift(Array(10).fill(0));
            }
        }
    };
    /**
     * Game over
     */
    TetrisGame.prototype.gameOver = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.gameState = 'gameover';
                        this.audio.playSound('gameover');
                        this.audio.stopMusic();
                        // Save high score
                        return [4 /*yield*/, this.saveHighScore()];
                    case 1:
                        // Save high score
                        _a.sent();
                        this.door.send('\r\n\r\n', this.userId);
                        this.door.send('╔════════════════════╗\r\n', this.userId);
                        this.door.send('║   GAME OVER!!!    ║\r\n', this.userId);
                        this.door.send('╚════════════════════╝\r\n', this.userId);
                        this.door.send("\r\nFinal Score: ".concat(this.score, "\r\n"), this.userId);
                        this.door.send("Lines: ".concat(this.lines, "\r\n"), this.userId);
                        this.door.send("Level: ".concat(this.level, "\r\n\r\n"), this.userId);
                        this.door.send('Press any key to continue...\r\n', this.userId);
                        return [4 /*yield*/, this.door.waitForInput(this.userId, 0)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.showMainMenu()];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Render game frame
     */
    TetrisGame.prototype.render = function () {
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        // Draw board border
        this.gfx.drawBox({ x: 25, y: 1, width: 22, height: 22 }, 'double', bbs_door_sdk_1.AnsiColor.White);
        // Draw board
        for (var r = 0; r < 20; r++) {
            for (var c = 0; c < 10; c++) {
                var cell = this.board[r][c];
                if (cell) {
                    this.gfx.drawChar(26 + c * 2, 2 + r, '█', cell);
                }
            }
        }
        // Draw current piece
        if (this.currentPiece && this.gameState === 'playing') {
            for (var r = 0; r < this.currentPiece.shape.length; r++) {
                for (var c = 0; c < this.currentPiece.shape[r].length; c++) {
                    if (this.currentPiece.shape[r][c]) {
                        var x = 26 + (this.currentPiece.position.x + c) * 2;
                        var y = 2 + this.currentPiece.position.y + r;
                        this.gfx.drawChar(x, y, '█', this.currentPiece.color);
                    }
                }
            }
        }
        // Draw next piece preview
        if (this.nextPiece) {
            this.gfx.drawText(55, 10, 'NEXT:', bbs_door_sdk_1.AnsiColor.White);
            for (var r = 0; r < this.nextPiece.shape.length; r++) {
                for (var c = 0; c < this.nextPiece.shape[r].length; c++) {
                    if (this.nextPiece.shape[r][c]) {
                        this.gfx.drawChar(55 + c * 2, 12 + r, '█', this.nextPiece.color);
                    }
                }
            }
        }
        // Draw HUD
        var hudOutput = this.hud.render();
        // Draw paused indicator
        if (this.gameState === 'paused') {
            this.gfx.drawText(30, 11, 'PAUSED', bbs_door_sdk_1.AnsiColor.Yellow);
            this.gfx.drawText(28, 12, 'Press P to resume', bbs_door_sdk_1.AnsiColor.White);
        }
        // Send output
        var output = this.gfx.render() + hudOutput;
        this.door.sendAnsi(output, this.userId);
    };
    /**
     * Save high score
     */
    TetrisGame.prototype.saveHighScore = function () {
        return __awaiter(this, void 0, void 0, function () {
            var save, highScores, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.saveMgr.load(1)];
                    case 1:
                        save = _a.sent();
                        highScores = [];
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
                        highScores.sort(function (a, b) { return b.score - a.score; });
                        highScores = highScores.slice(0, 10);
                        // Save
                        return [4 /*yield*/, this.saveMgr.save(1, { highScores: highScores })];
                    case 2:
                        // Save
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _a.sent();
                        console.error('Failed to save high score:', error_1);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Show high scores
     */
    TetrisGame.prototype.showHighScores = function () {
        return __awaiter(this, void 0, void 0, function () {
            var save, highScores, i, hs, rank, score, lines, level, date, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.door.clearScreen(this.userId);
                        this.door.send('\r\n', this.userId);
                        this.door.send('╔═══════════════════════════════════╗\r\n', this.userId);
                        this.door.send('║         HIGH SCORES             ║\r\n', this.userId);
                        this.door.send('╠═══════════════════════════════════╣\r\n', this.userId);
                        this.door.send('║ #  Score    Lines  Level  Date   ║\r\n', this.userId);
                        this.door.send('╠═══════════════════════════════════╣\r\n', this.userId);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.saveMgr.load(1)];
                    case 2:
                        save = _a.sent();
                        highScores = [];
                        if (save && save.state && Array.isArray(save.state.highScores)) {
                            highScores = save.state.highScores;
                        }
                        if (highScores.length === 0) {
                            this.door.send('║   No high scores yet!           ║\r\n', this.userId);
                        }
                        else {
                            for (i = 0; i < Math.min(10, highScores.length); i++) {
                                hs = highScores[i];
                                rank = (i + 1).toString().padStart(2);
                                score = hs.score.toString().padStart(7);
                                lines = hs.lines.toString().padStart(5);
                                level = hs.level.toString().padStart(5);
                                date = hs.date.substring(5);
                                this.door.send("\u2551 ".concat(rank, " ").concat(score, " ").concat(lines, "  ").concat(level, "  ").concat(date, " \u2551\r\n"), this.userId);
                            }
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _a.sent();
                        this.door.send('║   Error loading scores          ║\r\n', this.userId);
                        return [3 /*break*/, 4];
                    case 4:
                        this.door.send('╚═══════════════════════════════════╝\r\n', this.userId);
                        this.door.send('\r\nPress any key...\r\n', this.userId);
                        return [4 /*yield*/, this.door.waitForInput(this.userId, 0)];
                    case 5:
                        _a.sent();
                        return [4 /*yield*/, this.showMainMenu()];
                    case 6:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Show instructions
     */
    TetrisGame.prototype.showInstructions = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
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
                        return [4 /*yield*/, this.door.waitForInput(this.userId, 0)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.showMainMenu()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Quit game
     */
    TetrisGame.prototype.quit = function () {
        this.audio.dispose();
        this.door.disconnect(this.userId);
    };
    return TetrisGame;
}());
// Main entry point
var door = new bbs_door_sdk_1.Door({
    name: 'Tetris',
    version: '1.0.0',
    author: 'AmiExpress SDK',
    description: 'Classic block puzzle game',
});
door.onConnect(function (user) { return __awaiter(void 0, void 0, void 0, function () {
    var game;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                game = new TetrisGame(door);
                return [4 /*yield*/, game.init(user.id)];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
door.start();
exports.default = TetrisGame;
