"use strict";
/**
 * 2048 Game - Classic ncurses-style puzzle game using neo-blessed
 *
 * Port of the popular 2048 sliding tile puzzle game to BBS doors.
 * Uses neo-blessed for the terminal UI with smooth animations and
 * colorful tile rendering.
 *
 * How to play:
 * - Use arrow keys to slide tiles
 * - Combine tiles with the same number
 * - Reach 2048 to win!
 * - Game over when no moves are possible
 *
 * Features:
 * - Full game logic
 * - Smooth tile animations
 * - Score tracking
 * - High score persistence
 * - Colorful UI
 * - Undo functionality
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
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDoor = runDoor;
var bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
var fs = require("fs");
var path = require("path");
var stream_1 = require("stream");
// Tile colors based on value
var TILE_COLORS = {
    0: { bg: 'black', fg: 'white' },
    2: { bg: 'white', fg: 'black' },
    4: { bg: 'yellow', fg: 'black' },
    8: { bg: 'blue', fg: 'white' },
    16: { bg: 'magenta', fg: 'white' },
    32: { bg: 'red', fg: 'white' },
    64: { bg: 'cyan', fg: 'black' },
    128: { bg: 'green', fg: 'white' },
    256: { bg: 'brightyellow', fg: 'black' },
    512: { bg: 'brightblue', fg: 'white' },
    1024: { bg: 'brightmagenta', fg: 'white' },
    2048: { bg: 'brightred', fg: 'white' },
    4096: { bg: 'brightcyan', fg: 'black' },
};
var Game2048 = /** @class */ (function () {
    function Game2048(highScorePath) {
        this.previousState = null;
        this.highScorePath = highScorePath;
        this.state = {
            grid: this.createEmptyGrid(),
            score: 0,
            bestScore: this.loadHighScore(),
            gameOver: false,
            won: false,
        };
        this.addRandomTile();
        this.addRandomTile();
    }
    Game2048.prototype.createEmptyGrid = function () {
        return Array(4)
            .fill(0)
            .map(function () { return Array(4).fill(0); });
    };
    Game2048.prototype.loadHighScore = function () {
        try {
            if (fs.existsSync(this.highScorePath)) {
                return parseInt(fs.readFileSync(this.highScorePath, 'utf-8'));
            }
        }
        catch (err) {
            console.error('Error loading high score:', err);
        }
        return 0;
    };
    Game2048.prototype.saveHighScore = function () {
        try {
            var dir = path.dirname(this.highScorePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.highScorePath, this.state.bestScore.toString());
        }
        catch (err) {
            console.error('Error saving high score:', err);
        }
    };
    Game2048.prototype.addRandomTile = function () {
        var emptyCells = [];
        for (var r = 0; r < 4; r++) {
            for (var c = 0; c < 4; c++) {
                if (this.state.grid[r][c] === 0) {
                    emptyCells.push([r, c]);
                }
            }
        }
        if (emptyCells.length > 0) {
            var _a = emptyCells[Math.floor(Math.random() * emptyCells.length)], r = _a[0], c = _a[1];
            this.state.grid[r][c] = Math.random() < 0.9 ? 2 : 4;
        }
    };
    Game2048.prototype.saveState = function () {
        this.previousState = JSON.parse(JSON.stringify(this.state));
    };
    Game2048.prototype.undo = function () {
        if (this.previousState) {
            this.state = JSON.parse(JSON.stringify(this.previousState));
            this.previousState = null;
            return true;
        }
        return false;
    };
    Game2048.prototype.compress = function (row) {
        return row.filter(function (x) { return x !== 0; }).concat(Array(4).fill(0)).slice(0, 4);
    };
    Game2048.prototype.merge = function (row) {
        var score = 0;
        var compressed = this.compress(row);
        var result = __spreadArray([], compressed, true);
        for (var i = 0; i < 3; i++) {
            if (result[i] !== 0 && result[i] === result[i + 1]) {
                result[i] *= 2;
                result[i + 1] = 0;
                score += result[i];
                if (result[i] === 2048) {
                    this.state.won = true;
                }
            }
        }
        return { row: this.compress(result), score: score };
    };
    Game2048.prototype.rotateGrid = function (times) {
        for (var t = 0; t < times; t++) {
            var newGrid = this.createEmptyGrid();
            for (var r = 0; r < 4; r++) {
                for (var c = 0; c < 4; c++) {
                    newGrid[c][3 - r] = this.state.grid[r][c];
                }
            }
            this.state.grid = newGrid;
        }
    };
    Game2048.prototype.move = function (direction) {
        this.saveState();
        var rotations = { up: 3, down: 1, left: 0, right: 2 };
        this.rotateGrid(rotations[direction]);
        var moved = false;
        var addedScore = 0;
        for (var r = 0; r < 4; r++) {
            var original = __spreadArray([], this.state.grid[r], true);
            var _a = this.merge(this.state.grid[r]), row = _a.row, score = _a.score;
            this.state.grid[r] = row;
            addedScore += score;
            if (JSON.stringify(original) !== JSON.stringify(row)) {
                moved = true;
            }
        }
        this.rotateGrid(4 - rotations[direction]);
        if (moved) {
            this.state.score += addedScore;
            if (this.state.score > this.state.bestScore) {
                this.state.bestScore = this.state.score;
                this.saveHighScore();
            }
            this.addRandomTile();
            this.checkGameOver();
        }
        else {
            // Restore state if no move happened
            this.previousState = null;
        }
        return moved;
    };
    Game2048.prototype.checkGameOver = function () {
        // Check if any moves are possible
        for (var r = 0; r < 4; r++) {
            for (var c = 0; c < 4; c++) {
                if (this.state.grid[r][c] === 0) {
                    return; // Empty cell exists
                }
                if (c < 3 && this.state.grid[r][c] === this.state.grid[r][c + 1]) {
                    return; // Horizontal merge possible
                }
                if (r < 3 && this.state.grid[r][c] === this.state.grid[r + 1][c]) {
                    return; // Vertical merge possible
                }
            }
        }
        this.state.gameOver = true;
    };
    Game2048.prototype.getState = function () {
        return this.state;
    };
    Game2048.prototype.reset = function () {
        this.state = {
            grid: this.createEmptyGrid(),
            score: 0,
            bestScore: this.loadHighScore(),
            gameOver: false,
            won: false,
        };
        this.previousState = null;
        this.addRandomTile();
        this.addRandomTile();
    };
    return Game2048;
}());
function runDoor(doorSession) {
    return __awaiter(this, void 0, void 0, function () {
        var socket, user, playerName, highScorePath, game, inputStream, outputStream, ui, sendAnsi, handleSocketInput;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    socket = doorSession.socket, user = doorSession.user;
                    playerName = (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) || 'Guest';
                    console.log("User ".concat(playerName, " connected to 2048 Game"));
                    highScorePath = path.join(__dirname, 'highscore.txt');
                    game = new Game2048(highScorePath);
                    inputStream = new stream_1.PassThrough();
                    outputStream = new stream_1.PassThrough();
                    ui = new bbs_door_sdk_1.UIEngine({
                        width: 80,
                        height: 24,
                        smartCSR: true,
                        enableMouse: false,
                        enableKeys: true,
                        input: inputStream,
                        output: outputStream,
                    });
                    sendAnsi = function (chunk) {
                        socket.emit('ansi-output', chunk.toString('binary'));
                    };
                    outputStream.on('data', sendAnsi);
                    handleSocketInput = function (data) {
                        inputStream.write(data);
                    };
                    socket.on('user-input', handleSocketInput);
                    return [4 /*yield*/, new Promise(function (resolve) {
                            var finished = false;
                            var cleanup = function () {
                                outputStream.off('data', sendAnsi);
                                socket.off('user-input', handleSocketInput);
                                ui.destroy();
                            };
                            var finish = function () {
                                if (finished) {
                                    return;
                                }
                                finished = true;
                                cleanup();
                                socket.emit('ansi-output', '\r\n\x1b[32mThanks for playing 2048!\x1b[0m\r\n');
                                resolve();
                            };
                            var renderGame = function () {
                                ui.clear();
                                var state = game.getState();
                                ui.createBox({
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: 3,
                                    content: '{center}{bold}2048 GAME{/bold}\n{center}Combine tiles to reach 2048!{/center}',
                                    tags: true,
                                    style: {
                                        fg: 'white',
                                        bg: 'blue',
                                    },
                                });
                                ui.createBox({
                                    top: 3,
                                    left: 2,
                                    width: 20,
                                    height: 5,
                                    border: { type: 'line' },
                                    label: ' Score ',
                                    content: "{center}{bold}{yellow-fg}".concat(state.score, "{/yellow-fg}{/bold}{/center}"),
                                    tags: true,
                                    style: {
                                        border: { fg: 'yellow' },
                                    },
                                });
                                ui.createBox({
                                    top: 3,
                                    left: 24,
                                    width: 20,
                                    height: 5,
                                    border: { type: 'line' },
                                    label: ' Best ',
                                    content: "{center}{bold}{green-fg}".concat(state.bestScore, "{/green-fg}{/bold}{/center}"),
                                    tags: true,
                                    style: {
                                        border: { fg: 'green' },
                                    },
                                });
                                var boardTop = 9;
                                var boardLeft = 10;
                                var tileWidth = 10;
                                var tileHeight = 4;
                                for (var r = 0; r < 4; r++) {
                                    for (var c = 0; c < 4; c++) {
                                        var value = state.grid[r][c];
                                        var colors = TILE_COLORS[value] || TILE_COLORS[0];
                                        var x = boardLeft + c * (tileWidth + 1);
                                        var y = boardTop + r * (tileHeight + 1);
                                        ui.createBox({
                                            top: y,
                                            left: x,
                                            width: tileWidth,
                                            height: tileHeight,
                                            content: value > 0 ? "{center}{bold}".concat(value, "{/bold}{/center}") : '',
                                            tags: true,
                                            border: { type: 'line' },
                                            style: {
                                                fg: colors.fg,
                                                bg: colors.bg,
                                                border: { fg: 'cyan' },
                                            },
                                        });
                                    }
                                }
                                ui.createBox({
                                    top: 9,
                                    left: 56,
                                    width: 22,
                                    height: 12,
                                    border: { type: 'line' },
                                    label: ' Controls ',
                                    content: '{cyan-fg}Arrow Keys:{/cyan-fg}\n' +
                                        '  Move tiles\n\n' +
                                        '{cyan-fg}[U]{/cyan-fg} Undo\n' +
                                        '{cyan-fg}[N]{/cyan-fg} New Game\n' +
                                        '{cyan-fg}[Q]{/cyan-fg} Quit\n\n' +
                                        '{yellow-fg}Combine tiles\n' +
                                        'to reach 2048!{/yellow-fg}',
                                    tags: true,
                                    style: {
                                        border: { fg: 'yellow' },
                                    },
                                });
                                if (state.won && !state.gameOver) {
                                    ui.createBox({
                                        top: 'center',
                                        left: 'center',
                                        width: 40,
                                        height: 8,
                                        border: { type: 'line' },
                                        label: ' YOU WON! ',
                                        content: '{center}{bold}{green-fg}Congratulations!{/green-fg}{/bold}\n\n' +
                                            "{center}Final Score: {yellow-fg}".concat(state.score, "{/yellow-fg}\n\n") +
                                            '{center}Press {cyan-fg}N{/cyan-fg} for new game\n' +
                                            '{center}or {cyan-fg}Q{/cyan-fg} to quit{/center}',
                                        tags: true,
                                        style: {
                                            fg: 'white',
                                            bg: 'black',
                                            border: { fg: 'green' },
                                        },
                                    });
                                }
                                else if (state.gameOver) {
                                    ui.createBox({
                                        top: 'center',
                                        left: 'center',
                                        width: 40,
                                        height: 8,
                                        border: { type: 'line' },
                                        label: ' GAME OVER ',
                                        content: "{center}{bold}{red-fg}No more moves!{/red-fg}{/bold}\n\n" +
                                            "{center}Final Score: {yellow-fg}".concat(state.score, "{/yellow-fg}\n\n") +
                                            "{center}Press {cyan-fg}N{/cyan-fg} for new game\n" +
                                            "{center}or {cyan-fg}Q{/cyan-fg} to quit{/center}",
                                        tags: true,
                                        style: {
                                            fg: 'white',
                                            bg: 'black',
                                            border: { fg: 'red' },
                                        },
                                    });
                                }
                                ui.createBox({
                                    bottom: 0,
                                    left: 0,
                                    width: '100%',
                                    height: 1,
                                    content: " Player: ".concat(playerName, " | Use arrow keys to move | Q to quit "),
                                    style: {
                                        fg: 'white',
                                        bg: 'blue',
                                    },
                                });
                                ui.render();
                            };
                            renderGame();
                            ui.onKey(['up', 'k'], function () {
                                if (!game.getState().gameOver) {
                                    game.move('up');
                                    renderGame();
                                }
                            });
                            ui.onKey(['down', 'j'], function () {
                                if (!game.getState().gameOver) {
                                    game.move('down');
                                    renderGame();
                                }
                            });
                            ui.onKey(['left', 'h'], function () {
                                if (!game.getState().gameOver) {
                                    game.move('left');
                                    renderGame();
                                }
                            });
                            ui.onKey(['right', 'l'], function () {
                                if (!game.getState().gameOver) {
                                    game.move('right');
                                    renderGame();
                                }
                            });
                            ui.onKey(['u', 'U'], function () {
                                if (game.undo()) {
                                    renderGame();
                                }
                            });
                            ui.onKey(['n', 'N'], function () {
                                game.reset();
                                renderGame();
                            });
                            ui.onKey(['q', 'Q', 'escape'], function () {
                                finish();
                            });
                            socket.once('disconnect', function () {
                                finish();
                            });
                        })];
                case 1:
                    _a.sent();
                    console.log("User ".concat(playerName, " disconnected from 2048 Game"));
                    return [2 /*return*/];
            }
        });
    });
}
