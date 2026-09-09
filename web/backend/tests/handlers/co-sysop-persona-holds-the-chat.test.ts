/**
 * THE PERSONA A CALLER CHOSE IS THE ONE THAT ANSWERS - and it is still the
 * one answering three messages later, and after a deploy.
 *
 * Driven through the real handler, the way `operator-chat-bot-answers` drives
 * it: a page, the timeout, the co-sysop taking it, the caller typing. No API
 * key, as on the live board, so every reply is the persona's own fallback
 * line - which is exactly the case the design says is easy to forget, because
 * a persona without its own would start talking like Kevin.
 *
 * The one that would rot silently is the RESTART: it only shows up on a
 * deploy during a live chat.
 */
process.env.SKIP_DB_INIT = '1';
// NOTHING OUTSIDE ANSWERS HERE. Every provider falls back to its key in the
// environment, so a developer with OPENROUTER_API_KEY set had this suite
// asking a real model - and a persona's fallback lines are exactly what
// cannot be asserted while a model is answering. This is also the live
// board's own case: its openrouter_api_key is empty.
/**
 * NOTHING OUTSIDE ANSWERS HERE, and the environment cannot make it.
 *
 * Clearing `OPENROUTER_API_KEY` is not enough: `src/database.ts` runs
 * `dotenv.config({ override: true })` when it is first required, which is
 * during the first `require` of the handler - so `.env.local`'s key came back
 * AFTER the test had emptied it, and a real model answered. It answered in
 * DOC's voice, which is the wiring working and the assertion being untestable.
 *
 * The wire is cut instead. Every provider goes out through axios; with axios
 * refusing, the cascade fails the way it does on a board with no key - which
 * is the live board's own case - and what the caller hears is the persona's
 * own fallback line, which is what this suite is about.
 */
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(async () => { throw new Error('this suite reaches no network'); }),
    get: jest.fn(async () => { throw new Error('this suite reaches no network'); }),
  },
}));
jest.setTimeout(30000);

