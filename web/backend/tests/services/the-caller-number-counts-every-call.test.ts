/**
 * The board's caller number lives in <bbs>/SystemStats and every connect takes
 * the next one (express.e:2855-2866, 29565). The port never touched the file:
 * ~SC showed today's calls and S "Caller Num." showed 0 (parity survey,
 * 2026-09-29). Driven through the real login-connect pipeline and ~SC.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { getCallerCount, updateCallerNum } from '../../src/services/caller-number';
import { parseMciCodes } from '../../src/handlers/screen.handler';

let root: string;
let previous: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'caller-num-'));
  previous = config.get('dataDir');
  config.set('dataDir', root);
});
afterEach(() => {
  config.set('dataDir', previous);
  fs.rmSync(root, { recursive: true, force: true });
});

it('continues the number the Amiga board left, and ~SC shows it', async () => {
  fs.writeFileSync(path.join(root, 'SystemStats'), '20265\n', 'latin1');

  expect(updateCallerNum()).toBe(20266);
  expect(fs.readFileSync(path.join(root, 'SystemStats'), 'latin1')).toBe('20266\n');
  expect(getCallerCount()).toBe(20266);

  const session: any = { nodeId: 1, currentConf: 1, user: { username: 'x', secLevel: 20 }, tempData: {} };
  const r = await parseMciCodes('caller ~SC|', session);
  expect(r.parsed).toBe('caller 20266');
});

it('starts at 1 on a board with no SystemStats yet', () => {
  expect(updateCallerNum()).toBe(1);
});
