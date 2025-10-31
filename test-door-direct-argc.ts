#!/usr/bin/env tsx

/**
 * Direct test of GetAnswer door with argc/argv restore fix
 *
 * Tests if restoring D0 (argc) and A0 (argv) after delay loop bypass
 * allows the door to progress past initialization and send messages.
 */

import { AmigaDoorSession } from './web/backend/src/amiga-emulation/AmigaDoorSession';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== GetAnswer Door Test with argc/argv Restore ===\n');

async function testDoor() {
  try {
    // Create mock socket
    const mockSocket: any = {
      emit: (event: string, data: any) => {
        if (event === 'ansi-output') {
          console.log(`[DOOR OUTPUT] ${data.replace(/\r\n/g, '\n')}`);
        }
      }
    };

    // Create mock config
    const mockConfig = {
      bbsSession: {
        nodeId: 0,
        user: {
          username: 'Sysop',
          location: 'Test Location',
          secLevel: 255
        }
      }
    };

    // Create door session
    console.log('Creating door session...');
    const doorPath = path.join(__dirname, 'Doors/GetAnswer/GetAnswer');
    const session = new AmigaDoorSession(mockSocket, mockConfig, doorPath);

    // Start door execution
    console.log('Starting door execution...');
    console.log('Watch for:');
    console.log('  1. "Restored D0 (argc): 2" - argc/argv restored after delay loop');
    console.log('  2. "DOOR MESSAGE RECEIVED" - Door sent message to BBS');
    console.log('  3. "Processing command" - Command handler activated\n');

    await session.start();

    console.log('\n=== Test Complete ===');
    console.log('Check the output above for:');
    console.log('  - Did we see "Restored D0 (argc): 2"?');
    console.log('  - Did door progress past PC=0x96ac4?');
    console.log('  - Did door send any messages to AEDoorPort0?');

    process.exit(0);
  } catch (error) {
    console.error('Test error:', error);
    process.exit(1);
  }
}

testDoor();
