/**
 * Test AquaScan XIM door to verify clean exit
 * This tests the fix for XIM doors deadlocking in Wait()
 */

import 'reflect-metadata';
import path from 'path';
import { Socket } from 'socket.io';
import { EventEmitter } from 'events';

// Mock socket for testing
class MockSocket extends EventEmitter {
  id = 'test-socket';
  emit(event: string, ...args: any[]): boolean {
    if (event === 'ansi-output') {
      const data = args[0];
      // Print ANSI output for debugging
      process.stdout.write(data);
    }
    return true;
  }
  on(event: string, listener: (...args: any[]) => void): this {
    super.on(event, listener);
    return this;
  }
}

async function testAquaScan() {
  const bbs_root = '~/Code/AmiExpress/amiexpress-web';
  process.env.BBS_DATA_DIR = bbs_root;

  console.log('[Test] Starting AquaScan XIM door test');
  console.log('[Test] This tests the fix for doors deadlocking in Wait()');
  console.log('[Test] Expected: Door should complete within 30 seconds, not timeout at 300s');
  console.log('');

  const doorPath = path.join(bbs_root, 'Doors/AquaScan/AquaScan.020');

  // Check if door exists
  const fs = await import('fs');
  if (!fs.existsSync(doorPath)) {
    console.error(`[Test] Door not found: ${doorPath}`);
    process.exit(1);
  }
  console.log(`[Test] Door path: ${doorPath}`);

  // Dynamic import to pick up the changes
  const { AmigaDoorSession } = await import(path.join(bbs_root, 'web/backend/src/amiga-emulation/AmigaDoorSession'));

  const socket = new MockSocket() as any as Socket;

  const session = new AmigaDoorSession(socket, {
    doorPath,
    doorType: 'XIM',
    nodeNumber: 1,
    bbsSession: {
      user: {
        id: 1,
        handle: 'SYSOP',
        access: 255,
      },
      nodeNumber: 1,
      pauseLines: 24,
    } as any,
    doorId: 'AquaScan',
    args: '1 S U', // Standard args for file scanning
    timeoutMs: 30000, // 30 second timeout (reduced from 300s)
    bbs_root,
  });

  const startTime = Date.now();

  console.log('[Test] Starting door execution...');

  try {
    await session.start();
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`\n[Test] SUCCESS! Door completed in ${elapsed.toFixed(2)} seconds`);
    console.log('[Test] The fix works - XIM polling during Wait() allows clean exit');
    process.exit(0);
  } catch (error: any) {
    const elapsed = (Date.now() - startTime) / 1000;
    console.error(`\n[Test] FAILED after ${elapsed.toFixed(2)} seconds:`, error.message);
    if (elapsed >= 29) {
      console.error('[Test] Door timed out - fix may not be working');
    }
    process.exit(1);
  }
}

testAquaScan().catch(err => {
  console.error('[Test] Fatal error:', err);
  process.exit(1);
});
