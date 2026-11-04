import 'reflect-metadata';
import { AmigaDoorSession } from './src/amiga-emulation/AmigaDoorSession';

const BBS_ROOT = '~/Code/AmiExpress/amiexpress-web';

async function test() {
  console.log('=== AquaScan Test with ExecBase fix ===');

  // Mock socket
  const mockSocket = {
    emit: (...args: any[]) => console.log('[Socket emit]', args[0]),
    on: () => {},
    id: 'test-socket',
  };

  // DoorConfig for AquaScan
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
      userSlotNumber: 1,  // User's slot in user.data file
    },
    assigns: {
      'BBS:': BBS_ROOT,
      'NODE1:': BBS_ROOT + '/Node0',
    },
  };

  const session = new AmigaDoorSession(mockSocket as any, config);

  console.log('Starting door...');

  const result = await Promise.race([
    session.start(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout after 15s')), 15000))
  ]);

  console.log('Result:', result);
}

test().catch(e => console.error('Error:', e));
