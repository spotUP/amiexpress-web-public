#!/usr/bin/env node

/**
 * Run the Count tool to create WHO door tracking data
 */

import { AmigaDoorSession } from './web/backend/src/amiga-emulation/AmigaDoorSession.js';
import { EventEmitter } from 'events';

console.log('Running Count tool to create WHO tracking data...\n');

// Create mock socket
const mockSocket = new EventEmitter();
mockSocket.emit = function(event, data) {
  if (event === 'door:output' && data?.text) {
    console.log(`[OUTPUT] ${data.text.replace(/\n/g, '\\n')}`);
  }
  return true;
};

// Create session for Count tool
const session = new AmigaDoorSession(mockSocket, {
  executablePath: '~/Code/amiexpress-web/Doors/who/Count',
  bbsSession: {
    nodeId: 0,
    userId: 1,
    username: 'sysop'
  }
});

// Run for 10 seconds max
setTimeout(() => {
  console.log('\n=== TEST COMPLETE ===');
  process.exit(0);
}, 10000);

// Start the Count tool
(async () => {
  console.log('Starting Count tool...\n');
  await session.start();
  console.log('\nCount tool finished!');
  process.exit(0);
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
