import path from 'path';
import { fileURLToPath } from 'url';
import { AmigaDoorSession } from './src/amiga-emulation/AmigaDoorSession.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock socket for testing with input simulation
const mockSocket = {
  emit: function(event: string, data: any) {
    if (event === 'ansi-output') {
      console.log('[DOOR OUTPUT]', data);
    } else if (event === 'door:status') {
      console.log(`[STATUS] ${data.status}`);
    } else {
      console.log(`[Socket Event: ${event}]`, JSON.stringify(data));
    }
  },
  on: function(event: string, handler: Function) {
    console.log(`[Socket] Registered handler for event: ${event}`);

    // Store the input handler so we can call it
    if (event === 'door:input') {
      (mockSocket as any)._inputHandler = handler;
    }
  },
  removeAllListeners: function(event?: string) {
    console.log(`[Socket] Removed listeners for event: ${event || 'all'}`);
  }
} as any;

// Function to simulate user input
function sendInput(text: string) {
  console.log(`\n[USER INPUT] Sending: "${text}"`);
  if ((mockSocket as any)._inputHandler) {
    (mockSocket as any)._inputHandler(text);
  }
}

// Mock session
const mockSession = {
  user: {
    id: 'test-user',
    username: 'TestUser'
  },
  nodeId: 1
} as any;

async function testInteractiveDoor() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Interactive Door Test - Input/Output');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const doorPath = path.join(__dirname, 'BBS/Doors/WeekConfTop/WeekConfTop.XIM');

  console.log('[Test] Door path:', doorPath);
  console.log('[Test] Creating door session...');
  console.log('');

  const doorSession = new AmigaDoorSession(mockSocket, {
    executablePath: doorPath,
    workingDirectory: path.dirname(doorPath),
    timeout: 30,
    sessionData: mockSession
  });

  console.log('[Test] Starting door...');
  console.log('');

  try {
    await doorSession.start();

    // Let door run for 2 seconds
    console.log('[Test] Door running... collecting initial output');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Send some test input
    sendInput('Test User Input\r\n');

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Send another input
    sendInput('Y\r\n');

    // Wait for more output
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('');
    console.log('[Test] Stopping door...');
    doorSession.terminate();

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Test Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (error) {
    console.error('[Test] Error:', error);
    process.exit(1);
  }
}

testInteractiveDoor().catch(error => {
  console.error('[Test] Fatal error:', error);
  process.exit(1);
});
