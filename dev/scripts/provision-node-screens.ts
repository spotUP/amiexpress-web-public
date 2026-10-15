/**
 * Give every node a screen directory, the way express.e does it.
 *
 * ACP.e:2666-2673: a node reads its screens from its own `SCREENS` tooltype,
 * and from `<bbsLoc>/Node<N>/` when it declares none. A board that offers more
 * nodes than it has screen directories - MAX_NODES=255 with 41 Node<N>/
 * directories, say - serves nothing at all to the rest, because express.e has
 * no cross-directory fallback (express.e:6544-6640).
 *
 * This seeds ONE shared screen directory and points every node without
 * screens of its own at it, which is the sanctioned way to share on a real
 * Amiga: one copy of the files, not 200.
 *
 * Dry by default. Pass --apply to write.
 *
 *   npx tsx dev/scripts/provision-node-screens.ts --data-dir /app/data/bbs
 *   npx tsx dev/scripts/provision-node-screens.ts --data-dir /app/data/bbs --apply
 */

import * as fs from 'fs';
import * as path from 'path';
import { applyTooltypes, readTooltypeMap } from '../../web/backend/src/utils/info-file.util';

/** The screens express.e reads from nodeScreenDir (express.e:6546-6634). */
const NODE_SCREEN_STEMS = [
  'awaitscreen', 'bbstitle', 'logon', 'logoff', 'join', 'joined', 'joinconf',
  'joinmsgbase', 'newuserpw', 'nonewusers', 'guestlogon', 'lockout0', 'lockout1',
  'private', 'nottime', 'nonewat', 'nocallersat',
];

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const APPLY = process.argv.includes('--apply');
const DATA_DIR = path.resolve(arg('data-dir', process.env.BBS_DATA_DIR || process.cwd()));
const SHARED_REL = arg('shared', path.join('Screens', 'Node'));
const SEED_FROM = arg('from', 'Node1');
const MAX_NODE = parseInt(arg('max', '255'), 10);

/** A screen file the loader would accept for one of the node screens. */
function isNodeScreen(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (!/\.(txt|gr|ibm|seq|rip)$/.test(lower) && !lower.endsWith('.txt')) return false;
  const stem = lower.replace(/\.[^.]+$/, '').replace(/\d+$/, '');
  return NODE_SCREEN_STEMS.includes(stem);
}

/**
 * The screens a caller meets before and after a session. A node that has
 * some but not all of them is NOT provisioned - the live board has node
 * directories holding a single stray BBSTITLE.txt, and treating those as
 * complete would leave the caller with a title screen and no logon or
 * logoff. Such a node is pointed at the shared set like any other.
 */
const CORE_STEMS = ['awaitscreen', 'bbstitle', 'logon', 'logoff'];

function nodeHasOwnScreens(nodeDir: string): boolean {
  let entries: string[];
  try {
    entries = fs.readdirSync(nodeDir);
  } catch {
    return false;
  }
  const stems = new Set(
    entries.filter(isNodeScreen).map(f => f.toLowerCase().replace(/\.[^.]+$/, '').replace(/\d+$/, ''))
  );
  return CORE_STEMS.every(stem => stems.has(stem));
}

function main(): void {
  const sharedDir = path.resolve(DATA_DIR, SHARED_REL);
  const seedDir = path.resolve(DATA_DIR, SEED_FROM);

  console.log(`[provision] board      ${DATA_DIR}`);
  console.log(`[provision] shared dir ${sharedDir}`);
  console.log(`[provision] seeded from ${seedDir}`);
  console.log(`[provision] mode       ${APPLY ? 'APPLY' : 'dry run (pass --apply to write)'}`);

  if (!fs.existsSync(seedDir)) {
    console.error(`[provision] seed directory does not exist: ${seedDir}`);
    process.exit(1);
  }

  // 1. The shared screen set - one copy, taken from a node that has one.
  const seeds = fs.readdirSync(seedDir).filter(isNodeScreen);
  let copied = 0;
  for (const name of seeds) {
    const target = path.join(sharedDir, name);
    if (fs.existsSync(target)) continue;
    if (APPLY) {
      fs.mkdirSync(sharedDir, { recursive: true });
      fs.copyFileSync(path.join(seedDir, name), target);
    }
    copied++;
  }
  console.log(`[provision] ${seeds.length} screens in ${SEED_FROM}, ${copied} to copy into ${SHARED_REL}`);

  // 2. Every node without screens of its own is pointed at the shared set.
  const tooltypeValue = `BBS:${SHARED_REL.split(path.sep).join('/')}/`;
  let pointed = 0, ownScreens = 0, already = 0;

  for (let node = 0; node <= MAX_NODE; node++) {
    const nodeDir = path.join(DATA_DIR, `Node${node}`);
    if (nodeHasOwnScreens(nodeDir)) { ownScreens++; continue; }

    const infoPath = path.join(DATA_DIR, `Node${node}.info`);
    let declared = '';
    try { declared = (readTooltypeMap(infoPath).get('SCREENS') || '').trim(); } catch { /* no icon yet */ }
    if (declared) { already++; continue; }

    if (APPLY) applyTooltypes(infoPath, [['SCREENS', tooltypeValue]]);
    pointed++;
  }

  console.log(`[provision] ${ownScreens} nodes keep their own screens`);
  console.log(`[provision] ${already} nodes already declare SCREENS`);
  console.log(`[provision] ${pointed} nodes ${APPLY ? 'now point' : 'would point'} at ${tooltypeValue}`);
  if (!APPLY) console.log('[provision] nothing written - re-run with --apply');
}

main();
