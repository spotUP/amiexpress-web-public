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
 *   npx tsx --tsconfig web/backend/tsconfig.json dev/scripts/door-probe/repaint-cost.ts <binary> [--cols 80|40|132]
 *       [--keys down,down,up] [--window 1500] [--json] [--leave esc|q] [--command MENU] [--board <dir>] [--idle-window ms] [--settle ms] [--theme ID]
 *
 * Keys: up down left right pgdn pgup enter esc space, or any literal character;
 * `mouse:<col>:<row>` is a mouse-move report over that cell (a hover).
 * The probe leaves with Esc after the last key (--leave q for the SDK proof doors
 * that bind q). Esc, not q: the menu doors list the board's own commands and the
 * real catalogue has a Q entry (Quiet Node), so q is a command there, not "leave".
 * --command is the board command word the door is registered under (MENU,
 * MENUSETTINGS); --board points the run at another board directory.
 *
 * The sdk/c Makefile's `make probe` runs this against the proof door.
 */
process.env.SKIP_DB_INIT = '1';

import * as path from 'path';
import { EventEmitter } from 'events';
import { claimHarnessPorts } from './harness-ports';

// Loading the backend below starts the whole board: keep it off the sysop's local ports (3001/2323/2222).
const PORTS = claimHarnessPorts();

// The emulator's decorators need this loaded first; it lives with the backend.
const BACKEND = path.resolve(__dirname, '../../../web/backend');
require(path.join(BACKEND, 'node_modules/reflect-metadata'));

interface KeyCost { key: string; gross: number; net: number; firstByteMs: number; messages: number }

const KEY_BYTES: Record<string, string> = {
  up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D',
  pgdn: '\x1b[6~', pgup: '\x1b[5~', enter: '\r', esc: '\x1b', space: ' ',
};

function parseArgs(argv: string[]) {
  const opts = { binary: '', cols: 80, keys: ['down', 'down', 'down', 'up'], window: 1500, settle: 400, idleWindow: 0, json: false, leave: 'esc', command: 'PROBE', board: '', theme: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--cols') opts.cols = parseInt(argv[++i], 10) || 80;
    else if (a === '--keys') opts.keys = argv[++i].split(',').map((k) => k.trim()).filter(Boolean);
    else if (a === '--window') opts.window = parseInt(argv[++i], 10) || 1500;
    else if (a === '--settle') opts.settle = parseInt(argv[++i], 10) || 400;
    else if (a === '--idle-window') opts.idleWindow = parseInt(argv[++i], 10) || 0;
    else if (a === '--json') opts.json = true;
    else if (a === '--leave') opts.leave = argv[++i];
    else if (a === '--command') opts.command = argv[++i];
    else if (a === '--theme') opts.theme = argv[++i];
    else if (a === '--board') opts.board = path.resolve(argv[++i]);
    else if (!opts.binary) opts.binary = a;
  }
  if (!opts.binary) {
    console.error('Usage: npx tsx --tsconfig web/backend/tsconfig.json dev/scripts/door-probe/repaint-cost.ts <binary> [--cols 80|40|132] [--keys k,k,...] [--window ms] [--json] [--leave esc|q] [--command WORD] [--board DIR] [--idle-window ms] [--settle ms] [--theme ID]');
    process.exit(2);
  }
  opts.binary = path.resolve(opts.binary);
  return opts;
}

/* A rail tick (the idle animation of the SDK doors) is "save cursor, the rail on row 1, restore cursor": its first
 * message opens with ESC 7 and the restore is a lone ESC 8. Chunks arrive one XIM message at a time (<= 198 bytes),
 * so only that opening marks a tick - never "row 1" alone, which a frame's first message also is. */
const isTick = (chunk: string) => chunk === '\x1b8' || chunk.startsWith('\x1b7');

class CaptureSocket extends EventEmitter {
  bytes = 0;
  /** What was ticks (idle animation) and what was everything else, in bytes and in messages. */
  tickBytes = 0;
  ticks = 0;
  msgs = 0;
  tickMsgs = 0;
  lastAt = 0;
  /** When the last byte that was NOT a rail tick arrived: "the door is quiet" ignores the animation. */
  lastWorkAt = 0;
  firstAt = 0;
  emit(event: string, data?: unknown): boolean {
    if (event === 'ansi-output') {
      const s = typeof data === 'string' ? data : String(data ?? '');
      const n = Buffer.byteLength(s, 'latin1');
      this.bytes += n;
      this.msgs += 1;
      this.lastAt = Date.now();
      if (isTick(s)) { this.tickBytes += n; this.tickMsgs += 1; if (s.startsWith('\x1b7')) this.ticks += 1; }
      else this.lastWorkAt = this.lastAt;
      if (!this.firstAt) this.firstAt = this.lastAt;
    }
    return super.emit(event, data);
  }
  get workBytes() { return this.bytes - this.tickBytes; }
  get workMsgs() { return this.msgs - this.tickMsgs; }
}

