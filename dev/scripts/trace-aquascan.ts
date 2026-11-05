/**
 * Trace AquaScan execution with CPU instruction logging
 */
import 'reflect-metadata';
import { AmigaDoorSession } from '../../web/backend/src/amiga-emulation/AmigaDoorSession';
import { boardRoot } from '../../web/backend/src/utils/board-root.util';

const BBS_ROOT = boardRoot();

async function runTrace() {
  console.log('=== AquaScan CPU Trace ===');
  
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

  const doorPath = `${BBS_ROOT}/Doors/AquaScan/AquaScan.020`;
  const session = new AmigaDoorSession(doorPath, mockSession as any, {
    enableTrace: true,
    traceInterval: 1,
    traceFirstPcCount: 1000,
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

runTrace().catch(console.error);
