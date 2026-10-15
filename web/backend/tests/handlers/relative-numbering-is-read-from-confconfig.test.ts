/**
 * express.e ACP.e:2693-2703 reads RELATIVE_CONFERENCES from the CONFCONFIG
 * icon, presence = on. The board read it from bbsConfig.info, which the live
 * board does not carry it in (Live checks 2026-10-15), so the board's J
 * numbered absolutely while JoinCnf - reading ConfConfig - numbered
 * relatively, and a pick could join a different conference.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

process.env.SKIP_DB_INIT = '1';

import { getConfRelativeToggle } from '../../src/handlers/commands/user-commands.handler';
import { loadConfConfig } from '../../src/services/conf-config.service';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'relconf-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const writeConfConfig = (...extra: string[]) => fs.writeFileSync(path.join(root, 'ConfConfig.info'),
  ['NCONFS=2', 'NAME.1=One', 'LOCATION.1=BBS:Conf1/', ...extra, 'NAME.2=Two', 'LOCATION.2=BBS:Conf2/'].join('\n') + '\n');

test('a bare RELATIVE_CONFERENCES on ConfConfig.info turns relative numbering on', () => {
  writeConfConfig('RELATIVE_CONFERENCES');
  expect(loadConfConfig(root)?.relative).toBe(true);
  expect(getConfRelativeToggle({ bbsPath: root } as any)).toBe(true);
});

test('without it the numbering is absolute', () => {
  writeConfConfig();
  expect(getConfRelativeToggle({ bbsPath: root } as any)).toBe(false);
});

test('bbsConfig.info carrying RELATIVE_CONFERENCES no longer turns it on - one home, the one express.e reads', () => {
  writeConfConfig();
  fs.writeFileSync(path.join(root, 'bbsConfig.info.txt'), 'RELATIVE_CONFERENCES\n');
  expect(getConfRelativeToggle({ bbsPath: root } as any)).toBe(false);
});

test('a commented (RELATIVE_CONFERENCES) is off, as FindToolType skips it', () => {
  writeConfConfig('(RELATIVE_CONFERENCES)');
  expect(getConfRelativeToggle({ bbsPath: root } as any)).toBe(false);
});
