#!/usr/bin/env npx tsx
/**
 * Test AquaScan XIM door to verify clean exit after fix
 * This tests the fix for XIM doors deadlocking in Wait()
 */

import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import { DoorLoader } from './src/amiga-emulation/DoorLoader';

const BBS_ROOT = '~/Code/AmiExpress/amiexpress-web';
process.env.BBS_ROOT = BBS_ROOT;
process.env.BBS_DATA_DIR = BBS_ROOT;

interface SessionLike {
  nodeId: number;
  userId: number;
  username: string;
  accessLevel: number;
  currentConference: number;
  pauseLines: number;
  emit: (event: string, data: any) => void;
  on: (event: string, handler: any) => void;
  once: (event: string, handler: any) => void;
  off: (event: string, handler: any) => void;
  removeListener: (event: string, handler: any) => void;
  getEnv: (key: string) => string;
}

async function runAquaScan() {
  console.log('=== Testing AquaScan XIM Door ===');
  console.log('This tests the fix for XIM doors deadlocking in Wait()');
  console.log('Expected: Door should complete within 30s, not timeout at 300s');
  console.log('');

  const session: SessionLike = {
    nodeId: 1,
    userId: 1,
    username: 'spot',
    accessLevel: 255,
    currentConference: 1,
    pauseLines: 24,
    emit: (event: string, data: any) => {
      if (event === 'door-output' || event === 'door-ansi' || event === 'ansi-output') {
        // Print output for debugging
        process.stdout.write(data);
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
        'NODE': '1',
        'USER': 'spot',
        'ACCESS': '255',
        'CONFERENCE': '1'
      };
      return env[key] || '';
    }
  };

  const doorLoader = new DoorLoader();

  // AquaScan args: node# S/U (Scan/Upload mode)
  const args = '1 S U';

  const doorPath = `${BBS_ROOT}/doors/AquaScan/AquaScan.020`;
  console.log('Door path:', doorPath);
  console.log('Door type: XIM');
  console.log('Args:', args);
  console.log('');

  if (!fs.existsSync(doorPath)) {
    console.error('Door not found:', doorPath);
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    const result = await doorLoader.executeDoor(
      doorPath,
      args,
      session as any,
      'XIM',
      30000 // 30 second timeout
    );
    const elapsed = (Date.now() - startTime) / 1000;
    console.log('\n=== Door completed ===');
    console.log('Result:', result);
    console.log(`Elapsed: ${elapsed.toFixed(2)} seconds`);

    if (elapsed < 30) {
      console.log('\nSUCCESS: Door exited cleanly (did not timeout)');
      console.log('The fix works - XIM polling during Wait() allows clean exit');
    }
  } catch (err: any) {
    const elapsed = (Date.now() - startTime) / 1000;
    console.error('\nDoor error after', elapsed.toFixed(2), 'seconds:', err.message);
    if (elapsed >= 29) {
      console.error('FAILED: Door timed out - the fix may not be working');
    }
    process.exit(1);
  }
}

runAquaScan().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
