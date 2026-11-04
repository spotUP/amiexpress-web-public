import 'reflect-metadata';
import { AmigaDoorSession } from './src/amiga-emulation/AmigaDoorSession';

const BBS_ROOT = '~/Code/AmiExpress/amiexpress-web';

async function test() {
  console.log('=== Memory Corruption Test ===');

  let capturedEmulator: any = null;
  let checkCount = 0;

  const mockSocket = {
    emit: (...args: any[]) => {
      // Check memory when we see ENVSTAT reply
      if (args[0] === 'door-output' || checkCount > 0) return;
    },
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

  // Periodically check memory
  const checkInterval = setInterval(() => {
    try {
      const emulator = (session as any).emulator;
      if (emulator && checkCount < 5) {
        const pc = emulator.getRegister(16);

        // Check memory at 0x2f6e (corruption point)
        const word2f6e = (emulator.readMemory(0x2f6e) << 8) | emulator.readMemory(0x2f6f);

        // Check if we're near the corruption point
        if (pc >= 0x2f60 && pc <= 0x2f80) {
          console.log(`\n=== NEAR CORRUPTION POINT ===`);
          console.log(`PC: 0x${pc.toString(16)}`);
          console.log(`Memory at 0x2f6e: 0x${word2f6e.toString(16).padStart(4, '0')} (should be 0x49c0)`);

          // Dump surrounding memory
          console.log('Memory dump 0x2f60-0x2f80:');
          for (let addr = 0x2f60; addr < 0x2f80; addr += 2) {
            const w = (emulator.readMemory(addr) << 8) | emulator.readMemory(addr + 1);
            console.log(`  0x${addr.toString(16)}: 0x${w.toString(16).padStart(4, '0')}`);
          }
          checkCount++;
        }

        // Check if PC became garbage
        if (pc > 0x100000 && pc < 0x2000000) {
          console.log(`\n=== PC CORRUPTED! ===`);
          console.log(`PC: 0x${pc.toString(16)}`);
          console.log(`Memory at 0x2f6e: 0x${word2f6e.toString(16).padStart(4, '0')}`);

          // What's at 0x180080?
          const word180080 = (emulator.readMemory(0x180080) << 8) | emulator.readMemory(0x180081);
          console.log(`Memory at 0x180080: 0x${word180080.toString(16).padStart(4, '0')}`);

          checkCount = 100; // Stop checking
        }
      }
    } catch (e) {
      // Ignore
    }
  }, 100);

  try {
    const result = await Promise.race([
      session.start(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 8000))
    ]);
    console.log('Result:', result);
  } catch (e) {
    console.log('Timeout/error (expected)');
  }

  clearInterval(checkInterval);
}

test();
