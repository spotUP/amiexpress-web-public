/**
 * Records the BUGS door's real 40x25 byte stream into
 * `bug-tracker-40x25-menu-walk.json`, the fixture
 * `../bug-tracker-blessed-repaint.test.ts` replays.
 *
 * Regenerate with (the SDK and the door's dist must be built):
 *
 *   cd web/backend && npx tsx tests/petscii-frame/fixtures/capture-bug-tracker.mjs \
 *     tests/petscii-frame/fixtures/bug-tracker-40x25-menu-walk.json
 *
 * It is a script and not a jest suite because the door bundle is ESM and reads
 * `import.meta.url`, which the CommonJS test runner cannot load - the same
 * reason `tests/doors/compact-40/bug-tracker.test.ts` drives `layout.ts`
 * directly instead of the door.
 *
 * `bbs.write` IS the wire: `BBSApi.write` emits `ansi-output` after
 * `wrapDoorTextForSession`, which is identity for a payload that positions the
 * cursor (`src/utils/wrap-for-session.util.ts`), and every blessed frame does.
 * `unicodeCapable: true` is what `BBSApi` answers for a web session, so
 * `convertForAmiga` stays off exactly as in production. Keys go through
 * `session.doorInputHandler`, the property both live routers call
 * (`src/server/socket-handlers.ts`, `src/index.ts`).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT = process.argv[2] || 'bug-tracker-40x25-menu-walk.json';
const REPO = path.resolve(new URL('.', import.meta.url).pathname, '../../../../..');

const chunks = [];   // { phase, data }
let phase = 'boot';

const bbs = {
  connectionType: 'web',
  unicodeCapable: true,
  getTerminalSize: () => ({ width: 40, height: 25 }),
  write: (data) => { chunks.push({ phase, data: String(data) }); },
  writeLine: (data) => { chunks.push({ phase, data: String(data) + '\r\n' }); },
  on: () => {},
  off: () => {},
  emit: () => {},
  getUser: () => ({ username: 'SYSOP', securityLevel: 255 }),
};

const socket = {
  id: 'capture-socket',
  connected: true,
  emit: (event, data) => {
    if (event === 'ansi-output' && typeof data === 'string') chunks.push({ phase, data });
    return true;
  },
  on: () => socket,
  once: () => socket,
  off: () => socket,
  removeListener: () => socket,
};

const session = { nodeId: 1, petsciiMode: true, screenWidth: 40, screenHeight: 25 };

const mod = await import(path.join(REPO, 'Doors/bug-tracker/dist/index.js'));
const door = mod.default;

const finished = door.execute({
  socket,
  bbsSession: session,
  user: { id: 'capture-user', username: 'SYSOP', securityLevel: 255, accessLevel: 255, timesCalled: 1, uploads: 0, downloads: 0 },
  params: [],
  bbs,
});

const settle = () => new Promise((r) => setTimeout(r, 60));
await settle(); await settle(); await settle();

function press(key, label) {
  const h = session.doorInputHandler;
  if (!h) throw new Error('no doorInputHandler installed');
  phase = label;
  h(key);
}

const DOWN = '\x1b[B';
const UP = '\x1b[A';

// 8 menu items as sysop (N L M S A T W Q). Ten downs wraps twice past the
// bottom; ten ups wraps back past the top - the sysop's "both ways".
for (let i = 1; i <= 10; i++) { press(DOWN, `down-${i}`); await settle(); }
for (let i = 1; i <= 10; i++) { press(UP, `up-${i}`); await settle(); }

phase = 'quit';
press('q', 'quit');
await settle(); await settle();

fs.writeFileSync(OUT, JSON.stringify(chunks, null, 1));
console.error(`[capture] ${chunks.length} chunks, ${chunks.reduce((n, c) => n + c.data.length, 0)} chars -> ${OUT}`);
process.exit(0);
