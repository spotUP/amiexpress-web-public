/**
 * Mail read in a message-base door stays read at the next join.
 *
 * The sysop, 2026-09-27: read the three messages in Console Demoscene through
 * SUBS, joined again, and the join still said "3 messages, 3 new for you".
 * SUBS had sent AEW_SETPOINTER `READ 168` / `SCAN 168`, and the board stored
 * them - under (conference 3, message base 3), the database id every board
 * reader uses. The next door launch loaded (conference 3, message base 1), a
 * row that did not exist, and told the door everything was new.
 *
 * The pointer store here is a real keyed map, so a load and a save that
 * disagree about the key fail exactly the way the live board did.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type Row = { lastMsgReadConf: number; lastNewReadConf: number };
const rows = new Map<string, Row>();
const key = (user: string, conf: number, base: number) => `${user}/${conf}/${base}`;
jest.mock('../../src/utils/message-pointers.util', () => ({
  loadConferenceAccount: jest.fn(),
  saveConferenceAccount: jest.fn(),
  loadMsgPointers: async (user: string, conf: number, base: number) => ({
    userId: user, conferenceId: conf, messageBaseId: base,
    ...(rows.get(key(user, conf, base)) ?? { lastMsgReadConf: 0, lastNewReadConf: 0 }),
  }),
  saveMsgPointers: async (c: any) => {
    rows.set(key(c.userId, c.conferenceId, c.messageBaseId), {
      lastMsgReadConf: c.lastMsgReadConf, lastNewReadConf: c.lastNewReadConf,
    });
  },
}));

jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
  ...jest.requireActual('../../src/handlers/command-handler/dependency-injection'),
  // Database ids, as the live board has them: one base per conference.
  getMessageBases: () => [
    { id: 1, conferenceId: 1, name: 'Main' },
    { id: 3, conferenceId: 3, name: 'Main' },
  ],
}));

/** What the door does each time it runs: the test sets it per launch. */
let doorBody: (session: any) => Promise<void> = async () => {};
jest.mock('../../src/handlers/door.handler', () => ({
  executeDoor: jest.fn(async (_socket: any, session: any) => doorBody(session)),
}));

jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  ...jest.requireActual('../../src/utils/conference-tooltypes.util'),
  getConferenceToolFlags: () => ({ custom: true }),
}));

import { runCustomMsgbaseCommand, MailFunction } from '../../src/services/custom-msgbase';
import { handleSetPointer } from '../../src/amiga-emulation/xim/msgpointer';
import { config } from '../../src/config';

let root: string;
let previousDataDir: string;

beforeAll(() => {
  previousDataDir = config.get('dataDir');
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-pointer-'));
  fs.writeFileSync(
    path.join(root, 'ConfConfig.info'),
    ['NCONFS=3', 'NAME.1=Main', 'LOCATION.1=BBS:Conf1/', 'NAME.2=C64', 'LOCATION.2=BBS:Conf2/',
      'NAME.3=Console Demoscene', 'LOCATION.3=BBS:Conf3/', ''].join('\n'),
    'utf8',
  );
  fs.mkdirSync(path.join(root, 'Doors', 'SUBS'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Doors', 'SUBS', 'subs'), '#!/bin/false\n', 'utf8');
  for (const conf of ['Conf1', 'Conf3']) {
    fs.mkdirSync(path.join(root, conf), { recursive: true });
    fs.writeFileSync(path.join(root, conf, 'MSGBASE.DEF.info'), 'LOCATION=BBS:Doors/SUBS/subs\nTYPE=XIM\n', 'utf8');
  }
  config.set('dataDir', root);
});

afterAll(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => rows.clear());

const standingIn = (conf: number): any => ({
  currentConf: conf, currentMsgBase: conf, nodeId: 3,
  user: { id: 'sysop', username: 'sysop', secLevel: 255 },
});

/** What the door would be told at LAST_SCANNED / LAST_READ on its next run. */
async function whatTheDoorSees(session: any, conf: number) {
  let seen: Row = { lastMsgReadConf: -1, lastNewReadConf: -1 };
  doorBody = async (s) => { seen = { lastMsgReadConf: s.lastMsgReadConf, lastNewReadConf: s.lastNewReadConf }; };
  await runCustomMsgbaseCommand({}, session, MailFunction.SCAN, conf, '');
  return seen;
}

describe('mail read in a message-base door', () => {
  it('is not new at the next join scan', async () => {
    const session = standingIn(3);
    doorBody = async (s) => {
      expect(await handleSetPointer('READ 168', s)).toBe(1);
      expect(await handleSetPointer('SCAN 168', s)).toBe(1);
    };
    await runCustomMsgbaseCommand({}, session, MailFunction.READ, 3, 'R');

    expect(await whatTheDoorSees(session, 3)).toEqual({ lastMsgReadConf: 168, lastNewReadConf: 168 });
  });

  it('lands on the conference the door was run for, not the one the caller stands in', async () => {
    // MS walks every conference from wherever the caller is.
    const caller = standingIn(1);
    doorBody = async (s) => { expect(await handleSetPointer('SCAN 40', s)).toBe(1); };
    await runCustomMsgbaseCommand({}, caller, MailFunction.SCAN, 3, '');

    expect((await whatTheDoorSees(standingIn(3), 3)).lastNewReadConf).toBe(40);
    expect((await whatTheDoorSees(standingIn(1), 1)).lastNewReadConf).toBe(0);
  });
});
