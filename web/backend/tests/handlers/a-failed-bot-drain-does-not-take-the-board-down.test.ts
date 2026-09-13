/**
 * processBotQueue is async, and every one of its three call sites dropped the
 * promise it returns. Its body can reject before the inner .catch is attached -
 * the page read, the persona read, the retrieval - and a dropped rejection is
 * an unhandled rejection, which on this Node takes the whole board down: every
 * caller on every node, because one caller's queued line failed to drain.
 *
 * The same drop left `botBusy` true, so even surviving the throw the chat was
 * finished: every later line the caller typed queued behind a bot that was
 * never going to answer.
 *
 * Driven through the real handler. The seam is the repository: the drain reads
 * the page row, and a board whose DB has gone away throws exactly there.
 */
process.env.SKIP_DB_INIT = '1';
jest.setTimeout(30000);

import Database from 'better-sqlite3';
import { OperatorChatRepository } from '../../src/database/operator-chat.repository';
import { registerConnectionEmitter } from '../../src/server/session-emitter-registry';
import { userSessions } from '../../src/server/session-manager';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(what: string, ok: () => boolean, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (ok()) return;
    await wait(25);
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for: ${what}`);
}

function makeWorld() {
  const db = new Database(':memory:');
  const repo = new OperatorChatRepository(db);
  repo.updateConfig({
    enabled: true, pageTimeout: 1, aiEnabled: true, aiProvider: 'openrouter',
    openRouterApiKey: '', botThinkTime: 0, botTypingSpeed: 1, botTypoProbability: 0, allowedSecLevels: [],
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
    user: { id: 'u-caller', username: 'Caller', secLevel: 50 }, nodeId: 1,
    connectionType: 'web', currentConf: 1, currentConfName: 'General', tempData: {}, subState: 'LOGGED_ON',
  };
  registerConnectionEmitter(session, { emit: (e: string, d: unknown) => { if (e === 'ansi-output') seen.push(String(d)); } } as any);
  userSessions.set('u-caller', session);
  const socket: any = { id: 's1', emit() {}, on() {}, join() {}, session };
  return { repo, io, session, socket, seen };
}

describe('a bot queue that fails to drain', () => {
  let unhandled: unknown[] = [];
  const record = (err: unknown) => { unhandled.push(err); };

  beforeEach(() => { unhandled = []; process.on('unhandledRejection', record); });
  afterEach(() => {
    process.off('unhandledRejection', record);
    const H = require('../../src/handlers/operator-chat.handler');
    H.stopOperatorChatHandler();
  });

  it('does not become an unhandled rejection, and frees the caller', async () => {
    const H = require('../../src/handlers/operator-chat.handler');
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);

    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    const pageId = w.session.tempData.pageId;
    await until('the bot to take the page',
      () => w.repo.getPageRequest(pageId)?.sysopId === 'bot');

    // First line: the bot answers it, and drains the queue when it is done.
    void H.handleUserChatMessage(w.io, w.repo, w.session, 'first');
    await until('the bot to be busy answering',
      () => (H.getActiveChatSessions().get(pageId) as any)?.botBusy === true);

    // Second line, typed while the bot is still talking: it goes on the queue,
    // and is what the drain will pick up.
    void H.handleUserChatMessage(w.io, w.repo, w.session, 'second');
    await until('the second line to reach the queue',
      () => ((H.getActiveChatSessions().get(pageId) as any)?.botQueue ?? []).length > 0);

    // The board loses its database between the reply and the drain.
    const boom = new Error('database is closed');
    (w.repo as any).getPageRequest = () => { throw boom; };

    await until('the drain to fail and the caller to be freed',
      () => (H.getActiveChatSessions().get(pageId) as any)?.botBusy === false);

    // Give a rejection that escaped one more turn to be reported.
    await wait(200);
    expect(unhandled).toEqual([]);
  });
});
