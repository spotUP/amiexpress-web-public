// ANSI color codes
const ANSI = {
  RESET: '\x1b[0m',
  CYAN: '\x1b[36m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  RED: '\x1b[31m',
  CLEAR_SCREEN: '\x1b[2J\x1b[H'
};

interface BlackjackGame {
  playerHand: string[];
  dealerHand: string[];
  deck: string[];
  playerScore: number;
  dealerScore: number;
  bet: number;
  gameOver: boolean;
  playerStood: boolean;
}

// Card game utilities
const suits = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck(): string[] {
  const deck: string[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

function shuffleDeck(deck: string[]): void {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function dealCard(deck: string[]): string | undefined {
  return deck.pop();
}

function getCardValue(card: string): number {
  const rank = card.slice(0, -1);
  if (rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank);
}

function getHandValue(hand: string[]): number {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    const value = getCardValue(card);
    total += value;
    if (card[0] === 'A') aces++;
  }

  // Adjust for aces
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function displayCard(card: string): string {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const suitSymbol = suit === 'S' ? 'S' : suit === 'H' ? 'H' : suit === 'D' ? 'D' : 'C';
  return `[${rank}${suitSymbol}]`;
}

function centerText(text: string, width: number = 80): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text;
}

async function getInput(socket: any, bbsSession: any, prompt: string): Promise<string> {
  socket.emit('ansi-output', prompt);
  return new Promise<string>((resolve) => {
    bbsSession.doorInputHandler = (data: string) => {
      delete bbsSession.doorInputHandler;
      resolve(data.trim());
    };
  });
}

async function getKey(socket: any, bbsSession: any): Promise<string> {
  return new Promise<string>((resolve) => {
    bbsSession.doorInputHandler = (data: string) => {
      delete bbsSession.doorInputHandler;
      resolve(data);
    };
  });
}

function createBlackjackGame(): BlackjackGame {
  const deck = createDeck();
  shuffleDeck(deck);

  const playerHand = [dealCard(deck)!, dealCard(deck)!];
  const dealerHand = [dealCard(deck)!, dealCard(deck)!];

  return {
    playerHand,
    dealerHand,
    deck,
    playerScore: getHandValue(playerHand),
    dealerScore: getCardValue(dealerHand[0]), // Hide second card
    bet: 10,
    gameOver: false,
    playerStood: false
  };
}

function displayBlackjackGame(socket: any, game: BlackjackGame) {
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
  } else {
    game.dealerHand.forEach(card => {
      socket.emit('ansi-output', displayCard(card) + ' ');
    });
  }
  socket.emit('ansi-output', ANSI.RESET);

  if (game.gameOver || game.playerStood) {
    socket.emit('ansi-output', ` (Score: ${getHandValue(game.dealerHand)})\r\n`);
  } else {
    socket.emit('ansi-output', ` (Showing: ${game.dealerScore})\r\n`);
  }

  socket.emit('ansi-output', '\r\n');

  // Player's hand
  socket.emit('ansi-output', ANSI.CYAN);
  socket.emit('ansi-output', 'Player: ');
  game.playerHand.forEach(card => {
    socket.emit('ansi-output', displayCard(card) + ' ');
  });
  socket.emit('ansi-output', ANSI.RESET);
  socket.emit('ansi-output', ` (Score: ${game.playerScore})\r\n`);

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', `Bet: $${game.bet}\r\n`);

  if (!game.gameOver) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', 'Commands: (H)it, (S)tand, (Q)uit\r\n');
  }
}

async function playBlackjackGame(socket: any, bbsSession: any): Promise<void> {
  let playerMoney = 100;

  socket.emit('ansi-output', ANSI.CLEAR_SCREEN);
  socket.emit('ansi-output', ANSI.YELLOW);
  socket.emit('ansi-output', centerText('Welcome to Blackjack!', 80) + '\r\n');
  socket.emit('ansi-output', ANSI.RESET);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Try to get as close to 21 as possible without going over.\r\n');
  socket.emit('ansi-output', 'Beat the dealer to win!\r\n');
  socket.emit('ansi-output', '\r\n');
  await new Promise(resolve => setTimeout(resolve, 2000));

  while (playerMoney > 0) {
    socket.emit('ansi-output', `You have $${playerMoney}\r\n`);

    let bet = 0;
    while (bet === 0) {
      const betInput = await getInput(socket, bbsSession, 'Place your bet: ');
      const betNum = parseInt(betInput);
      if (!isNaN(betNum) && betNum >= 1 && betNum <= playerMoney) {
        bet = betNum;
      } else {
        socket.emit('ansi-output', ANSI.RED + 'Invalid bet. Enter a number between 1 and ' + playerMoney + '\r\n' + ANSI.RESET);
      }
    }

    const game = createBlackjackGame();
    game.bet = bet;

    while (!game.gameOver) {
      displayBlackjackGame(socket, game);

      const action = await getInput(socket, bbsSession, 'Your action (H/S/Q): ');

      switch (action.toLowerCase()) {
        case 'h':
          const newCard = dealCard(game.deck);
          if (newCard) {
            game.playerHand.push(newCard);
            game.playerScore = getHandValue(game.playerHand);

            if (game.playerScore > 21) {
              game.gameOver = true;
              displayBlackjackGame(socket, game);
              socket.emit('ansi-output', '\r\n');
              socket.emit('ansi-output', ANSI.RED);
              socket.emit('ansi-output', centerText('BUST! You went over 21.', 80) + '\r\n');
              socket.emit('ansi-output', ANSI.RESET);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
          break;

        case 's':
          game.playerStood = true;
          game.gameOver = true;
          break;

        case 'q':
          return;
      }
    }

    // Dealer's turn
    if (game.playerScore <= 21) {
      displayBlackjackGame(socket, game);
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', 'Dealer\'s turn...\r\n');
      await new Promise(resolve => setTimeout(resolve, 1000));

      while (getHandValue(game.dealerHand) < 17) {
        const card = dealCard(game.deck);
        if (card) {
          game.dealerHand.push(card);
          displayBlackjackGame(socket, game);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const dealerScore = getHandValue(game.dealerHand);
      displayBlackjackGame(socket, game);
      socket.emit('ansi-output', '\r\n');

      // Determine winner
      if (dealerScore > 21) {
        socket.emit('ansi-output', ANSI.GREEN);
        socket.emit('ansi-output', centerText('Dealer busts! You win!', 80) + '\r\n');
        playerMoney += bet;
      } else if (dealerScore > game.playerScore) {
        socket.emit('ansi-output', ANSI.RED);
        socket.emit('ansi-output', centerText('Dealer wins!', 80) + '\r\n');
        playerMoney -= bet;
      } else if (dealerScore < game.playerScore) {
        socket.emit('ansi-output', ANSI.GREEN);
        socket.emit('ansi-output', centerText('You win!', 80) + '\r\n');
        playerMoney += bet;
      } else {
        socket.emit('ansi-output', ANSI.YELLOW);
        socket.emit('ansi-output', centerText('Push! It\'s a tie.', 80) + '\r\n');
      }
      socket.emit('ansi-output', ANSI.RESET);
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      playerMoney -= bet;
    }

    socket.emit('ansi-output', '\r\n');
    if (playerMoney <= 0) {
      socket.emit('ansi-output', ANSI.RED);
      socket.emit('ansi-output', centerText('Game Over! You\'re out of money.', 80) + '\r\n');
      socket.emit('ansi-output', ANSI.RESET);
      break;
    }

    const playAgain = await getInput(socket, bbsSession, 'Play another hand? (Y/N): ');
    if (playAgain.toLowerCase() !== 'y') break;

    socket.emit('ansi-output', '\r\n');
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', ANSI.GREEN);
  socket.emit('ansi-output', centerText(`Final Balance: $${playerMoney}`, 80) + '\r\n');
  socket.emit('ansi-output', ANSI.RESET);
}

export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession } = doorSession;

  socket.emit('ansi-output', ANSI.CLEAR_SCREEN);
  socket.emit('ansi-output', ANSI.CYAN);
  socket.emit('ansi-output', centerText('BLACKJACK', 80) + '\r\n');
  socket.emit('ansi-output', ANSI.RESET);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Welcome to the ultimate card game!\r\n');
  socket.emit('ansi-output', 'Beat the dealer and see how much you can win.\r\n');
  socket.emit('ansi-output', '\r\n');

  const startChoice = await getInput(socket, bbsSession, 'Press ENTER to play or Q to quit: ');
  if (startChoice.toLowerCase() === 'q') {
    return;
  }

  await playBlackjackGame(socket, bbsSession);

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', ANSI.GREEN);
  socket.emit('ansi-output', centerText('Thanks for playing Blackjack!', 80) + '\r\n');
  socket.emit('ansi-output', ANSI.RESET);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Press any key to exit...\r\n');
  await getKey(socket, bbsSession);
}
