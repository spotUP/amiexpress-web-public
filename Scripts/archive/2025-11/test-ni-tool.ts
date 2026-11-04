#!/usr/bin/env node

/**
 * Run the NI (NodeIn) tool to create WHO door tracking data
 */

import { AmigaDoorSession } from './web/backend/src/amiga-emulation/AmigaDoorSession.js';
import { EventEmitter } from 'events';

console.log('Running NI tool to create WHO tracking data...\n');

// Create mock socket
const mockSocket = new EventEmitter();
mockSocket.emit = function(event, data) {
  if (event === 'door:output' && data?.text) {
    console.log(`[OUTPUT] ${data.text.replace(/\n/g, '\\n')}`);
  }
  return true;
};

// Create session for NI tool with node number as argument
const session = new AmigaDoorSession(mockSocket, {
  executablePath: '~/Code/AmiExpress/amiexpress-web/Doors/who/NI',
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

// Start the NI tool
(async () => {
  console.log('Starting NI tool...\n');
  await session.start();
  console.log('\nNI tool finished!');
  console.log('\nChecking for created files...');

  // Check what files were created
  const fs = await import('fs');
  const files = [
    'Doors/who/who.dat',
    'Doors/who/NI.dat',
    'S/who.dat',
    'Node0/who.dat'
  ];

  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      console.log(`✓ ${file} (${stat.size} bytes)`);
      const content = fs.readFileSync(file, 'utf8');
      console.log(`  Content: ${content.substring(0, 100)}`);
    } catch(e) {
      // File doesn't exist
    }
  }

  process.exit(0);
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
