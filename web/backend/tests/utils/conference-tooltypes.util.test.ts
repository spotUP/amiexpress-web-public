/**
 * A conference's flags are its icon's tooltypes - nothing else.
 *
 * express.e reads FORCE_NEWSCAN, NO_BULLS, FREEDOWNLOADS and the rest by
 * presence on the conference's own icon (checkToolTypeExists, express.e:576),
 * at the moment it needs them. The port merged a SQL copy under the icon, so
 * a flag the database still held stayed on after the sysop took it off the
 * icon (DB/disk audit item 10, 2026-10-04); it cached the answer for the
 * life of the process, so an icon edit changed nothing until a restart; and
 * it looked for `Conf<n>.info` rather than the icon beside the conference's
 * LOCATION.
 *
 * Real icons on a real scratch board, written by the board's own writer.
 * This file used to mock `fs` and pin the old hand-rolled byte scanner's
 * quirks; those cases tested the parser's shape, not the board.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const dbFlags = { force_newscan: 1, free_downloads: 1, no_bulls: 1 };
jest.mock('../../src/database', () => ({
  db: { getConfigRepository: () => ({ getConferenceConfig: () => dbFlags }) },
}));

import { config } from '../../src/config';
import { getConferenceToolFlags } from '../../src/utils/conference-tooltypes.util';
import { applyTooltypes } from '../../src/utils/info-file.util';

const REPO = path.resolve(__dirname, '../../../..');
let root: string;
let spy: jest.SpyInstance;

function icon(conferenceDirName: string, tooltypes: Array<[string, string]>, remove: string[] = []): string {
  const file = path.join(root, `${conferenceDirName}.info`);
  if (!fs.existsSync(file)) fs.copyFileSync(path.join(REPO, 'Conf1.info'), file);
  applyTooltypes(file, tooltypes, { removeKeys: (key) => remove.includes(key) });
  return file;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-flags-'));
  const original = config.getConfig.bind(config);
  spy = jest.spyOn(config, 'getConfig').mockImplementation(() => ({ ...original(), dataDir: root }) as never);
});

afterEach(() => {
  spy.mockRestore();
  fs.rmSync(root, { recursive: true, force: true });
});

test('a flag on the icon is on; the same flags left only in the database are not', () => {
  icon('Conf3', [['NO_NEWSCAN', '1'], ['FORCE_MENUS', '1']], ['FORCE_NEWSCAN', 'FREEDOWNLOADS', 'NO_BULLS']);
  const flags = getConferenceToolFlags(3);
  expect(flags.noNewscan).toBe(true);
  expect(flags.forceMenus).toBe(true);
  expect(flags.forceNewscan).toBe(false);
  expect(flags.freeDownloads).toBe(false);
  expect(flags.noBulls).toBe(false);
});

test('taking a flag off the icon takes it off the board, without a restart', () => {
  const file = icon('Conf4', [['FREEDOWNLOADS', '1']]);
  expect(getConferenceToolFlags(4).freeDownloads).toBe(true);

  applyTooltypes(file, [], { removeKeys: (key) => key === 'FREEDOWNLOADS' });
  const later = new Date(Date.now() + 2000);
  fs.utimesSync(file, later, later);
  expect(getConferenceToolFlags(4).freeDownloads).toBe(false);
});

test("the icon is the one beside the conference's LOCATION, not Conf<n>.info", () => {
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), 'NCONFS=2\nNAME.1=One\nLOCATION.1=BBS:Conf1/\nNAME.2=Moved\nLOCATION.2=BBS:Amiga/\n');
  fs.mkdirSync(path.join(root, 'Amiga'));
  icon('Amiga', [['NO_CONF_BULLS', '1'], ['MENU_PROMPT', 'Amiga>']]);
  const flags = getConferenceToolFlags(2);
  expect(flags.noConfBulls).toBe(true);
  expect(flags.menuPrompt).toBe('Amiga>');
});

test('per-message-base and value tooltypes still read', () => {
  icon('Conf5', [['EXTSEND.2', '1'], ['USERNAME.1', '1'], ['FORWARDMAIL', 'spot'], ['CUSTOM', '1']]);
  const flags = getConferenceToolFlags(5);
  expect([...(flags.extSendMsgBases ?? [])]).toEqual([2]);
  expect([...(flags.requireUsernameMsgBases ?? [])]).toEqual([1]);
  expect(flags.forwardMail).toBe('spot');
  expect(flags.custom).toBe(true);
});

test('a conference with no icon has every flag off', () => {
  const flags = getConferenceToolFlags(9);
  expect(flags.forceNewscan).toBe(false);
  expect(flags.freeDownloads).toBe(false);
  expect(flags.custom).toBeFalsy();
});
