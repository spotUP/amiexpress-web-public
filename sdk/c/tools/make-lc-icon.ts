// Builds sdk/c/tools/release/LC.info: the binary BBS command icon a stock
// AmiExpress reads for the LC command (BBS:Commands/BBSCmd/LC.info).
// Reuses the repo's one tooltype writer (applyTooltypes) on a binary template.
// Run: cd web/backend && npx tsx ../../sdk/c/tools/make-lc-icon.ts
// Tooltype sources (Reference/AmiExpress-Sources/express.e, processCommand):
//   LOCATION  line ~4751  path of the door binary
//   TYPE      line ~4682  XIM selects DOORTYPE_XIM
//   ACCESS    line ~4702  minimum access level; 0 returns without running
//   STACK     line ~4759  stack size, default 20000
//   NAME      line ~4710  shown in the node status line
import * as fs from 'fs';
import * as path from 'path';
import { applyTooltypes, parseInfoFile } from '../../../web/backend/src/utils/info-file.util';

const root = path.resolve(__dirname, '../../..');
const template = path.join(root, 'board/Languages.info');
const out = path.join(__dirname, 'release/LC.info');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.copyFileSync(template, out);
applyTooltypes(
  out,
  [
    ['LOCATION', 'Doors:LIVECHAT68/LIVECHAT68'],
    ['TYPE', 'XIM'],
    ['STACK', '32768'],
    ['ACCESS', '1'],
    ['NAME', 'LiveChat'],
  ],
  { removeKeys: () => true },
);
const back = parseInfoFile(out);
if (!back.isBinary) throw new Error('LC.info is not binary');
console.log(back.tooltypes.map(t => `${t.key}=${t.value}`).join(' '));
