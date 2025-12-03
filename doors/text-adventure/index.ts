interface Room {
  id: string;
  name: string;
  description: string;
  exits: { [direction: string]: string };
  items: string[];
}

interface Player {
  currentRoom: string;
  inventory: string[];
  score: number;
}

interface GameState {
  player: Player;
  rooms: { [id: string]: Room };
  gameOver: boolean;
}

// ANSI color codes
const ANSI = {
  RESET: '\x1b[0m',
  CYAN: '\x1b[36m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  RED: '\x1b[31m',
  MAGENTA: '\x1b[35m',
  WHITE: '\x1b[37m',
  GRAY: '\x1b[90m',
  CLEAR_SCREEN: '\x1b[2J\x1b[H'
};

function createAdventureGame(): GameState {
  const rooms: { [id: string]: Room } = {
    'entrance': {
      id: 'entrance',
      name: 'Castle Entrance',
      description: 'You stand before a massive stone castle. The heavy wooden doors are slightly ajar, and you can hear the wind howling through the trees.',
      exits: { 'north': 'courtyard', 'enter': 'great_hall' },
      items: ['lantern']
    },
    'courtyard': {
      id: 'courtyard',
      name: 'Castle Courtyard',
      description: 'The courtyard is overgrown with weeds. A stone fountain stands in the center, dry and cracked. Paths lead in several directions.',
      exits: { 'south': 'entrance', 'east': 'garden', 'west': 'stables', 'north': 'tower' },
      items: ['rusty_key']
    },
    'great_hall': {
      id: 'great_hall',
      name: 'Great Hall',
      description: 'This was once a magnificent hall for banquets. Now dust covers everything, and cobwebs hang from the rafters. A throne sits at the far end.',
      exits: { 'exit': 'entrance', 'upstairs': 'bedroom' },
      items: ['golden_cup']
    },
    'garden': {
      id: 'garden',
      name: 'Overgrown Garden',
      description: 'Beautiful roses struggle to grow among the thorns and weeds. A small shed stands in the corner.',
      exits: { 'west': 'courtyard', 'shed': 'shed' },
      items: ['rose']
    },
    'shed': {
      id: 'shed',
      name: 'Garden Shed',
      description: 'A small wooden shed filled with gardening tools. Everything is covered in dust.',
      exits: { 'exit': 'garden' },
      items: ['shovel', 'watering_can']
    },
    'stables': {
      id: 'stables',
      name: 'Abandoned Stables',
      description: 'Horse stalls stand empty, their doors hanging loosely. Hay is scattered on the ground.',
      exits: { 'east': 'courtyard' },
      items: ['horse_brush']
    },
    'tower': {
      id: 'tower',
      name: 'Tower Room',
      description: 'From this high tower, you can see for miles. A treasure chest sits in the corner, locked with a golden lock.',
      exits: { 'down': 'courtyard' },
      items: ['treasure_chest']
    },
    'bedroom': {
      id: 'bedroom',
      name: 'Royal Bedroom',
      description: 'An opulent bedroom with a four-poster bed. The royal jewels are scattered across the dresser.',
      exits: { 'downstairs': 'great_hall' },
      items: ['royal_jewels']
    }
  };

  return {
    player: {
      currentRoom: 'entrance',
      inventory: [],
      score: 0
    },
    rooms,
    gameOver: false
  };
}

function centerText(text: string, width: number = 80): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text;
}

