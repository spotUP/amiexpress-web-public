#!/usr/bin/env node

/**
 * Simple helper to execute a 68K door outside the BBS.
 * Uses the compiled backend (dist) so remember to rebuild after source changes.
 */

const path = require('path');
const { EventEmitter } = require('events');
const { AmigaDoorSession } = require('../web/backend/dist/amiga-emulation/AmigaDoorSession.js');

class MockSocket extends EventEmitter {
  emit(event, data) {
    if (event === 'ansi-output') {
      process.stdout.write(data || '');
    } else {
      console.log(`[SOCKET:${event}]`, data);
    }
    return super.emit(event, data);
  }
}

async function main() {
  const doorArg = process.argv[2];
  if (!doorArg) {
    console.error('Usage: node Scripts/run-amiga-door.js <door-path> [door-type]');
    process.exit(1);
  }

  const resolvedDoorPath = path.isAbsolute(doorArg)
    ? doorArg
    : path.join(process.cwd(), doorArg);

  const doorType = process.argv[3] || 'XIM';

  const socket = new MockSocket();

  const amigaSession = new AmigaDoorSession(socket, {
    executablePath: resolvedDoorPath,
    doorType,
    timeout: 300,
    bbsSession: {
      user: {
        id: '1',
        username: 'Sysop',
        location: 'Local Console',
        secLevel: 255
      },
      nodeId: 1,
      nodeNumber: 1,
      bbsName: 'AmiExpress-Web',
      sysopName: 'Sysop',
      timeRemaining: 60
    }
  });

  await amigaSession.start();
}

main().catch(error => {
  console.error('[run-amiga-door] Door execution failed:', error);
  process.exit(1);
});
