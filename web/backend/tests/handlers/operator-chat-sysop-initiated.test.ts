/**
 * P2-8 (express-parity-100 plan): ACP SV_CHAT, the SYSOP-INITIATED direction.
 *
 * api/node-control-routes.ts:239-245 used to 501 unconditionally - "nothing
 * subscribes to the supervisor channel, so the node never hears it". That was
 * true for every OTHER SV_* button (they targeted an Amiga console concept
 * this port has no counterpart for) but not for SV_CHAT: express.e:1411-1412
 * (`IF logonType<>LOGON_TYPE_LOGGED_OFF THEN servercmd:=SV_CHAT`) and
 * express.e:7845-7862 (`chatF:=1; chatFlag:=Not(chatFlag)`, then chat() or
 * tranChat()) are a real, portable behaviour: SV_CHAT toggles a chat with
 * whoever is logged on to a node. ACP.e:1005-1013 (register()/sendMessage())
 * is the generic message port every SV_* command travels over to reach that
 * express.e code.
 *
 * This exercises `initiateSysopChat` directly - the same acceptPage()/
 * endChat()/activeChatSessions machinery the caller-initiated Page Sysop
 * command already uses (see operator-chat-quit-returns-to-the-prompt.test.ts
 * for that side), not a parallel implementation.
 */
process.env.SKIP_DB_INIT = '1';
jest.setTimeout(20000);

import Database from 'better-sqlite3';
import { OperatorChatRepository } from '../../src/database/operator-chat.repository';
import { registerConnectionEmitter } from '../../src/server/session-emitter-registry';
import { sessions, userSessions } from '../../src/server/session-manager';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeWorld(nodeId: number, userId: string) {
  const db = new Database(':memory:');
  const repo = new OperatorChatRepository(db);
  repo.updateConfig({
    enabled: true, pageTimeout: 1, aiEnabled: false, aiProvider: 'rule-based',
    openRouterApiKey: '', botThinkTime: 0, botTypingSpeed: 1, botTypoProbability: 0,
    allowedSecLevels: [], pageCooldown: 0,
  } as any);
  const rooms = new Map<string, Set<string>>();
  const io: any = {
    fetchSockets: async () => [], on() {}, emit() {},
    to: () => ({ emit() {} }), in: () => ({ emit() {} }),
    sockets: { adapter: { rooms }, sockets: new Map() },
  };
  io.of = () => io;
  const seen: string[] = [];
  const session: any = {
    user: { id: userId, username: 'Caller', secLevel: 50, expert: 'Y' }, nodeId,
    connectionType: 'telnet', currentConf: 1, currentConfName: 'General', tempData: {}, subState: 'LOGGED_ON',
    inputBuffer: '',
  };
  const collect = (e: string, d: unknown) => { if (e === 'ansi-output') seen.push(String(d)); };
  registerConnectionEmitter(session, { emit: collect, on() {}, listenerCount: () => 0 } as any);
  userSessions.set(userId, session);
  sessions.set(String(nodeId), session);
  return { repo, io, session, seen };
}

const H = require('../../src/handlers/operator-chat.handler');
afterEach(() => H.stopOperatorChatHandler());

describe('SV_CHAT — sysop-initiated chat (P2-8)', () => {
  it('express.e:1411-1412 — a node with nobody logged on is a no-op, not a chat', async () => {
    const { repo, io } = makeWorld(9, 'u-none');
    sessions.delete('9'); // nobody on this node at all

    const result = await H.initiateSysopChat(io, repo, 9, 'sysop-1', 'TheAdmin', 'admin:sysop-1');

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no caller logged on/i);
    expect(H.getActiveChatSessions().size).toBe(0);
  });

  it('express.e:7845-7862 — opens a chat with whoever is on the node, via acceptPage', async () => {
    const { repo, io, session, seen } = makeWorld(2, 'u-open');

    const result = await H.initiateSysopChat(io, repo, 2, 'sysop-1', 'TheAdmin', 'admin:sysop-1');

    expect(result.success).toBe(true);
    expect(result.ended).toBeFalsy();
    expect(result.pageId).toBeDefined();
    expect(H.getActiveChatSessions().has(result.pageId)).toBe(true);
    expect(session.subState).toBe(LoggedOnSubState.OPERATOR_CHAT_ACTIVE);
    // acceptPage's own greeting (express.e:6085-6094), reused unmodified -
    // it names the board's configured sysop_name, not the admin's own login.
    expect(seen.join('')).toMatch(/This is .+, How can I help you\?\?/);
  });

  it('chatFlag:=Not(chatFlag) — a second SV_CHAT on the same node ENDS the chat, by node not by sysop', async () => {
    const { repo, io, session, seen } = makeWorld(3, 'u-toggle');

    const opened = await H.initiateSysopChat(io, repo, 3, 'sysop-1', 'TheAdmin', 'admin:sysop-1');
    expect(opened.success).toBe(true);
    const before = seen.length;

    // A DIFFERENT sysop id toggles it off - express.e's flag is per-node, not
    // per-console-identity, so this must still end it.
    const closed = await H.initiateSysopChat(io, repo, 3, 'sysop-2', 'OtherAdmin', 'admin:sysop-2');

    expect(closed.success).toBe(true);
    expect(closed.ended).toBe(true);
    expect(closed.pageId).toBe(opened.pageId);
    expect(H.getActiveChatSessions().has(opened.pageId!)).toBe(false);
    // endChat's own exit text (already regression-tested for the caller side).
    expect(seen.slice(before).join('')).toContain('Ending Chat.');
    expect(session.subState).toBe(LoggedOnSubState.READ_COMMAND);
  });

  it('caller inside a door — queues instead of painting over the door, then opens once they return', async () => {
    const { repo, io, session } = makeWorld(4, 'u-door');
    session.subState = LoggedOnSubState.DOOR_RUNNING;

    const queued = await H.initiateSysopChat(io, repo, 4, 'sysop-1', 'TheAdmin', 'admin:sysop-1');

    expect(queued.success).toBe(true);
    expect(queued.queued).toBe(true);
    expect(queued.message).toMatch(/inside a door/i);
    // Not open yet - the door still owns the keyboard and the screen.
    expect(H.getActiveChatSessions().has(queued.pageId!)).toBe(false);

    // The caller returns to a prompt; the existing checkPageTimeouts poll
    // (already running from initOperatorChatHandler, unref'd, 1s interval)
    // drains pendingSysopAccepts without any new code for this test to call.
    H.initOperatorChatHandler(io, repo);
    session.subState = LoggedOnSubState.READ_COMMAND;
    await wait(1500);

    expect(H.getActiveChatSessions().has(queued.pageId!)).toBe(true);
  });
});
