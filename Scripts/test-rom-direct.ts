// Direct test of ROM boot using AmigaDoorSession
const path = require('path');

// Mock socket for testing
const mockSocket = {
  emit: (event, data) => {
    console.log(`[Socket] ${event}:`, JSON.stringify(data));
  },
  on: (event, handler) => {
    // No-op for testing
  }
};

async function test() {
  try {
    console.log('📋 Direct ROM Boot Test');
    console.log('=======================\n');

    // Dynamically import AmigaDoorSession
    const { AmigaDoorSession } = await import('./web/backend/src/amiga-emulation/AmigaDoorSession.js');

    const config = {
      executablePath: path.join(__dirname, 'doors/GetAnswer/GetAnswer'),
      timeout: 30
    };

    console.log('[START] Creating door session...');
    const session = new AmigaDoorSession(mockSocket, config);

    console.log('🎬 Starting ROM boot...\n');
    await session.start();

    console.log('\n[OK] ROM boot test completed!');
  } catch (error) {
    console.error('\n[ERROR] ROM boot test failed:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
