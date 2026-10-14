/**
 * Drives the REAL NOTIFY bundle (Doors/notify/dist/index.js, against sdk/dist)
 * on a session of the geometry in argv[2] and prints every byte it wrote, as
 * JSON, on stdout. Same seam as drive-grandmaster-40.cjs, and for the same
 * reason: jest cannot `import()` a door by file URL, and resolves the SDK to
 * source, so the shipped pair is only reachable from a plain node process.
 *
 *   BBS_DATA_DIR=<board> node drive-notify.cjs \
 *     '{"cols":40,"rows":25,"petscii":true,"steps":[{"key":"c","wait":300}]}'
 *
 * `door.execute()` is the very call `executeTypeScriptDoor` makes
 * (src/handlers/door.handler.ts, "Calling door.execute() with SDK context").
 * Keys go through `session.doorInputHandler`, the property both live routers
 * call.
 */
const path = require('path');

const REPO = path.resolve(__dirname, '../../../../../..');
const DOOR = path.join(REPO, 'Doors/notify/dist/index.js');

for (const level of ['log', 'info', 'warn', 'debug']) {
  console[level] = (...a) => process.stderr.write(a.map(String).join(' ') + '\n');
}

const spec = JSON.parse(process.argv[2] || '{}');
const COLS = spec.cols || 80;
const ROWS = spec.rows || 24;
const steps = spec.steps || [];
const captured = [];
const errors = [];

const session = { nodeId: 1, petsciiMode: spec.petscii === true, screenWidth: COLS, screenHeight: ROWS };

const bbs = {
  connectionType: 'web',
  unicodeCapable: true,
  getTerminalSize: () => ({ width: COLS, height: ROWS }),
  write: (d) => { captured.push(String(d)); },
  writeLine: (d) => { captured.push(String(d) + '\r\n'); },
  on: () => {}, off: () => {}, emit: () => {},
  getUser: () => ({ username: 'READER', securityLevel: 255 }),
  setUserEmail: async () => true,
  notifications: () => ({
    catalogue: async () => ({
      events: [
        { id: 'mail.private', label: 'Private mail', channels: ['email', 'push'] },
        { id: 'msg.reply', label: 'Reply to my message', channels: ['email', 'push', 'board'] },
      ],
      deliverable: { email: true, push: false, board: true }, conferences: [], boardZone: 'UTC',
    }),
    get: async () => ({
      prefs: { 'msg.reply': { email: 'instant' } },
      settings: { quietFrom: null, quietTo: null, timeZone: null, digestKind: 'daily', digestHour: 8, digestWeekday: null, paused: false },
      follows: [], email: { address: 'a@b.c', verified: true },
    }),
    set: async () => ({ ok: false, error: 'driver is read only' }),
    follow: async () => ({ ok: true, follows: [] }),
    startEmailVerification: async () => ({ ok: false, reason: 'send-failed' }),
    confirmEmail: async () => ({ ok: false, reason: 'none' }),
    test: async () => ({ ok: true, detail: 'ok' }),
  }),
  isPetsciiMode: () => session.petsciiMode === true,
};

const socket = {
  id: 'notify-drive',
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
    user: { id: 'notify-caller', username: 'READER', securityLevel: 255, accessLevel: 255 },
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

  process.stdout.write(JSON.stringify({ captured, errors, ended }));
  process.exit(0);
})();
