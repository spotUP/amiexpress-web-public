/** The door's prompt row is the board's prompt: a conference MENU_PROMPT tooltype goes through MCI, like displayMenuPrompt. */
jest.mock('../../src/utils/acs-access-loader');
const flags = { menuPrompt: '' };
jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  ...jest.requireActual('../../src/utils/conference-tooltypes.util'),
  getConferenceToolFlags: () => ({ menuPrompt: flags.menuPrompt, forceMenus: false }),
}));
jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  parseMciCodes: jest.fn(async (t: string) => ({ parsed: t.replace('~CN', 'Lounge') })),
}));
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-prompt-'));
config.set('dataDir', root);
import { menuAnswer } from '../../src/amiga-emulation/xim/menu';
import { menuPromptTextAsync } from '../../src/handlers/command-handler/menu';

const session: any = { nodeId: 2, currentConf: 1, relConfNum: 1, screenWidth: 80, user: { id: 7, secLevel: 10, securityFlags: 'T'.repeat(128) } };
const ctx = { session, socket: { emit: jest.fn() }, emitDoorText: jest.fn() };

test('a conference with MENU_PROMPT puts that prompt, MCI parsed, on the door\'s prompt row', async () => {
  flags.menuPrompt = 'In ~CN>';
  expect(await menuPromptTextAsync(session)).toBe('In Lounge> ');
  await menuAnswer('OPEN MAIN', ctx);
  expect(fs.readFileSync(path.join(root, 'Node2/menu-main.cat'), 'latin1')).toContain('\nP In Lounge> \n');
});
