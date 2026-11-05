#!/usr/bin/env npx tsx
/**
 * Run mtop door via the emulator
 */

import * as path from 'path';
import * as fs from 'fs';
// Must run from web/backend directory
import { DoorLoader } from './src/Doors/DoorLoader';
import { boardRoot } from '../../web/backend/src/utils/board-root.util';

const BBS_ROOT = boardRoot();
process.env.BBS_ROOT = BBS_ROOT;
process.env.BBS_DATA_DIR = BBS_ROOT;

interface SessionLike {
  nodeId: number;
  userId: number;
  username: string;
  accessLevel: number;
  currentConference: number;
  emit: (event: string, data: any) => void;
  on: (event: string, handler: any) => void;
  once: (event: string, handler: any) => void;
  off: (event: string, handler: any) => void;
  removeListener: (event: string, handler: any) => void;
  getEnv: (key: string) => string;
}

async function runMtop() {
  console.log('=== Running MTOP Door ===\n');

  const session: SessionLike = {
    nodeId: 3,
    userId: 1,
    username: 'spot',
    accessLevel: 255,
    currentConference: 1,
    emit: (event: string, data: any) => {
      if (event === 'door-output' || event === 'door-ansi') {
        // Suppress output
      } else if (event !== 'door-complete') {
        console.log('[emit]', event);
      }
    },
    on: () => {},
    once: () => {},
    off: () => {},
    removeListener: () => {},
    getEnv: (key: string) => {
      const env: Record<string, string> = {
        'BBS_ROOT': BBS_ROOT,
        'NODE': '3',
        'USER': 'spot',
        'ACCESS': '255',
        'CONFERENCE': '1'
      };
      return env[key] || '';
    }
  };

  const doorLoader = new DoorLoader();

  // Args for mtop
  const args = [
    `${BBS_ROOT}/Doors/multitop/designs/MTopULBytes1.dsg`,
    `${BBS_ROOT}/Bulletins/bull5.txt`,
    `userdata=${BBS_ROOT}/user.data`,
    `userkeys=${BBS_ROOT}/user.keys`,
    `usermisc=${BBS_ROOT}/user.misc`
  ].join(' ');

  console.log('Door path:', `${BBS_ROOT}/Doors/multitop/mtop`);
  console.log('Args:', args);
  console.log('');

  try {
    const result = await doorLoader.executeDoor(
      `${BBS_ROOT}/Doors/multitop/mtop`,
      args,
      session as any,
      'SIM'
    );
    console.log('\n=== Door completed ===');
    console.log('Result:', result);
  } catch (err) {
    console.error('Door error:', err);
  }

  // Check output
  if (fs.existsSync(`${BBS_ROOT}/Bulletins/bull5.txt`)) {
    const output = fs.readFileSync(`${BBS_ROOT}/Bulletins/bull5.txt`, 'utf8');
    console.log('\n=== bull5.txt output ===');
    // Strip ANSI codes for easier reading
    const stripped = output.replace(/\x1b\[[0-9;]*m/g, '');
    console.log(stripped);
  } else {
    console.log('bull5.txt not found');
  }
}

runMtop().catch(console.error);
