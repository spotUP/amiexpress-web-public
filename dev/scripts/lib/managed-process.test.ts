/**
 * The port guard, tested against real processes.
 *
 * Run: npx tsx dev/scripts/lib/managed-process.test.ts
 * (Not in any CI glob - dev scripts have no suite - but it is the
 * regression proof for the 2026-08-31 dev-server outages: a survivor
 * holding 3001 while a fresh backend EADDRINUSE-crashed. The guard must
 * kill whatever LISTENS on the port and refuse nothing that is free.)
 */

/* eslint-disable no-console */

import { spawn } from 'child_process';
import { pidsOnPort, ensurePortFree } from './managed-process';

const PORT = 39871; // scratch port, nothing real listens here

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function listenOnPort(port: number) {
  // A real, separate process holding the port - the shape of the survivor.
  return spawn(process.execPath, ['-e', `
    require('net').createServer(() => {}).listen(${port}, () => {
      console.log('listening');
    });
    setInterval(() => {}, 1000);
  `], { stdio: ['ignore', 'pipe', 'ignore'] });
}

async function waitForListen(port: number, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pidsOnPort(port).length > 0) return true;
    await sleep(50);
  }
  return false;
}

(async () => {
  let failed = 0;
  const ok = (name: string) => console.log(`  [OK] ${name}`);
  const fail = (name: string, why: string) => {
    failed++;
    console.log(`  [FAIL] ${name}\n         ${why}`);
  };

  // A free port is reported free, instantly, killing nothing.
  if (await ensurePortFree(PORT, { graceMs: 200, killMs: 200 })) {
    ok('a free port is free');
  } else {
    fail('a free port is free', 'ensurePortFree returned false on a free port');
  }

  // A held port is freed, and the holder is really gone.
  const holder = listenOnPort(PORT);
  if (!(await waitForListen(PORT, 3000))) {
    fail('setup', 'test server never came up');
  } else {
    const freed = await ensurePortFree(PORT, { graceMs: 1500, killMs: 1500 });
    const survivors = pidsOnPort(PORT);
    if (freed && survivors.length === 0) {
      ok('a held port is freed and the holder is gone');
    } else {
      fail('a held port is freed and the holder is gone',
        `freed=${freed} survivors=${survivors.join(',')}`);
    }
    // isAlive() is TRUE for a zombie: a killed child of this very process
    // answers kill(pid, 0) until it is reaped. The exit event is the
    // honest signal that the holder terminated.
    const exited = await new Promise<boolean>(resolve => {
      if (holder.exitCode !== null || holder.signalCode !== null) return resolve(true);
      const timer = setTimeout(() => resolve(false), 2000);
      holder.once('exit', () => { clearTimeout(timer); resolve(true); });
    });
    if (exited) {
      ok('the holding process itself was terminated');
    } else {
      fail('the holding process itself was terminated',
        `pid ${holder.pid} never exited`);
      holder.kill('SIGKILL');
    }
  }

  console.log(failed === 0 ? '\nall green' : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
})();
