import 'reflect-metadata';
import * as path from 'path';
import { AmigaDoorSession } from './src/amiga-emulation/AmigaDoorSession';

const BBS_ROOT = '~/Code/amiexpress-web';

// Get door name from command line args
const doorName = process.argv[2] || 'AEHELP';
const doorPaths: Record<string, string> = {
  'AEHELP': 'Doors/AEHELP/aehelp',
  'AMIGA68K': 'Doors/SDKTEST/AMIGA68K',
  'CDEMO': 'Doors/INTERACTIVE-DEMO/interactive-demo',
  'DEL': 'Doors/-mgs!-MgzListMan/MGZLISTMAN',
  'HELLOOUT': 'Doors/HELLOVBCC/hello-output',
  'MRC': 'Doors/mrc/mrc_door',
  'MRCSTAT1': 'Doors/mrc/mrcstat1',
  'mrcstat2': 'Doors/mrc/mrcstat2',
  'XIMVBCC': 'Doors/XIMVBCC/xim-vbcc',
};

const doorPath = path.join(BBS_ROOT, doorPaths[doorName] || doorPaths['AEHELP']);

async function main() {
  console.log(`Testing door: ${doorName}`);
  console.log(`Path: ${doorPath}`);

  const mockSocket = {
    emit: (event: string, data: any) => {
      if (event === 'ansi-output') {
        // Data is usually a string directly for ansi-output
        const text = typeof data === 'string' ? data : data?.text || '';
        if (text) {
          // Show first 100 chars, replacing ESC with visible marker
          const display = text.substring(0, 100).replace(/\x1b/g, 'ESC');
          console.log(`[OUTPUT] ${display}`);
        }
      }
    },
    on: () => {}, once: () => {}, off: () => {},
    id: 'test', handshake: { auth: {} }, data: {},
  };

  const doorConfig = {
    executablePath: doorPath,
    doorType: 'XIM' as const,
    args: [] as string[],
    timeout: 8,
    bbsSession: {
      nodeId: 1, userId: 1, username: 'spot',
      currentConf: 1, currentConference: 1, conferenceId: 1,
      bbsRoot: BBS_ROOT, inDoorManager: true,
    },
    assigns: { 'BBS': BBS_ROOT, 'DOORS': path.join(BBS_ROOT, 'Doors') },
  };

  try {
    const session = new AmigaDoorSession(mockSocket as any, doorConfig);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 8000));
    await Promise.race([session.start(), timeout]);
    console.log('Door completed successfully');
  } catch (err: any) {
    console.error('Result:', err.message);
  }
}
main().catch(console.error);