function displayMenuWithSelection(socket: any, options: any[], selectedIndex: number) {
  // Clear screen
  socket.emit('ansi-output', ANSI.CLEAR_SCREEN);

  // Header
  socket.emit('ansi-output', ANSI.CYAN);
  socket.emit('ansi-output', '╔' + '═'.repeat(78) + '╗\r\n');
  socket.emit('ansi-output', '║' + centerText('CASTLE ADVENTURE', 78) + '║\r\n');
  socket.emit('ansi-output', '║' + centerText('Navigate with Arrow Keys', 78) + '║\r\n');
  socket.emit('ansi-output', '╚' + '═'.repeat(78) + '╝\r\n');
  socket.emit('ansi-output', ANSI.RESET);
  socket.emit('ansi-output', '\r\n');

  // Menu options
  socket.emit('ansi-output', ANSI.WHITE);
  socket.emit('ansi-output', '┌' + '─'.repeat(77) + '┐\r\n');
  socket.emit('ansi-output', '│' + centerText('AVAILABLE ACTIONS', 77) + '│\r\n');
  socket.emit('ansi-output', '├' + '─'.repeat(77) + '┤\r\n');

  options.forEach((option, index) => {
    const displayText = `${index === selectedIndex ? '> ' : '  '}${option.text}`;
    if (index === selectedIndex) {
      socket.emit('ansi-output', ANSI.YELLOW);
    } else {
      socket.emit('ansi-output', ANSI.GRAY);
    }
    socket.emit('ansi-output', '│ ' + displayText.padEnd(75) + ' │\r\n');
  });

  socket.emit('ansi-output', ANSI.WHITE);
  socket.emit('ansi-output', '└' + '─'.repeat(77) + '┘\r\n');
  socket.emit('ansi-output', ANSI.RESET);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', ANSI.GREEN);
  socket.emit('ansi-output', centerText('UP/DOWN Move    ENTER Select    Q Quit', 80) + '\r\n');
  socket.emit('ansi-output', ANSI.RESET);
}

async function getKey(socket: any, bbsSession: any): Promise<string> {
  return new Promise<string>((resolve) => {
    bbsSession.doorInputHandler = (data: string) => {
      delete bbsSession.doorInputHandler;
      resolve(data);
    };
  });
}

async function handleArrowKeyNavigation(
  socket: any,
  bbsSession: any,
  options: any[],
  currentSelection: number
): Promise<number> {
  let selection = currentSelection;

  while (true) {
    // Redraw menu with current selection highlighted
    displayMenuWithSelection(socket, options, selection);

    try {
      const key = await getKey(socket, bbsSession);

      if (key === 'q' || key === 'Q') {
        return -1;
      } else if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        selection = Math.max(0, selection - 1);
      } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
        selection = Math.min(options.length - 1, selection + 1);
      } else if (key === 'Enter' || key === '\r' || key === '\n') {
        return selection;
      }
    } catch (error) {
      continue;
    }
  }
}

function createMenuOptions(gameState: GameState): any[] {
  const room = gameState.rooms[gameState.player.currentRoom];
  const options: any[] = [];

  // Movement options
  Object.keys(room.exits).forEach(exit => {
    options.push({ type: 'move', text: `Go ${exit}`, value: exit });
  });

  // Item interaction options
  room.items.forEach(item => {
    options.push({ type: 'take', text: `Take ${item.replace('_', ' ')}`, value: item });
  });

  // Inventory options
  if (gameState.player.inventory.length > 0) {
    gameState.player.inventory.forEach(item => {
      options.push({ type: 'drop', text: `Drop ${item.replace('_', ' ')}`, value: item });
    });
  }

  // Utility options
  options.push({ type: 'inventory', text: 'View Inventory', value: null });
  options.push({ type: 'help', text: 'Game Help', value: null });
  options.push({ type: 'quit', text: 'Quit Game', value: null });

  return options;
}

