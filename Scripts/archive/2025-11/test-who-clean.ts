#!/usr/bin/env node

/**
 * Simple test for WHO door with clean main loop
 * Tests for double output bug
 */

import { AmigaDoorSession } from './web/backend/src/amiga-emulation/AmigaDoorSession.js';
import { EventEmitter } from 'events';

console.log('Testing WHO door with clean main loop...\n');

// Create mock socket
const mockSocket = new EventEmitter();
mockSocket.emit = function(event, data) {
  if (event === 'door:output' && data?.text) {
    console.log(`[OUTPUT] ${data.text.replace(/\n/g, '\\n')}`);
  }
  return true;
};

// Create session
const session = new AmigaDoorSession({
  socket: mockSocket,
  doorPath: '~/Code/amiexpress-web/Doors/RTW',
  bbsSession: {
    nodeId: 0,
    userId: 1,
    username: 'testuser'
  }
});

// Main async function
(async () => {
  // Run for 15 seconds max
  setTimeout(() => {
    console.log('\n=== TEST TIMEOUT ===');
    process.exit(0);
  }, 15000);

  // Start the door
  console.log('Starting door...\n');
  await session.start();
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
