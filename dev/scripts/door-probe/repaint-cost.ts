/**
 * repaint-cost - what one keypress costs a 68K door.
 *
 * "Doors draw smart" (RULES.md): every 198 bytes a door writes is one XIM
 * message, and each message is ~45 ms of emulation. This drives a Hunk
 * binary through the same AmigaDoorSession the board uses, sends a scripted
 * key sequence, and reports per key how many bytes the door emitted and how
 * long the output took to settle. More than a few hundred bytes for a cursor
 * move means the door repaints the screen; it should repaint the row.
 *
 * Usage (from the repo root; the backend tsconfig is what enables the
 * emulator's decorators):
 *   npx tsx --tsconfig web/backend/tsconfig.json dev/scripts/door-probe/repaint-cost.ts <binary> [--cols 80|40]
 *       [--keys down,down,up] [--window 1500] [--json]
 *
 * Keys: up down left right enter esc space, or any literal character.
 * The probe sends q after the last key; the SDK doors exit on it.
 *
 * The sdk/c Makefile's `make probe` runs this against the proof door.
 */
process.env.SKIP_DB_INIT = '1';

import * as path from 'path';
import { EventEmitter } from 'events';

// The emulator's decorators need this loaded first; it lives with the backend.
const BACKEND = path.resolve(__dirname, '../../../web/backend');
require(path.join(BACKEND, 'node_modules/reflect-metadata'));

interface KeyCost { key: string; gross: number; net: number; firstByteMs: number; messages: number }

const KEY_BYTES: Record<string, string> = {
  up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D',
  enter: '\r', esc: '\x1b', space: ' ',
};

function parseArgs(argv: string[]) {
  const opts = { binary: '', cols: 80, keys: ['down', 'down', 'down', 'up'], window: 1500, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--cols') opts.cols = parseInt(argv[++i], 10) || 80;
    else if (a === '--keys') opts.keys = argv[++i].split(',').map((k) => k.trim()).filter(Boolean);
    else if (a === '--window') opts.window = parseInt(argv[++i], 10) || 1500;
    else if (a === '--json') opts.json = true;
    else if (!opts.binary) opts.binary = a;
  }
  if (!opts.binary) {
    console.error('Usage: npx tsx --tsconfig web/backend/tsconfig.json dev/scripts/door-probe/repaint-cost.ts <binary> [--cols 80|40] [--keys k,k,...] [--window ms] [--json]');
    process.exit(2);
  }
  opts.binary = path.resolve(opts.binary);
  return opts;
}

class CaptureSocket extends EventEmitter {
  bytes = 0;
  lastAt = 0;
  firstAt = 0;
  emit(event: string, data?: unknown): boolean {
    if (event === 'ansi-output') {
      const s = typeof data === 'string' ? data : String(data ?? '');
      this.bytes += Buffer.byteLength(s, 'latin1');
      this.lastAt = Date.now();
      if (!this.firstAt) this.firstAt = this.lastAt;
    }
    return super.emit(event, data);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* A door that animates (the SDK's rails tick while idle) never goes quiet,
 * so nothing here waits for silence. Everything is a fixed window: the
 * bytes in `window` ms after an event, and the idle rate over the same
 * window with no key, which is subtracted to give what the KEY cost. */
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const petscii = opts.cols === 40;
  const { AmigaDoorSession } = require(path.join(BACKEND, 'src/amiga-emulation/AmigaDoorSession'));
  const sock = new CaptureSocket();
  const session = new AmigaDoorSession(sock as any, {
    executablePath: opts.binary,
    doorType: 'XIM',
    timeout: 60,
    args: ['1'],
    assigns: {},
    toolTypes: {},
    bbsSession: {
      user: { id: '1', username: 'Sysop', location: 'Local Console', secLevel: 255 },
      nodeId: 1, nodeNumber: 1, bbsName: 'AmiExpress-Web', sysopName: 'Sysop',
      timeRemaining: 60, doorCommand: 'PROBE', doorId: 'PROBE',
      petsciiMode: petscii,
      terminalType: petscii ? 'c64' : 'modern',
      screenWidth: opts.cols,
      screenHeight: 25,
      tempData: {},
    },
  });

  let running = true;
  const run = session.start().catch((e: Error) => { console.error('[ERROR] door:', e.message); }).finally(() => { running = false; });

  const boot = Date.now();
  while (!sock.firstAt && running && Date.now() - boot < 20000) await sleep(20);
  if (!sock.firstAt) { console.error('[ERROR] the door wrote nothing in 20 s'); process.exit(1); }
  const bootMs = sock.firstAt - boot;
  await sleep(opts.window);
  const firstFrame = sock.bytes;

  const idleStart = sock.bytes;
  await sleep(opts.window);
  const idleBytes = sock.bytes - idleStart;

  const costs: KeyCost[] = [];
  for (const key of opts.keys) {
    if (!running) break;
    const before = sock.bytes;
    const sent = Date.now();
    let firstByteMs = -1;
    sock.emit('door:input', KEY_BYTES[key] ?? key);
    while (Date.now() - sent < opts.window) {
      if (firstByteMs < 0 && sock.bytes > before) firstByteMs = Date.now() - sent;
      await sleep(10);
    }
    const gross = sock.bytes - before;
    const net = Math.max(0, gross - idleBytes);
    costs.push({ key, gross, net, firstByteMs, messages: Math.ceil(net / 198) });
  }
  if (running) { sock.emit('door:input', 'q'); await Promise.race([run, sleep(3000)]); }
  if (running) { console.error('[WARN] the door did not exit on q'); }

  if (opts.json) {
    console.log(JSON.stringify({ binary: opts.binary, cols: opts.cols, window: opts.window, bootMs, firstFrame, idleBytes, costs }, null, 2));
  } else {
    console.log(`${path.basename(opts.binary)} at ${opts.cols} columns, ${opts.window} ms windows`);
    console.log(`boot to first byte  ${bootMs} ms`);
    console.log(`first frame         ${firstFrame} bytes (${Math.ceil(firstFrame / 198)} xim msgs)`);
    console.log(`idle (animation)    ${idleBytes} bytes per window`);
    console.log('key         gross    net   xim msgs   first byte ms');
    for (const c of costs) {
      console.log(`${c.key.padEnd(10)} ${String(c.gross).padStart(6)} ${String(c.net).padStart(6)}   ${String(c.messages).padStart(8)}   ${String(c.firstByteMs).padStart(13)}`);
    }
    const worst = costs.reduce((m, c) => Math.max(m, c.net), 0);
    console.log(worst > 600 ? `[WARN] a keypress cost ${worst} bytes net of animation - that is a screen, not a row` : `[OK] no keypress cost more than ${worst} bytes net of animation`);
  }
  process.exit(running ? 1 : 0);
}

main();
