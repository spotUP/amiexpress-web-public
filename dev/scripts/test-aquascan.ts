/**
 * Test AquaScan door execution
 */
import 'reflect-metadata';
import { AmigaDoorSession } from '../../web/backend/src/amiga-emulation/AmigaDoorSession';

const BBS_ROOT = '~/Code/AmiExpress/amiexpress-web';

async function runTest() {
  console.log('=== AquaScan Door Test ===');

  // Create mock session data
  const mockSession = {
    nodeId: 1,
    userId: 1,
    username: 'spot',
    currentConf: 1,
    bbsRoot: BBS_ROOT,
    socket: { emit: () => {}, on: () => {}, id: 'test' },
    inDoorManager: true,
  };

  const doorPath = `${BBS_ROOT}/doors/AquaScan/AquaScan.020`;
  const session = new AmigaDoorSession(doorPath, mockSession as any, {
    enableTrace: true,
    traceInterval: 1,
    traceFirstPcCount: 200,
    traceRegs: true,
  });

  try {
    await session.initialize();
    console.log('Session initialized, running door with args: "1 S U"');

    const result = await Promise.race([
      session.run('1 S U\n'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 15s')), 15000))
    ]);

    console.log('Door completed:', result);
  } catch (err) {
    console.error('Error:', err);
  }
}

runTest().catch(console.error);
