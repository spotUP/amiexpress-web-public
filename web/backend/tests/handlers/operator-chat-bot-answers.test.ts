/**
 * The grumpy bot answers a caller, in the right order, and after a restart.
 *
 * Both reported live on 2026-09-07 - "the operator chat has layout issues
 * when the ai answers and currently neither the openrouter ai or the grumpy
 * sysop answers" - and both driven here through the real handler: a page,
 * the timeout, the bot taking it, the caller typing. No API key, as on the
 * live board (its openrouter_api_key was empty), so the reply is the
 * rule-based one; what is asserted is that a reply ARRIVES, and where.
 *
 * Order: botBusy was set the moment the caller's message came in, and the
 * caller's own echo was queued behind it - so the screen showed the reply,
 * then two lines later the question. The caller's line goes out first now.
 *
 * Restart: activeChatSessions is memory. The board restarts on every deploy
 * (eight times that night), the page stays `accepted` by `bot` in the DB,
 * and every line the caller typed afterwards hit "Chat session not found"
 * and vanished. The session is rebuilt from the row now.
 */
process.env.SKIP_DB_INIT = '1';
jest.setTimeout(20000);

import Database from 'better-sqlite3';
import { OperatorChatRepository } from '../../src/database/operator-chat.repository';
import { registerConnectionEmitter } from '../../src/server/session-emitter-registry';
import { userSessions } from '../../src/server/session-manager';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeWorld() {
  const db = new Database(':memory:');
  const repo = new OperatorChatRepository(db);
  repo.updateConfig({
    enabled: true, pageTimeout: 1, aiEnabled: true, aiProvider: 'openrouter',
    openRouterApiKey: '', botThinkTime: 0, botTypingSpeed: 1, botTypoProbability: 0, allowedSecLevels: [],
  } as any);
  // botTypingSpeed 1: the bot TYPES its reply now (grumpy-bot-types-live), and
  // this suite is about order and survival, not pace - at 200 ms a character
  // the reply had not reached its tag inside the wait under a loaded worker.
  const rooms = new Map<string, Set<string>>();
  const io: any = {
    fetchSockets: async () => [], on() {}, emit() {},
    to: () => ({ emit() {} }), in: () => ({ emit() {} }),
    sockets: { adapter: { rooms }, sockets: new Map() },
  };
  io.of = () => io;
  const seen: string[] = [];
  const session: any = {
    user: { id: 'u-caller', username: 'Caller', secLevel: 50 }, nodeId: 1,
    connectionType: 'web', currentConf: 1, currentConfName: 'General', tempData: {}, subState: 'LOGGED_ON',
  };
  registerConnectionEmitter(session, { emit: (e: string, d: unknown) => { if (e === 'ansi-output') seen.push(String(d)); } } as any);
  userSessions.set('u-caller', session);
  const socket: any = { id: 's1', emit() {}, on() {}, join() {}, session };
  return { repo, io, session, socket, seen };
}

const plain = (chunks: string[]) =>
  chunks.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b[78]/g, '');

/** How a bot line announces itself, whichever engine wrote it. */
const BOT_REPLY = /\[(AI|RB)\]/;

describe('the grumpy bot answers a caller', () => {
  it('and the caller reads their own line before the reply', async () => {
    const H = require('../../src/handlers/operator-chat.handler');
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);

    const paged = await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    expect(paged.success).toBe(true);
    await wait(3000);                                  // past the 1s timeout, and the opening line
    expect(w.repo.getPageRequest(w.session.tempData.pageId)!.sysopHandle).toBe('GrumpyBot');

    // The caller types their line as the chat branch drives it, then return.
    for (const ch of 'hello grumpy') H.callerTypedChar(w.io, w.session, ch);
    H.callerPressedReturn(w.io, w.session);
    const before = w.seen.length;
    await H.handleUserChatMessage(w.io, w.repo, w.session, 'hello grumpy');
    await wait(2500);
    const text = plain(w.seen.slice(before));

    // The caller's own line, and the return that ended it, went out from the
    // chat branch as they typed (express.e:6172, 6138); what arrives now is
    // the reply, a character at a time, the sysop colour first (6164-6167).
    expect(w.seen[before]).toMatch(/^\x1b\[36m.$/);
    // EITHER TAG. The bot answers `[AI] ...` when the provider cascade
    // returns something and `[RB] ...` when it falls back to the rule-based
    // replies (grumpy-sysop-bot.handler.ts:861,870). Which engine served the
    // line is a configuration detail; what this test is about is that a reply
    // came at all, without the caller pressing a key.
    expect(text).toMatch(BOT_REPLY);
  });

  it('after the board restarts mid-chat', async () => {
    const w = makeWorld();
    let pageId = '';
    await new Promise<void>((done) => {
      jest.isolateModules(async () => {
        const H = require('../../src/handlers/operator-chat.handler');
        H.initOperatorChatHandler(w.io, w.repo);
        await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
        pageId = w.session.tempData.pageId;
        await wait(3000);
        done();
      });
    });
    expect(w.repo.getPageRequest(pageId)!.sysopId).toBe('bot');

    // A NEW process: the same DB, an empty activeChatSessions.
    const before = w.seen.length;
    await new Promise<void>((done) => {
      jest.isolateModules(async () => {
        // The new process knows the caller too - they logged back in. The
        // isolated module graph has its own session registry, so the login
        // is redone against it; what must NOT be redone is anything about
        // the chat, which only the DB row remembers.
        const reg2 = require('../../src/server/session-emitter-registry');
        const sm2 = require('../../src/server/session-manager');
        reg2.registerConnectionEmitter(w.session, { emit: (e: string, d: unknown) => { if (e === 'ansi-output') w.seen.push(String(d)); } });
        sm2.userSessions.set('u-caller', w.session);
        const H2 = require('../../src/handlers/operator-chat.handler');
        await H2.handleUserChatMessage(w.io, w.repo, w.session, 'still there?');
        await wait(2500);
        done();
      });
    });
    const text = plain(w.seen.slice(before));
    expect(text).toMatch(BOT_REPLY);
  });
});
