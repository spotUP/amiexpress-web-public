/**
 * Drives the REAL GRANDMASTER bundle at 40x25 on a petsciiMode session and
 * prints every byte it wrote, as JSON, on stdout.
 *
 * Run as a child process by `../grandmaster-menu-select-40.test.ts` rather than
 * required into the suite: jest resolves `@amiexpress/bbs-door-sdk` to the SDK
 * SOURCE, whose audio engine imports Tone.js (ESM, unparseable by the CommonJS
 * runner). Under plain node the door loads `Doors/grandmaster/dist` against
 * `sdk/dist` - the exact pair `executeTypeScriptDoor` loads in production - so
 * the child is not a convenience, it is what makes this a real drive of the
 * shipped code rather than of a rebuilt hybrid.
 *
 *   node drive-grandmaster-40.cjs '[{"key":"\r","wait":700}]'
 *
 * `bbs.write` IS the wire: `BBSApi.write` emits `ansi-output` after
 * `wrapDoorTextForSession`, identity for a payload that positions the cursor -
 * and every blessed frame does. Keys go through `session.doorInputHandler`, the
 * property both live routers call (`src/server/socket-handlers.ts`,
 * `src/index.ts`).
 */
const path = require('path');

const REPO = path.resolve(__dirname, '../../../../../..');
const DOOR = path.join(REPO, 'Doors/grandmaster/dist/index.js');
const COLS = 40;
const ROWS = 25;

// The door narrates on stdout (sound engine, database, screen geometry). This
// process's stdout is the JSON channel, so send every log line to stderr and
// keep stdout clean.
for (const level of ['log', 'info', 'warn', 'debug']) {
  console[level] = (...a) => process.stderr.write(a.map(String).join(' ') + '\n');
}

const steps = JSON.parse(process.argv[2] || '[]');
const captured = [];
const errors = [];

const bbs = {
  connectionType: 'web',
  unicodeCapable: true,
  getTerminalSize: () => ({ width: COLS, height: ROWS }),
  write: (d) => { captured.push(String(d)); },
  writeLine: (d) => { captured.push(String(d) + '\r\n'); },
  on: () => {}, off: () => {}, emit: () => {},
  getUser: () => ({ username: 'SYSOP', securityLevel: 255 }),
};

const socket = {
  id: 'grandmaster-40col-drive',
  connected: true,
  emit: (event, data) => {
    if (event === 'ansi-output' && typeof data === 'string') captured.push(data);
    return true;
  },
  on: () => socket, once: () => socket, off: () => socket, removeListener: () => socket,
};

const session = { nodeId: 1, petsciiMode: true, screenWidth: COLS, screenHeight: ROWS };

process.on('unhandledRejection', (e) => errors.push(String((e && e.stack) || e)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const door = require(DOOR).default;
  door.execute({
    socket,
    bbsSession: session,
    user: {
      id: 'grandmaster-40col-user', username: 'SYSOP', securityLevel: 255,
      accessLevel: 255, timesCalled: 1, uploads: 0, downloads: 0,
    },
    params: [],
    bbs,
  }).catch((e) => { errors.push(String((e && e.stack) || e)); });

  await sleep(500);
  for (const step of steps) {
    const handler = session.doorInputHandler;
    if (!handler) { errors.push('no doorInputHandler installed'); break; }
    handler(step.key);
    await sleep(step.wait);
  }

  process.stdout.write(JSON.stringify({ captured, errors }));
  process.exit(0);
})();
