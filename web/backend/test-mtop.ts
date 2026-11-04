#!/usr/bin/env npx tsx
import * as fs from 'fs';
import { DoorLoader } from './src/doors/DoorLoader';

const BBS_ROOT = '~/Code/AmiExpress/amiexpress-web';
process.env.BBS_ROOT = BBS_ROOT;
process.env.BBS_DATA_DIR = BBS_ROOT;

async function runMtop() {
  console.log('=== Running MTOP Door ===\n');

  const session: any = {
    nodeId: 3,
    userId: 1,
    username: 'spot',
    accessLevel: 255,
    currentConference: 1,
    emit: (event: string, data: any) => {
      if (event !== 'door-output' && event !== 'door-ansi' && event !== 'door-complete') {
        console.log('[emit]', event);
      }
    },
    on: () => {},
    once: () => {},
    off: () => {},
    removeListener: () => {},
    getEnv: (key: string) => ({ 'BBS_ROOT': BBS_ROOT, 'NODE': '3', 'USER': 'spot', 'ACCESS': '255', 'CONFERENCE': '1' }[key] || '')
  };

  const doorLoader = new DoorLoader();
  const args = [
    `${BBS_ROOT}/Doors/multitop/designs/MTopULBytes1.dsg`,
    `${BBS_ROOT}/Bulletins/bull5.txt`,
    `userdata=${BBS_ROOT}/user.data`,
    `userkeys=${BBS_ROOT}/user.keys`,
    `usermisc=${BBS_ROOT}/user.misc`
  ].join(' ');

  console.log('Door:', `${BBS_ROOT}/Doors/multitop/mtop`);
  console.log('Args:', args, '\n');

  try {
    const result = await doorLoader.executeDoor(`${BBS_ROOT}/Doors/multitop/mtop`, args, session, 'SIM');
    console.log('\n=== Door completed ===');
    console.log('Result:', result);
  } catch (err) {
    console.error('Door error:', err);
  }

  if (fs.existsSync(`${BBS_ROOT}/Bulletins/bull5.txt`)) {
    const output = fs.readFileSync(`${BBS_ROOT}/Bulletins/bull5.txt`, 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
    console.log('\n=== bull5.txt output ===');
    console.log(output);
  }
}

runMtop().catch(console.error);
