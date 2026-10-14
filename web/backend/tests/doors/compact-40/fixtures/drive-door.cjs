/**
 * The seam every "drive the SHIPPED door bundle" fixture shares (drive-notify,
 * drive-web-terminal): jest cannot import() a door by file URL and resolves
 * the SDK to source, so the shipped pair is only reachable from a plain node
 * process. `door.execute()` is the very call executeTypeScriptDoor makes
 * (src/handlers/door.handler.ts); keys go through `session.doorInputHandler`,
 * the property both live routers call.
 *
 * A fixture passes the door's dist path, a function building the door's `bbs`
 * (given the parsed spec and the shared `captured` list) and a function
 * returning its extra result fields. Prints {captured, errors, ended, ...extra}.
 */
const path = require('path');

const REPO = path.resolve(__dirname, '../../../../../..');

module.exports = function driveDoor({ dist, makeBbs, extra = () => ({}), callerId = 'caller' }) {
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
    isPetsciiMode: () => session.petsciiMode === true,
    ...makeBbs(spec, captured),
  };

  const socket = {
    id: `${callerId}-drive`,
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
    const door = require(path.join(REPO, dist)).default;
    let ended = false;
    door.execute({
      socket,
      bbsSession: session,
      user: { id: callerId, username: 'READER', securityLevel: 255, accessLevel: 255 },
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

    process.stdout.write(JSON.stringify({ captured, errors, ended, ...extra() }));
    process.exit(0);
  })();
};