async function executeAction(
  socket: any,
  gameState: GameState,
  action: any
): Promise<void> {
  const room = gameState.rooms[gameState.player.currentRoom];

  socket.emit('ansi-output', '\r\n');

  switch (action.type) {
    case 'move':
      if (room.exits[action.value]) {
        gameState.player.currentRoom = room.exits[action.value];
        gameState.player.score += 10;
        socket.emit('ansi-output', ANSI.GREEN);
        socket.emit('ansi-output', `You move ${action.value}...\r\n`);
      } else {
        socket.emit('ansi-output', ANSI.RED);
        socket.emit('ansi-output', 'You cannot go that way.\r\n');
      }
      break;

    case 'take':
      const itemIndex = room.items.indexOf(action.value);
      if (itemIndex !== -1) {
        const item = room.items.splice(itemIndex, 1)[0];
        gameState.player.inventory.push(item);
        gameState.player.score += 5;
        socket.emit('ansi-output', ANSI.YELLOW);
        socket.emit('ansi-output', `You take the ${item.replace('_', ' ')}.\r\n`);
      } else {
        socket.emit('ansi-output', ANSI.RED);
        socket.emit('ansi-output', 'That item is not here.\r\n');
      }
      break;

    case 'drop':
      const invIndex = gameState.player.inventory.indexOf(action.value);
      if (invIndex !== -1) {
        const item = gameState.player.inventory.splice(invIndex, 1)[0];
        room.items.push(item);
        socket.emit('ansi-output', ANSI.RED);
        socket.emit('ansi-output', `You drop the ${item.replace('_', ' ')}.\r\n`);
      } else {
        socket.emit('ansi-output', ANSI.RED);
        socket.emit('ansi-output', 'You do not have that item.\r\n');
      }
      break;

    case 'inventory':
      if (gameState.player.inventory.length === 0) {
        socket.emit('ansi-output', ANSI.RED);
        socket.emit('ansi-output', 'Your inventory is empty.\r\n');
      } else {
        socket.emit('ansi-output', ANSI.MAGENTA);
        socket.emit('ansi-output', 'You are carrying: ' +
          gameState.player.inventory.map(item => item.replace('_', ' ')).join(', ') + '\r\n');
      }
      break;

    case 'help':
      socket.emit('ansi-output', ANSI.CYAN);
      socket.emit('ansi-output', 'Goal: Collect the royal jewels and golden cup, then return to the entrance.\r\n');
      socket.emit('ansi-output', 'Navigate between rooms using the available exits.\r\n');
      socket.emit('ansi-output', 'Collect items to help you on your quest.\r\n');
      break;

    case 'quit':
      gameState.gameOver = true;
      return;
  }

  socket.emit('ansi-output', ANSI.RESET);
  await new Promise(resolve => setTimeout(resolve, 1500));
}

async function playAdventureGame(
  socket: any,
  bbsSession: any
): Promise<number> {
  const gameState = createAdventureGame();
  let selectedOption = 0;

  while (!gameState.gameOver) {
    const menuOptions = createMenuOptions(gameState);

    selectedOption = await handleArrowKeyNavigation(socket, bbsSession, menuOptions, selectedOption);

    if (selectedOption === -1) {
      gameState.gameOver = true;
      break;
    }

    const selectedAction = menuOptions[selectedOption];
    await executeAction(socket, gameState, selectedAction);

    // Check win condition
    if (gameState.player.inventory.includes('royal_jewels') &&
        gameState.player.inventory.includes('golden_cup') &&
        gameState.player.currentRoom === 'entrance') {

      socket.emit('ansi-output', ANSI.CLEAR_SCREEN);
      socket.emit('ansi-output', ANSI.GREEN);
      socket.emit('ansi-output', centerText('╔═════════════════════════════════════════════════════════════╗', 80) + '\r\n');
      socket.emit('ansi-output', centerText('║           VICTORY! TREASURES FOUND!                         ║', 80) + '\r\n');
      socket.emit('ansi-output', centerText('╚═════════════════════════════════════════════════════════════╝', 80) + '\r\n');
      socket.emit('ansi-output', ANSI.RESET);
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', `Final Score: ${gameState.player.score}\r\n`);
      socket.emit('ansi-output', '\r\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
      gameState.gameOver = true;
      break;
    }
  }

  return gameState.player.score;
}

export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession } = doorSession;

  socket.emit('ansi-output', ANSI.CLEAR_SCREEN);
  socket.emit('ansi-output', ANSI.CYAN);
  socket.emit('ansi-output', centerText('CASTLE ADVENTURE', 80) + '\r\n');
  socket.emit('ansi-output', ANSI.RESET);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Explore the abandoned castle and collect treasures!\r\n');
  socket.emit('ansi-output', 'Find the royal jewels and golden cup, then return to the entrance.\r\n');
  socket.emit('ansi-output', '\r\n');

  await new Promise(resolve => setTimeout(resolve, 2000));

  const score = await playAdventureGame(socket, bbsSession);

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', ANSI.GREEN);
  socket.emit('ansi-output', centerText(`Adventure Complete! Score: ${score}`, 80) + '\r\n');
  socket.emit('ansi-output', ANSI.RESET);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Press ENTER to exit...\r\n');
  await getKey(socket, bbsSession);
}
