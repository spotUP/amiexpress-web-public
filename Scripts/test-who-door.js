#!/usr/bin/env node

/**
 * Test WHO door (RTW)
 */

const { AmigaDoorSession } = require('../web/backend/src/amiga-emulation/AmigaDoorSession.ts');

console.log('Testing WHO door (RTW)...\n');

const doorPath = '~/Code/amiexpress-web/Doors/RTW/rtw';

const mockSocket = {
  emit: (event, data) => {
    if (event === 'ansi-output') {
      process.stdout.write(data);
    }
  }
};

const mockSession = {
  user: {
    username: 'testuser',
    secLevel: 255
  },
  nodeId: 1
};

async function test() {
  try {
    const session = new AmigaDoorSession(mockSocket, {
      executablePath: doorPath,
      timeout: 30,
      memorySize: 1024 * 1024,
      sessionData: {
        user: mockSession.user,
        nodeNumber: mockSession.nodeId,
        bbsName: 'Test BBS',
        sysopName: 'Sysop',
        timeRemaining: 60
      }
    });

    await session.start();
    console.log('\n\nWHO door completed successfully!');
  } catch (error) {
    console.error('\n\nError:', error.message);
    process.exit(1);
  }
}

test();