/** `mouse:<col>:<row>` is an SGR mouse-move report (button 35 = motion, no button) over that cell. */
function keyBytes(key: string): string {
  const m = /^mouse:(\d+):(\d+)$/.exec(key);
  return m ? `\x1b[<35;${m[1]};${m[2]}M` : KEY_BYTES[key] ?? key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* A door that animates (the SDK's rails tick while idle) never goes quiet, so "quiet" ignores the rail ticks
 * (isTick). A key costs the non-tick bytes from the key until the door has been quiet for --settle ms, at most
 * --window ms (a door under the emulator's Delay stall answers late, so wait on the ANSWER, not on the clock).
 * Whatever animation is not a rail tick is measured over an idle window with no key and subtracted. */
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.error(`[INFO] harness ports: ${Object.entries(PORTS).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  const petscii = opts.cols < 80;
  if (opts.board) {
    process.env.BBS_DATA_DIR = opts.board;
    require(path.join(BACKEND, 'src/config')).config.set('dataDir', opts.board);
  }
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
      user: { id: '1', username: 'Sysop', location: 'Local Console', secLevel: 255, securityFlags: 'T'.repeat(128), ...(opts.theme ? { themePreference: opts.theme } : {}) },
      nodeId: 1, nodeNumber: 1, bbsName: 'AmiExpress-Web', sysopName: 'Sysop',
      timeRemaining: 60, doorCommand: opts.command, doorId: opts.command,
      petsciiMode: petscii,
      terminalType: petscii ? 'c64' : 'modern',
      screenWidth: opts.cols,
      screenHeight: opts.cols > 80 ? 40 : 25,
      wireWidth: opts.cols, wireHeight: opts.cols > 80 ? 40 : 25,
      tempData: {},
    },
  });

  let running = true;
  const run = session.start().catch((e: Error) => { console.error('[ERROR] door:', e.message); }).finally(() => { running = false; });

  const boot = Date.now();
  while (!sock.firstAt && running && Date.now() - boot < 20000) await sleep(20);
  if (!sock.firstAt) { console.error('[ERROR] the door wrote nothing in 20 s'); process.exit(1); }
  const bootMs = sock.firstAt - boot;
  // The first frame is everything up to the first quiet (rail ticks aside), not a fixed wait: a door that
  // draws a wipe or is slow to boot paints for a while, and --window is only the longest this will wait.
  const settleStart = Date.now();
  while (running && Date.now() - settleStart < opts.window && Date.now() - sock.lastWorkAt < Math.max(opts.settle, 1000)) await sleep(20);
  const firstFrame = sock.bytes;
  const firstMsgs = sock.msgs;

  const idleMs = opts.idleWindow || opts.window;   // a door whose idle hook is slow needs a longer look to see a tick
  const idleWork = sock.workBytes, idleTickBytes = sock.tickBytes, idleTicks = sock.ticks;
  await sleep(idleMs);
  const idleBytes = (sock.workBytes - idleWork) + (sock.tickBytes - idleTickBytes);
  const idleNonTick = sock.workBytes - idleWork, idleTickCost = sock.tickBytes - idleTickBytes, idleTickCount = sock.ticks - idleTicks;

  const costs: KeyCost[] = [];
  const header = () => {
    console.log(`${path.basename(opts.binary)} at ${opts.cols} columns, up to ${opts.window} ms per key, quiet ${opts.settle} ms`);
    console.log(`boot to first byte  ${bootMs} ms`);
    console.log(`first frame         ${firstFrame} bytes (${firstMsgs} xim msgs)`);
    console.log(`idle (animation)    ${idleBytes} bytes per ${idleMs} ms window: ${idleTickCount} rail ticks (${idleTickCost} bytes${idleTickCount ? `, ${Math.round(idleTickCost / idleTickCount)} per tick` : ''}), ${idleNonTick} bytes of other animation`);
    console.log('key         gross    net   xim msgs   first byte ms');
  };
  if (!opts.json) header();   // a key line is printed as it completes: a run cut short by a timeout still reports what it measured
  for (const key of opts.keys) {
    if (!running) break;
    const before = sock.workBytes, msgsBefore = sock.workMsgs, grossBefore = sock.bytes;
    const sent = Date.now();
    let firstByteMs = -1;
    sock.emit('door:input', keyBytes(key));
    while (Date.now() - sent < opts.window) {
      if (firstByteMs < 0 && sock.workBytes > before) firstByteMs = Date.now() - sent;
      if (firstByteMs >= 0 && Date.now() - sock.lastWorkAt >= opts.settle) break;
      await sleep(10);
    }
    const elapsed = Date.now() - sent;
    const gross = sock.bytes - grossBefore;
    const net = Math.max(0, sock.workBytes - before - Math.round(idleNonTick * elapsed / idleMs));
    const messages = idleNonTick ? Math.ceil(net / 198) : sock.workMsgs - msgsBefore;
    costs.push({ key, gross, net, firstByteMs, messages });
    if (!opts.json) console.log(`${key.padEnd(10)} ${String(gross).padStart(6)} ${String(net).padStart(6)}   ${String(messages).padStart(8)}   ${String(firstByteMs).padStart(13)}`);
  }
  if (running) { sock.emit('door:input', keyBytes(opts.leave)); await Promise.race([run, sleep(3000)]); }
  if (running) { console.error(`[WARN] the door did not exit on ${opts.leave}`); }

  if (opts.json) {
    console.log(JSON.stringify({ binary: opts.binary, cols: opts.cols, window: opts.window, bootMs, firstFrame, firstMsgs, idleBytes, idleTicks: idleTickCount, idleTickBytes: idleTickCost, idleNonTickBytes: idleNonTick, costs }, null, 2));
  } else {
    const worst = costs.reduce((m, c) => Math.max(m, c.net), 0);
    console.log(worst > 600 ? `[WARN] a keypress cost ${worst} bytes net of animation - that is a screen, not a row` : `[OK] no keypress cost more than ${worst} bytes net of animation`);
  }
  process.exit(running ? 1 : 0);
}

main();
