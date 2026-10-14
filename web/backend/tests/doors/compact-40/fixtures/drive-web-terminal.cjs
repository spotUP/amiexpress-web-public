/**
 * Drives the REAL WEBTERM bundle (Doors/web-terminal/dist/index.js, against
 * sdk/dist) on a session of the geometry in argv[2] and prints every byte it
 * wrote, the board calls it made, and whether execute() resolved, as JSON.
 * Same seam as drive-notify.cjs: jest cannot import() a door by file URL, so
 * the shipped pair is only reachable from a plain node process.
 *
 *   node drive-web-terminal.cjs '{"cols":40,"rows":25,"petscii":true,"steps":[{"key":"\u001b[B","wait":100}]}'
 */
const path = require('path');

const REPO = path.resolve(__dirname, '../../../../../..');
const DOOR = path.join(REPO, 'Doors/web-terminal/dist/index.js');

for (const level of ['log', 'info', 'warn', 'debug']) {
  console[level] = (...a) => process.stderr.write(a.map(String).join(' ') + '\n');
}

const spec = JSON.parse(process.argv[2] || '{}');
const COLS = spec.cols || 80;
const ROWS = spec.rows || 24;
const steps = spec.steps || [];
const captured = [];
const calls = [];
const errors = [];
let palette = 'C128 (VDC)';

const session = { nodeId: 1, petsciiMode: spec.petscii === true, screenWidth: COLS, screenHeight: ROWS };

const bbs = {
  connectionType: 'web',
  unicodeCapable: true,
  getTerminalSize: () => ({ width: COLS, height: ROWS }),
  write: (d) => { captured.push(String(d)); },
  writeLine: (d) => { captured.push(String(d) + '\r\n'); },
  on: () => {}, off: () => {}, emit: () => {},
  isPetsciiMode: () => session.petsciiMode === true,
  webTerminalSettings: () => ({ modemSpeed: '2400 bps', font: 'MicroKnight', fontFixedNotice: '', petsciiPalette: palette, petsciiCharset: 'STANDARD' }),
  modemSpeedChoices: () => ['MAX (No Throttle)', '2400 bps'],
  chooseModemSpeed: async () => true,
  terminalFontChoices: () => [{ id: 'MicroKnight', label: 'MicroKnight' }],
  chooseTerminalFont: async () => 'set',
  togglePetsciiPalette: async () => { calls.push('togglePetsciiPalette'); palette = 'C64 (VIC-II)'; return 'vic'; },
  togglePetsciiCharset: async () => { calls.push('togglePetsciiCharset'); return { charset: 'swedish', notice: 'SWEDISH' }; },
  myData: () => [],
  eraseMyAccount: async () => ({ ok: false, reason: 'no' }),
};

const socket = {
  id: 'web-terminal-drive',
  connected: true,
  emit: (event, data) => {
    if (event === 'ansi-output' && typeof data === 'string') captured.push(data);
    return true;
  },
  on: () => socket, once: () => socket, off: () => socket, removeListener: () => socket,
};

process.on('unhandledRejection', (e) => errors.push(String((e && e.stack) || e)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const door = require(DOOR).default;
  let ended = false;
  door.execute({
    socket,
    bbsSession: session,
    user: { id: 'wt-caller', username: 'READER', securityLevel: 255, accessLevel: 255 },
    params: [],
    bbs,
  }).then(() => { ended = true; }).catch((e) => { errors.push(String((e && e.stack) || e)); });

  await sleep(spec.settle || 800);
  for (const step of steps) {
    const handler = session.doorInputHandler;
    if (!handler) { errors.push('no doorInputHandler installed'); break; }
    handler(step.key);
    await sleep(step.wait);
  }

  process.stdout.write(JSON.stringify({ captured, errors, ended, calls }));
  process.exit(0);
})();
