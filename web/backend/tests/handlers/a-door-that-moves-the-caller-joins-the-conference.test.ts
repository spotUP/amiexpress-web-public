/**
 * A door that moves the caller (AREXX BBSJOINCONF, the TypeScript door API)
 * set currentConf and nothing else: joinedConf, the rejoin conference, the
 * conference's account counters and the read pointers all stayed on the old
 * conference, so the next scan or post landed where the caller no longer
 * was. XIM PRV_GROUP moved the caller too, where express.e (3819-3830) only
 * renames a conference entry.
 */
jest.mock('../../src/utils/message-pointers.util');

import * as pointers from '../../src/utils/message-pointers.util';
import { setConferences, setMessageBases } from '../../src/handlers/operations/conference.handler';
import { BBSApi } from '../../src/doors/BBSApi';
import { XIMSystemCommandsHandler } from '../../src/amiga-emulation/xim/system-commands';

/* eslint-disable @typescript-eslint/no-explicit-any */
function caller(): any {
  return {
    user: { id: 'u1', username: 'caller', confAccess: 'XX_' },
    currentConf: 1,
    currentMsgBase: 10,
    currentConfName: 'Main',
    joinedConf: { conf: 1, msgBase: 10 },
  };
}

beforeEach(() => {
  setConferences([{ id: 1, name: 'Main' }, { id: 2, name: 'Amiga' }, { id: 3, name: 'Closed' }]);
  setMessageBases([
    { id: 10, name: 'Main', conferenceId: 1 },
    { id: 20, name: 'Amiga', conferenceId: 2 },
    { id: 30, name: 'Closed', conferenceId: 3 },
  ]);
  (pointers.loadMsgPointers as jest.Mock).mockResolvedValue({ lastMsgReadConf: 7, lastNewReadConf: 7 });
  (pointers.getMailStatFile as jest.Mock).mockResolvedValue(null);
});

test('the door API join leaves the caller standing in the new conference, pointers and account included', async () => {
  const session = caller();
  const api = new BBSApi({ on: jest.fn(), off: jest.fn(), emit: jest.fn() } as any, session);
  expect(await api.joinConference(2)).toBe(true);
  expect(session.currentConf).toBe(2);
  expect(session.currentConfName).toBe('Amiga');
  expect(session.joinedConf).toEqual({ conf: 2, msgBase: 20 });
  expect(session.lastMsgReadConf).toBe(7);
  expect(pointers.saveConferenceAccount).toHaveBeenCalledWith(session, 1);
  expect(pointers.loadConferenceAccount).toHaveBeenCalledWith(session, 2);
});

test('an AREXX BBSJOINCONF into a conference the caller has no access to leaves them where they were', async () => {
  const { BBSFunctions } = require('../../src/services/arexx.service');
  const session = caller();
  const fns = Object.create(BBSFunctions.prototype);
  fns.context = { session };
  expect(await fns.BBSJOINCONF(3)).toBe(false);
  expect(session.currentConf).toBe(1);
  expect(await fns.BBSJOINCONF(2)).toBe(true);
  expect(session.joinedConf).toEqual({ conf: 2, msgBase: 20 });
});

test('XIM PRV_GROUP renames the conference and never moves the caller', () => {
  const bbs: any = { conferenceId: 2, conferenceName: 'Amiga' };
  const handler = Object.create(XIMSystemCommandsHandler.prototype);
  handler.bbsSession = bbs;
  handler.getMessageString = () => '1 Amiga Scene'.padEnd(40, ' ').slice(0, 39) + '\0' + 'BBS:Conf2/';
  handler.reply = jest.fn();
  handler.handlePrvGroup({} as any);
  expect(bbs.conferenceId).toBe(2);
  expect(bbs.currentConf).toBeUndefined();
  expect(bbs.conferenceName.trim()).toBe('Amiga Scene');
  expect(bbs.conferencePath).toBe('BBS:Conf2/');
});
