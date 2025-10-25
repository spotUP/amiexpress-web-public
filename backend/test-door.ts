/**
 * Standalone Door Emulator Test
 * Tests door execution without requiring database or BBS server
 *
 * Run with: npx tsx test-door.ts
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { AmigaDoorSession } from './src/amiga-emulation/AmigaDoorSession.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock socket for testing
const mockSocket = {
  emit: function(event: string, data: any) {
    if (event === 'ansi-output') {
      console.log('[DOOR OUTPUT]', data);
    } else {
      console.log(`[Socket Event: ${event}]`, JSON.stringify(data));
    }
  },
  on: function(event: string, handler: Function) {
    console.log(`[Socket] Registered handler for event: ${event}`);
    // Store handlers if needed, but for testing we don't need to
  },
  removeAllListeners: function(event?: string) {
    console.log(`[Socket] Removed listeners for event: ${event || 'all'}`);
  }
} as any;

// Mock session
const mockSession = {
  user: {
    id: 'test-user',
    username: 'TestUser'
  },
  nodeId: 1
} as any;

async function testDoor() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Standalone Door Emulator Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Test BestConf door (different functionality than WeekConfTop)
  const doorPath = path.join(__dirname, 'BBS/Doors/BestConf/BestConf.XIM');
  // const doorPath = path.join(__dirname, 'BBS/Doors/WeekConfTop/WeekConfTop.XIM');

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

    // Let it run for 5 seconds
    console.log('[Test] Door running... waiting 5 seconds to collect output');
    await new Promise(resolve => setTimeout(resolve, 5000));

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

// Run the test
testDoor().catch(error => {
  console.error('[Test] Fatal error:', error);
  process.exit(1);
});
