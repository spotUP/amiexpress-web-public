"use strict";
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
exports.runDoor = void 0;
// ANSI color codes
var ANSI = {
    RESET: '\x1b[0m',
    CYAN: '\x1b[36m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    RED: '\x1b[31m',
    CLEAR_SCREEN: '\x1b[2J\x1b[H'
};
// Card game utilities
var suits = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs
var ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
function createDeck() {
    var deck = [];
    for (var _i = 0, suits_1 = suits; _i < suits_1.length; _i++) {
        var suit = suits_1[_i];
        for (var _a = 0, ranks_1 = ranks; _a < ranks_1.length; _a++) {
            var rank = ranks_1[_a];
            deck.push("".concat(rank).concat(suit));
        }
    }
    return deck;
}
function shuffleDeck(deck) {
    var _a;
    for (var i = deck.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        _a = [deck[j], deck[i]], deck[i] = _a[0], deck[j] = _a[1];
    }
}
function dealCard(deck) {
    return deck.pop();
}
function getCardValue(card) {
    var rank = card.slice(0, -1);
    if (rank === 'A')
        return 11;
    if (['J', 'Q', 'K'].includes(rank))
        return 10;
    return parseInt(rank);
}
function getHandValue(hand) {
    var total = 0;
    var aces = 0;
    for (var _i = 0, hand_1 = hand; _i < hand_1.length; _i++) {
        var card = hand_1[_i];
        var value = getCardValue(card);
        total += value;
        if (card[0] === 'A')
            aces++;
    }
    // Adjust for aces
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    return total;
}
function displayCard(card) {
    var rank = card.slice(0, -1);
    var suit = card.slice(-1);
    var suitSymbol = suit === 'S' ? 'S' : suit === 'H' ? 'H' : suit === 'D' ? 'D' : 'C';
    return "[".concat(rank).concat(suitSymbol, "]");
}
function centerText(text, width) {
    if (width === void 0) { width = 80; }
    var padding = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(padding) + text;
}
function getInput(socket, bbsSession, prompt) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            socket.emit('ansi-output', prompt);
            return [2 /*return*/, new Promise(function (resolve) {
                    bbsSession.doorInputHandler = function (data) {
                        delete bbsSession.doorInputHandler;
                        resolve(data.trim());
                    };
                })];
        });
    });
}
function getKey(socket, bbsSession) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) {
                    bbsSession.doorInputHandler = function (data) {
                        delete bbsSession.doorInputHandler;
                        resolve(data);
                    };
                })];
        });
    });
}
function createBlackjackGame() {
    var deck = createDeck();
    shuffleDeck(deck);
    var playerHand = [dealCard(deck), dealCard(deck)];
    var dealerHand = [dealCard(deck), dealCard(deck)];
    return {
        playerHand: playerHand,
        dealerHand: dealerHand,
        deck: deck,
        playerScore: getHandValue(playerHand),
        dealerScore: getCardValue(dealerHand[0]), // Hide second card
        bet: 10,
        gameOver: false,
        playerStood: false
    };
}
function displayBlackjackGame(socket, game) {
    socket.emit('ansi-output', ANSI.CLEAR_SCREEN);
    socket.emit('ansi-output', ANSI.GREEN);
    socket.emit('ansi-output', centerText('BLACKJACK', 80) + '\r\n');
    socket.emit('ansi-output', ANSI.RESET);
    socket.emit('ansi-output', '\r\n');
    // Dealer's hand (hide second card if game not over)
    socket.emit('ansi-output', ANSI.RED);
    socket.emit('ansi-output', 'Dealer: ');
    if (!game.gameOver && !game.playerStood) {
        socket.emit('ansi-output', '[??] ');
        socket.emit('ansi-output', displayCard(game.dealerHand[0]));
    }
    else {
        game.dealerHand.forEach(function (card) {
            socket.emit('ansi-output', displayCard(card) + ' ');
        });
    }
    socket.emit('ansi-output', ANSI.RESET);
    if (game.gameOver || game.playerStood) {
        socket.emit('ansi-output', " (Score: ".concat(getHandValue(game.dealerHand), ")\r\n"));
    }
    else {
        socket.emit('ansi-output', " (Showing: ".concat(game.dealerScore, ")\r\n"));
    }
    socket.emit('ansi-output', '\r\n');
    // Player's hand
    socket.emit('ansi-output', ANSI.CYAN);
    socket.emit('ansi-output', 'Player: ');
    game.playerHand.forEach(function (card) {
        socket.emit('ansi-output', displayCard(card) + ' ');
    });
    socket.emit('ansi-output', ANSI.RESET);
    socket.emit('ansi-output', " (Score: ".concat(game.playerScore, ")\r\n"));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', "Bet: $".concat(game.bet, "\r\n"));
    if (!game.gameOver) {
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', 'Commands: (H)it, (S)tand, (Q)uit\r\n');
    }
}
function playBlackjackGame(socket, bbsSession) {
    return __awaiter(this, void 0, void 0, function () {
        var playerMoney, bet, betInput, betNum, game, action, _a, newCard, card, dealerScore, playAgain;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    playerMoney = 100;
                    socket.emit('ansi-output', ANSI.CLEAR_SCREEN);
                    socket.emit('ansi-output', ANSI.YELLOW);
                    socket.emit('ansi-output', centerText('Welcome to Blackjack!', 80) + '\r\n');
                    socket.emit('ansi-output', ANSI.RESET);
                    socket.emit('ansi-output', '\r\n');
                    socket.emit('ansi-output', 'Try to get as close to 21 as possible without going over.\r\n');
                    socket.emit('ansi-output', 'Beat the dealer to win!\r\n');
                    socket.emit('ansi-output', '\r\n');
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 2000); })];
                case 1:
                    _b.sent();
                    _b.label = 2;
                case 2:
                    if (!(playerMoney > 0)) return [3 /*break*/, 24];
                    socket.emit('ansi-output', "You have $".concat(playerMoney, "\r\n"));
                    bet = 0;
                    _b.label = 3;
                case 3:
                    if (!(bet === 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, getInput(socket, bbsSession, 'Place your bet: ')];
                case 4:
                    betInput = _b.sent();
                    betNum = parseInt(betInput);
                    if (!isNaN(betNum) && betNum >= 1 && betNum <= playerMoney) {
                        bet = betNum;
                    }
                    else {
                        socket.emit('ansi-output', ANSI.RED + 'Invalid bet. Enter a number between 1 and ' + playerMoney + '\r\n' + ANSI.RESET);
                    }
                    return [3 /*break*/, 3];
                case 5:
                    game = createBlackjackGame();
                    game.bet = bet;
                    _b.label = 6;
                case 6:
                    if (!!game.gameOver) return [3 /*break*/, 14];
                    displayBlackjackGame(socket, game);
                    return [4 /*yield*/, getInput(socket, bbsSession, 'Your action (H/S/Q): ')];
                case 7:
                    action = _b.sent();
                    _a = action.toLowerCase();
                    switch (_a) {
                        case 'h': return [3 /*break*/, 8];
                        case 's': return [3 /*break*/, 11];
                        case 'q': return [3 /*break*/, 12];
                    }
                    return [3 /*break*/, 13];
                case 8:
                    newCard = dealCard(game.deck);
                    if (!newCard) return [3 /*break*/, 10];
                    game.playerHand.push(newCard);
                    game.playerScore = getHandValue(game.playerHand);
                    if (!(game.playerScore > 21)) return [3 /*break*/, 10];
                    game.gameOver = true;
                    displayBlackjackGame(socket, game);
                    socket.emit('ansi-output', '\r\n');
                    socket.emit('ansi-output', ANSI.RED);
                    socket.emit('ansi-output', centerText('BUST! You went over 21.', 80) + '\r\n');
                    socket.emit('ansi-output', ANSI.RESET);
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 2000); })];
                case 9:
                    _b.sent();
                    _b.label = 10;
                case 10: return [3 /*break*/, 13];
                case 11:
                    game.playerStood = true;
                    game.gameOver = true;
                    return [3 /*break*/, 13];
                case 12: return [2 /*return*/];
                case 13: return [3 /*break*/, 6];
                case 14:
                    if (!(game.playerScore <= 21)) return [3 /*break*/, 21];
                    displayBlackjackGame(socket, game);
                    socket.emit('ansi-output', '\r\n');
                    socket.emit('ansi-output', 'Dealer\'s turn...\r\n');
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                case 15:
                    _b.sent();
                    _b.label = 16;
                case 16:
                    if (!(getHandValue(game.dealerHand) < 17)) return [3 /*break*/, 19];
                    card = dealCard(game.deck);
                    if (!card) return [3 /*break*/, 18];
                    game.dealerHand.push(card);
                    displayBlackjackGame(socket, game);
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 500); })];
                case 17:
                    _b.sent();
                    _b.label = 18;
                case 18: return [3 /*break*/, 16];
                case 19:
                    dealerScore = getHandValue(game.dealerHand);
                    displayBlackjackGame(socket, game);
                    socket.emit('ansi-output', '\r\n');
                    // Determine winner
                    if (dealerScore > 21) {
                        socket.emit('ansi-output', ANSI.GREEN);
                        socket.emit('ansi-output', centerText('Dealer busts! You win!', 80) + '\r\n');
                        playerMoney += bet;
                    }
                    else if (dealerScore > game.playerScore) {
                        socket.emit('ansi-output', ANSI.RED);
                        socket.emit('ansi-output', centerText('Dealer wins!', 80) + '\r\n');
                        playerMoney -= bet;
                    }
                    else if (dealerScore < game.playerScore) {
                        socket.emit('ansi-output', ANSI.GREEN);
                        socket.emit('ansi-output', centerText('You win!', 80) + '\r\n');
                        playerMoney += bet;
                    }
                    else {
                        socket.emit('ansi-output', ANSI.YELLOW);
                        socket.emit('ansi-output', centerText('Push! It\'s a tie.', 80) + '\r\n');
                    }
                    socket.emit('ansi-output', ANSI.RESET);
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 2000); })];
                case 20:
                    _b.sent();
                    return [3 /*break*/, 22];
                case 21:
                    playerMoney -= bet;
                    _b.label = 22;
                case 22:
                    socket.emit('ansi-output', '\r\n');
                    if (playerMoney <= 0) {
                        socket.emit('ansi-output', ANSI.RED);
                        socket.emit('ansi-output', centerText('Game Over! You\'re out of money.', 80) + '\r\n');
                        socket.emit('ansi-output', ANSI.RESET);
                        return [3 /*break*/, 24];
                    }
                    return [4 /*yield*/, getInput(socket, bbsSession, 'Play another hand? (Y/N): ')];
                case 23:
                    playAgain = _b.sent();
                    if (playAgain.toLowerCase() !== 'y')
                        return [3 /*break*/, 24];
                    socket.emit('ansi-output', '\r\n');
                    return [3 /*break*/, 2];
                case 24:
                    socket.emit('ansi-output', '\r\n');
                    socket.emit('ansi-output', ANSI.GREEN);
                    socket.emit('ansi-output', centerText("Final Balance: $".concat(playerMoney), 80) + '\r\n');
                    socket.emit('ansi-output', ANSI.RESET);
                    return [2 /*return*/];
            }
        });
    });
}
function runDoor(doorSession) {
    return __awaiter(this, void 0, void 0, function () {
        var socket, bbsSession, startChoice;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    socket = doorSession.socket, bbsSession = doorSession.bbsSession;
                    socket.emit('ansi-output', ANSI.CLEAR_SCREEN);
                    socket.emit('ansi-output', ANSI.CYAN);
                    socket.emit('ansi-output', centerText('BLACKJACK', 80) + '\r\n');
                    socket.emit('ansi-output', ANSI.RESET);
                    socket.emit('ansi-output', '\r\n');
                    socket.emit('ansi-output', 'Welcome to the ultimate card game!\r\n');
                    socket.emit('ansi-output', 'Beat the dealer and see how much you can win.\r\n');
                    socket.emit('ansi-output', '\r\n');
                    return [4 /*yield*/, getInput(socket, bbsSession, 'Press ENTER to play or Q to quit: ')];
                case 1:
                    startChoice = _a.sent();
                    if (startChoice.toLowerCase() === 'q') {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, playBlackjackGame(socket, bbsSession)];
                case 2:
                    _a.sent();
                    socket.emit('ansi-output', '\r\n');
                    socket.emit('ansi-output', ANSI.GREEN);
                    socket.emit('ansi-output', centerText('Thanks for playing Blackjack!', 80) + '\r\n');
                    socket.emit('ansi-output', ANSI.RESET);
                    socket.emit('ansi-output', '\r\n');
                    socket.emit('ansi-output', 'Press any key to exit...\r\n');
                    return [4 /*yield*/, getKey(socket, bbsSession)];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
exports.runDoor = runDoor;