import Database from 'better-sqlite3';
import { OperatorChatRepository } from '../../src/database/operator-chat.repository';
import { registerConnectionEmitter } from '../../src/server/session-emitter-registry';
import { userSessions } from '../../src/server/session-manager';
import { personaBySlug, PRESET_PERSONAS } from '../../src/handlers/sysop-ai/personas';
import { personaFromDraft } from '../../src/handlers/sysop-ai/persona-composer';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(what: string, ok: () => boolean, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (ok()) return;
    await wait(25);
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for: ${what}`);
}

function makeWorld(options: { callerPersona?: string; boardPersona?: string } = {}) {
  const db = new Database(':memory:');
  const repo = new OperatorChatRepository(db);
  repo.updateConfig({
    enabled: true, pageTimeout: 1, aiEnabled: true, aiProvider: 'openrouter',
    openRouterApiKey: '', botThinkTime: 0, botTypingSpeed: 1, botTypoProbability: 0,
    allowedSecLevels: [], aiPersona: options.boardPersona ?? '',
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
    // The caller's own choice lives on his user record, the way `screenTheme`
    // does - see database/user-repository.ts.
    user: { id: 'u-caller', username: 'Caller', secLevel: 50, aiPersona: options.callerPersona ?? '' },
    nodeId: 1, connectionType: 'web', currentConf: 1, currentConfName: 'General',
    tempData: {}, subState: 'LOGGED_ON',
  };
  registerConnectionEmitter(session, { emit: (e: string, d: unknown) => { if (e === 'ansi-output') seen.push(String(d)); } } as any);
  userSessions.set('u-caller', session);
  const socket: any = { id: 's1', emit() {}, on() {}, join() {}, session };
  return { repo, db, io, session, socket, seen };
}

const plain = (chunks: string[]) =>
  chunks.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b[78]/g, '');

/** Every line the bot has actually saved on this page, in order. */
const botLines = (repo: OperatorChatRepository, pageId: string) =>
  repo.getChatMessages(pageId).filter((m) => m.senderId === 'bot').map((m) => m.message);

describe('the co-sysop the caller chose is the one that picks up', () => {
  afterEach(() => {
    // The page-timeout interval is module state; a suite that leaves it
    // running keeps jest alive and takes over the next suite's pages.
    try { require('../../src/handlers/operator-chat.handler').stopOperatorChatHandler(); } catch { /* not loaded */ }
    userSessions.clear();
  });

  it('answers as SABLE, in SABLE\'s words, when the caller chose SABLE', async () => {
    const H = require('../../src/handlers/operator-chat.handler');
    const w = makeWorld({ callerPersona: 'sable' });
    H.initOperatorChatHandler(w.io, w.repo);

    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    const pageId = w.session.tempData.pageId;
    await until('the co-sysop to take the page', () => w.repo.getPageRequest(pageId)?.sysopId === 'bot');

    const sable = personaBySlug('sable')!;
    // THE PIN. The handle on the row is what recovers the persona later, so
    // it has to be the persona's own and not the admin's default.
    expect(w.repo.getPageRequest(pageId)!.sysopHandle).toBe('SABLE');

    await until('the opening line to be saved', () => botLines(w.repo, pageId).length > 0);
    expect(sable.openingLines).toContain(botLines(w.repo, pageId)[0]);
    expect(personaBySlug('kevin')!.openingLines).not.toContain(botLines(w.repo, pageId)[0]);

    // No key, so nothing outside answers - and the caller hears SABLE saying
    // so, not Kevin.
    await H.handleUserChatMessage(w.io, w.repo, w.session, 'are you there');
    await until('a reply', () => botLines(w.repo, pageId).length > 1);
    const reply = botLines(w.repo, pageId)[1];
    expect(sable.fallbackLines).toContain(reply);
    expect(personaBySlug('kevin')!.fallbackLines).not.toContain(reply);
    // And it reaches the caller's screen, a character at a time, so the wait
    // is for the last of them rather than for the row.
    await until('the reply to finish typing to the caller', () => plain(w.seen).includes(reply));
    // The board's own start line names whoever picked up.
    expect(plain(w.seen)).toContain('This is SABLE, How can I help you??');
  });

  it("uses the BOARD's default when the caller has not chosen", async () => {
    const H = require('../../src/handlers/operator-chat.handler');
    const w = makeWorld({ boardPersona: 'nine' });
    H.initOperatorChatHandler(w.io, w.repo);

    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    const pageId = w.session.tempData.pageId;
    await until('the co-sysop to take the page', () => w.repo.getPageRequest(pageId)?.sysopId === 'bot');
    expect(w.repo.getPageRequest(pageId)!.sysopHandle).toBe('NINE');
  });

  it('still answers as Kevin when nobody chose anything', async () => {
    const H = require('../../src/handlers/operator-chat.handler');
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);

    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    const pageId = w.session.tempData.pageId;
    await until('the co-sysop to take the page', () => w.repo.getPageRequest(pageId)?.sysopId === 'bot');
    // `aiSysopName` is still what the default co-sysop is called: a sysop who
    // renamed him keeps that name.
    expect(w.repo.getPageRequest(pageId)!.sysopHandle).toBe('Kevin');
  });

  it('gives one voice for a whole chat when the caller chose Random', async () => {
    const H = require('../../src/handlers/operator-chat.handler');
    const w = makeWorld({ callerPersona: 'random' });
    H.initOperatorChatHandler(w.io, w.repo);

    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    const pageId = w.session.tempData.pageId;
    await until('the co-sysop to take the page', () => w.repo.getPageRequest(pageId)?.sysopId === 'bot');

    const rolled = personaBySlug(
      PRESET_PERSONAS.find((p) => p.handle === w.repo.getPageRequest(pageId)!.sysopHandle)?.slug ?? '',
    );
    expect(rolled).not.toBeNull();

    await until('the opening line', () => botLines(w.repo, pageId).length > 0);
    for (const line of ['one', 'two', 'three']) {
      const before = botLines(w.repo, pageId).length;
      await H.handleUserChatMessage(w.io, w.repo, w.session, line);
      await until(`the reply to "${line}"`, () => botLines(w.repo, pageId).length > before);
    }

    // The roll happened when the page was taken and is fixed for the chat: a
    // persona that changed between one line and the next would read as the
    // board being broken, not as a feature.
    for (const said of botLines(w.repo, pageId)) {
      expect([...rolled!.openingLines, ...rolled!.fallbackLines]).toContain(said);
    }
    expect(w.repo.getChatMessages(pageId).filter((m) => m.senderId === 'bot')
      .every((m) => m.senderHandle === rolled!.handle)).toBe(true);
  });

  it('can pick a DIFFERENT one the next time he pages', async () => {
    // The other half of the feature, and the half a handler that always
    // answered "Kevin" would still pass without: the roll has to actually
    // happen. Six callers on `random` landing on one persona is a one in two
    // million coincidence, so a run of six identical handles is the bug.
    const H = require('../../src/handlers/operator-chat.handler');
    const w = makeWorld({ callerPersona: 'random' });
    H.initOperatorChatHandler(w.io, w.repo);

    const handles = new Set<string>();
    const pageIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const caller: any = {
        user: { id: `u-${i}`, username: `Caller${i}`, secLevel: 50, aiPersona: 'random' },
        nodeId: i + 1, connectionType: 'web', currentConf: 1, currentConfName: 'General',
        tempData: {}, subState: 'LOGGED_ON',
      };
      registerConnectionEmitter(caller, { emit() {} } as any);
      userSessions.set(`u-${i}`, caller);
      const sock: any = { id: `s-${i}`, emit() {}, on() {}, join() {}, session: caller };
      await H.handlePageSysop(sock, caller, w.io, w.repo);
      pageIds.push(caller.tempData.pageId);
    }
    for (const id of pageIds) {
      await until('the co-sysop to take the page', () => w.repo.getPageRequest(id)?.sysopId === 'bot');
      handles.add(w.repo.getPageRequest(id)!.sysopHandle!);
    }
    expect(handles.size).toBeGreaterThan(1);
  });

  it('keeps the persona it started with after the board restarts mid-chat', async () => {
    const w = makeWorld({ callerPersona: 'doc' });
    let pageId = '';
    await new Promise<void>((done) => {
      jest.isolateModules(async () => {
        const H = require('../../src/handlers/operator-chat.handler');
        H.initOperatorChatHandler(w.io, w.repo);
        await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
        pageId = w.session.tempData.pageId;
        await until('the co-sysop to take the page', () => w.repo.getPageRequest(pageId)?.sysopId === 'bot');
        await until('the opening line', () => botLines(w.repo, pageId).length > 0);
        done();
      });
    });
    expect(w.repo.getPageRequest(pageId)!.sysopHandle).toBe('DOC');

    // A NEW process: the same DB row, an empty activeChatSessions. A roll
    // held only in memory would hand the caller a different sysop here.
    await new Promise<void>((done) => {
      jest.isolateModules(async () => {
        const H2 = require('../../src/handlers/operator-chat.handler');
        H2.initOperatorChatHandler(w.io, w.repo);
        w.session.tempData = { pageId };
        const before = botLines(w.repo, pageId).length;
        await H2.handleUserChatMessage(w.io, w.repo, w.session, 'still there?');
        await until('a reply after the restart', () => botLines(w.repo, pageId).length > before);
        done();
      });
    });

    const afterRestart = botLines(w.repo, pageId).slice(-1)[0];
    expect(personaBySlug('doc')!.fallbackLines).toContain(afterRestart);
    expect(personaBySlug('kevin')!.fallbackLines).not.toContain(afterRestart);
  });
});

describe('the personas the sysop writes', () => {
  function repo() {
    return new OperatorChatRepository(new Database(':memory:'));
  }

  const draft = {
    handle: 'PROTO', name: 'Pia Rauta', trade: 'Musician',
    temperament: { warmth: 'warm', patience: 'patient', length: 'terse', register: 'slangy' },
    alwaysBringsUp: 'ProTracker',
  } as const;

  it('round-trip through the database with their lines intact', () => {
    const r = repo();
    r.savePersona({ ...personaFromDraft(draft as never), trade: 'Musician', temperament: draft.temperament, catchphrase: '', alwaysBringsUp: 'ProTracker', refusesToDiscuss: '' } as never);
    const back = r.getPersona('proto')!;
    expect(back.handle).toBe('PROTO');
    expect(back.alwaysBringsUp).toBe('ProTracker');
    expect(back.openingLines.length).toBeGreaterThan(0);
    expect(back.fallbackLines.length).toBeGreaterThan(0);
    expect(r.listPersonas().map((p) => p.slug)).toEqual(['proto']);
  });

  it("cannot take a preset's slug", () => {
    const r = repo();
    expect(() => r.savePersona({ ...personaFromDraft(draft as never), slug: 'sable' } as never))
      .toThrow(/built-in/i);
  });

  it("cannot take a preset's handle", () => {
    // The handle is the pin: two personas sharing one would resolve to the
    // wrong character after a deploy.
    const r = repo();
    expect(() => r.savePersona({ ...personaFromDraft({ ...draft, handle: 'SABLE' } as never) } as never))
      .toThrow(/built-in/i);
  });

  it("cannot take another board persona's handle either", () => {
    const r = repo();
    r.savePersona({ ...personaFromDraft(draft as never) } as never);
    expect(() => r.savePersona({ ...personaFromDraft({ ...draft, handle: 'proto' } as never), slug: 'other' } as never))
      .toThrow(/already exists/i);
  });

  it('cannot delete a preset', () => {
    const r = repo();
    expect(() => r.deletePersona('kevin')).toThrow(/cannot be deleted/i);
    expect(personaBySlug('kevin')).not.toBeNull();
  });

  it('can delete one the sysop wrote', () => {
    const r = repo();
    r.savePersona({ ...personaFromDraft(draft as never) } as never);
    expect(r.deletePersona('proto')).toBe(true);
    expect(r.getPersona('proto')).toBeNull();
  });
});
