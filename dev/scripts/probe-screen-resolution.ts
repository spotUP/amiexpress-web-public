/**
 * Every screen the board can resolve, printed one line each.
 *
 * The screen manager's whole risk is that the admin and the loader disagree
 * about where a screen comes from, so the check is the loader itself: run this
 * before a change and after it, diff the two files, and read what moved. It is
 * also how the resolution table was extracted from screen.handler.ts without
 * changing a single caller's screen.
 *
 *   npx tsx dev/scripts/probe-screen-resolution.ts --data-dir /app/data/bbs > before.tsv
 *
 * Do NOT `git stash` to get the "before" side in this repo - the CRLF phantom
 * files block `stash pop` permanently. Use a second worktree at origin/main.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';

const dataDirArg = process.argv.indexOf('--data-dir');
const DATA_DIR = path.resolve(
  dataDirArg >= 0 && process.argv[dataDirArg + 1]
    ? process.argv[dataDirArg + 1]
    : process.env.BBS_DATA_DIR || process.cwd(),
);
process.env.BBS_DATA_DIR = DATA_DIR;

const handlerPath = path.resolve(__dirname, '../../web/backend/src/handlers/screen.handler');
const resolutionPath = path.resolve(__dirname, '../../web/backend/src/screens/screen-resolution');
const { loadScreenFile } = require(handlerPath);
const { SCREEN_DIR_MAP, ScreenDirType } = require(resolutionPath);

const SECLEVELS = [0, 10, 20, 100, 255];
const entries = fs.readdirSync(DATA_DIR);
const nodes = entries.filter(d => /^Node\d+$/.test(d)).map(d => parseInt(d.slice(4), 10)).sort((a, b) => a - b);
const confs = entries.filter(d => /^Conf\d+$/.test(d)).map(d => parseInt(d.slice(4), 10)).sort((a, b) => a - b);

const session = (secLevel: number, relConfNum: number, nodeId: number) => ({
  user: { secLevel },
  terminalType: 'ansi',
  screenWidth: 80,
  screenHeight: 24,
  petsciiMode: false,
  relConfNum,
  nodeId,
});

const rows: string[] = [];
for (const [screen, dirType] of Object.entries(SCREEN_DIR_MAP) as [string, string][]) {
  const scopes = dirType === ScreenDirType.CONF
    ? confs.map(c => ({ node: 1, conf: c }))
    : nodes.map(n => ({ node: n, conf: 1 }));

  for (const scope of scopes) {
    for (const sec of SECLEVELS) {
      const found = loadScreenFile(screen, scope.conf, scope.node, session(sec, scope.conf, scope.node));
      rows.push([
        dirType,
        screen,
        `node=${scope.node}`,
        `conf=${scope.conf}`,
        `sec=${sec}`,
        found ? path.relative(DATA_DIR, found.filePath) : 'NULL',
      ].join('\t'));
    }
  }
}

console.log(rows.join('\n'));
