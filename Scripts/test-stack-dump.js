const { AmigaDoorSession } = require('./web/backend/src/amiga-emulation/AmigaDoorSession');

async function testStackDump() {
  console.log('Testing GetAnswer door to see stack dump...\n');

  const session = new AmigaDoorSession({
    nodeId: 0,
    user: { id: 1, username: 'sysop', secLevel: 255 },
    doorPath: '~/Code/amiexpress-web/Doors/GetAnswer/GetAnswer',
    doorName: 'GetAnswer',
    maxIterations: 10000
  });

  console.log('Starting door execution...\n');

  try {
    await session.start();
    console.log('\n✅ Door completed!');
  } catch (error) {
    console.error('\n❌ Door error:', error.message);
  }
}

testStackDump().catch(console.error);
