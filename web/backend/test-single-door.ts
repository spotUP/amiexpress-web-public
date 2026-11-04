import 'reflect-metadata';
import * as path from 'path';
import { AmigaDoorSession } from './src/amiga-emulation/AmigaDoorSession';

const BBS_ROOT = '~/Code/AmiExpress/amiexpress-web';
const doorPath = '~/Code/AmiExpress/amiexpress-web/Doors/EmP_Tools/Bulls';

async function main() {
  console.log('Door path:', doorPath);

  const mockSocket = {
    emit: () => {},
    on: () => {},
    once: () => {},
    off: () => {},
    id: 'test',
    handshake: { auth: {} },
    data: {},
  };

  const doorConfig = {
    executablePath: doorPath,
    doorType: 'XIM',
    args: [] as string[],
    timeout: 10,
    bbsSession: {
      nodeId: 1,
      userId: 1,
      username: 'spot',
      currentConf: 1,
      currentConference: 1,  // Also set this for BB_CONFNUM
      conferenceId: 1,       // And this for fallback
      bbsRoot: BBS_ROOT,
      inDoorManager: true,
    },
    assigns: {
      'BBS': BBS_ROOT,
      'DOORS': path.join(BBS_ROOT, 'Doors'),
    },
  };

  console.log('Creating session...');
  try {
    const session = new AmigaDoorSession(mockSocket as any, doorConfig);
    console.log('Session created, starting...');

    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 10000));
    await Promise.race([session.start(), timeout]);
    console.log('Door completed');
  } catch (err) {
    console.error('Error:', err);
  }
}

main().catch(console.error);
