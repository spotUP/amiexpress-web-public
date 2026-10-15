/**
 * The admin and the board must never disagree about where a screen comes from.
 *
 * That disagreement - a writer and a reader each holding their own copy of one
 * rule - is the single fault behind the 2026-08-31 admin audit: both halves
 * work, on data that never meets, so the page looks right, the toast says
 * saved, and the board does something else. Here the index CLAIMS a resolution
 * and the loader is asked to produce one, for every screen and every scope on
 * a fixture board. A rule taught to one and not the other fails here rather
 * than in a caller's logon screen.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let root: string;
let buildScreenIndex: typeof import('../../src/screens/screen-index.service').buildScreenIndex;
let loadScreenFile: any;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-agree-'));
  const write = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body, 'latin1');
  };

  // A board with every shape the resolver has to handle: a node with its own
  // screens and a security variant, a node with none, a node redirected by a
  // SCREENS tooltype, a conference, and the board root.
  write('Node1/BBSTITLE.txt', 'one\n');
  write('Node1/LOGON.TXT', 'logon\n');
  write('Node1/LOGON20.TXT', 'sysop\n');
  write('Node1/JOIN.TXT', 'join\n');
  write('Node2/BBSTITLE.txt', 'two\n');
  write('Node3/.keep', '');
  write('Node9/.keep', '');
  write('Screens/Shared/BBSTITLE.txt', 'shared\n');
  write('Screens/Shared/LOGON.TXT', 'shared logon\n');
  fs.writeFileSync(path.join(root, 'Node9.info'), 'SCREENS=BBS:Screens/Shared/\n');
  write('Conf1/MENU.TXT', 'menu\n');
  write('Conf2/Screens/MENU.TXT', 'conf2 menu\n');
  write('BULL.txt', 'bull\n');
  write('Screens/ONENODE.TXT', 'one node\n');

  process.env.BBS_DATA_DIR = root;
  jest.resetModules();
  buildScreenIndex = require('../../src/screens/screen-index.service').buildScreenIndex;
  loadScreenFile = require('../../src/handlers/screen.handler').loadScreenFile;
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('every resolution the index claims is the file the loader returns', () => {
  const index = buildScreenIndex(root);
  const mismatches: string[] = [];
  let checked = 0;

  for (const entry of index.screens) {
    for (const res of entry.resolutions) {
      const nodeId = res.scope === 'node' ? res.id ?? 0 : 1;
      const confId = res.scope === 'conf' ? res.id ?? undefined : 1;
      const session = {
        user: { secLevel: 255 },
        terminalType: 'ansi',
        screenWidth: 80,
        screenHeight: 24,
        petsciiMode: false,
        relConfNum: confId,
        nodeId,
      };

      const loaded = loadScreenFile(entry.screen, confId, nodeId, session);
      const fromLoader = loaded ? path.relative(root, loaded.filePath) : null;
      checked++;

      // The loader answers with the extension it BUILT (`.TXT`); the index
      // reports the name as it sits on disk, because the manager shows and
      // edits real filenames. On an Amiga volume those are one file.
      const same = (a: string | null, b: string | null) =>
        (a === null && b === null) || (!!a && !!b && a.toLowerCase() === b.toLowerCase());

      // The ONE deviation, and it is the loader's, not the index's: when
      // AWAITSCREEN is missing, screen.handler.ts substitutes Node1's title
      // screen - for every node, so node 27 shows node 1's. express.e has no
      // such rule (express.e:6546 reads nodeScreenDir and gives up), which is
      // why the index answers null. Named here so it stays one deviation
      // rather than quietly becoming a family of them.
      const isAwaitScreenSubstitution =
        entry.screen === 'AWAITSCREEN' && res.file === null && !!fromLoader &&
        path.basename(fromLoader).toLowerCase().startsWith('bbstitle');

      if (!same(fromLoader, res.file) && !isAwaitScreenSubstitution) {
        mismatches.push(
          `${entry.screen} ${res.scope}=${res.id}: index says ${res.file}, loader says ${fromLoader}`,
        );
      }
    }
  }

  expect(checked).toBeGreaterThan(50);
  expect(mismatches).toEqual([]);
});
