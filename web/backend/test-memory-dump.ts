import 'reflect-metadata';
import { AmigaDoorSession } from './src/amiga-emulation/AmigaDoorSession';

const BBS_ROOT = '~/Code/amiexpress-web';

async function test() {
  console.log('=== Memory Dump Test ===');

  const mockSocket = {
    emit: (...args: any[]) => {}, // Suppress output
    on: () => {},
    id: 'test-socket',
  };

  const config = {
    executablePath: BBS_ROOT + '/doors/AquaScan/AquaScan.020',
    doorType: 'XIM',
    timeout: 20,
    doorId: 'AQUASCAN',
    args: ['1', 'S', 'U'],
    bbsSession: {
      nodeId: 1,
      nodeNumber: 1,
      userId: 1,
      username: 'spot',
      currentConf: 1,
      bbsRoot: BBS_ROOT,
      inDoorManager: true,
      userSlotNumber: 1,
    },
    assigns: {
      'BBS:': BBS_ROOT,
      'NODE1:': BBS_ROOT + '/Node0',
    },
  };

  const session = new AmigaDoorSession(mockSocket as any, config);

  // Hook into the session to dump memory after loading
  const originalStart = session.start.bind(session);
  session.start = async function() {
    console.log('Starting session...');

    // Dump memory after 3 seconds when door has loaded and run for a bit
    setTimeout(() => {
      try {
        const emulator = (session as any).emulator;
        if (emulator) {
          console.log('\n=== Memory Dump at 0x2ae2 (where GetMsg returns) ===');
          for (let i = 0; i < 32; i += 2) {
            const addr = 0x2ae2 + i;
            const byte0 = emulator.readMemory(addr);
            const byte1 = emulator.readMemory(addr + 1);
            const word = (byte0 << 8) | byte1;
            console.log(`  0x${addr.toString(16)}: 0x${word.toString(16).padStart(4, '0')}`);
          }

          console.log('\n=== Memory at door entry 0x1000-0x1020 ===');
          for (let i = 0; i < 32; i += 2) {
            const addr = 0x1000 + i;
            const byte0 = emulator.readMemory(addr);
            const byte1 = emulator.readMemory(addr + 1);
            const word = (byte0 << 8) | byte1;
            console.log(`  0x${addr.toString(16)}: 0x${word.toString(16).padStart(4, '0')}`);
          }

          // Check the file to compare
          console.log('\n=== Expected from file at entry (after 0x24 header) ===');
          console.log('  First instruction should be: 0x6100 (bsr)');
        }
      } catch (e) {
        console.log('Error dumping memory:', e);
      }
    }, 3000);

    return originalStart();
  };

  try {
    const result = await Promise.race([
      session.start(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout after 10s')), 10000))
    ]);
    console.log('Result:', result);
  } catch (e) {
    console.log('Timeout or error (expected):', (e as Error).message);
  }
}

test();
