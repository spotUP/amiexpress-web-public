/**
 * GrumpyBot types its reply, live, in place - and the caller keeps the cursor.
 *
 * The character-by-character typing was removed in 18229ceb5 because it
 * redrew line 23 on every keystroke (`ESC[2K` + the whole buffer) and then
 * cleared and rewrote the finished line: a flicker per character, over a line
 * the caller's own message had just been committed to. The sysop wants the
 * typing back (2026-09-07: "we have lost the live typing for the ai sysops
 * probably in a try to fix the broken layout they had"), so it is back in a
 * form that cannot flicker: each character is appended where the cursor is,
 * a typo is undone with a real backspace, and the finished line is scrolled
 * up with `\r\n` from the bottom of the region - never cleared, never
 * redrawn. Every chunk ends by returning the cursor to the caller's input on
 * line 24.
 *
 * Two layers: the plan (pure, a seeded rng, applying it yields the text) and
 * the rendering through the real handler onto a caller's emitter.
 */
process.env.SKIP_DB_INIT = '1';
jest.setTimeout(20000);

import Database from 'better-sqlite3';
import { OperatorChatRepository } from '../../src/database/operator-chat.repository';
import { registerConnectionEmitter } from '../../src/server/session-emitter-registry';
import { userSessions } from '../../src/server/session-manager';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { planNaturalTyping, applyTypingPlan } from '../../src/handlers/grumpy-sysop-bot.handler';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('the typing plan', () => {
  it('with no typos types the text in order, one character per event', () => {
    const plan = planNaturalTyping('Read the docs.', { typingSpeed: 10, typoProbability: 0 }, () => 0.5);
    const chars = plan.filter((e) => e.kind === 'char').map((e) => (e as any).ch).join('');
    expect(chars).toBe('Read the docs.');
    expect(plan.some((e) => e.kind === 'backspace')).toBe(false);
    expect(applyTypingPlan(plan)).toBe('Read the docs.');
  });

  it('a typo is a neighbouring key, a pause, a backspace and the right key - and the line still comes out right', () => {
    // rng = 0 makes every eligible character a typo and picks the first neighbour.
    const plan = planNaturalTyping('Hi lamer', { typingSpeed: 10, typoProbability: 1 }, () => 0);
    expect(plan.filter((e) => e.kind === 'backspace').length).toBeGreaterThan(0);
    // H -> 'G' (uppercase neighbour), pause, backspace, 'H'
    expect(plan.slice(0, 5).map((e) => e.kind)).toEqual(['char', 'pause', 'backspace', 'pause', 'char']);
    expect((plan[0] as any).ch).toBe('G');
    expect((plan[4] as any).ch).toBe('H');
    expect(applyTypingPlan(plan)).toBe('Hi lamer');
  });

  it('never mistypes a space or punctuation', () => {
    const plan = planNaturalTyping('a, b. c!', { typingSpeed: 1, typoProbability: 1 }, () => 0);
    const typed = plan.filter((e) => e.kind === 'char').map((e) => (e as any).ch);
    // Every space and punctuation mark appears exactly once (never as a typo).
    expect(typed.filter((c) => c === ' ').length).toBe(2);
    expect(typed.filter((c) => /[,.!]/.test(c)).length).toBe(3);
    expect(applyTypingPlan(plan)).toBe('a, b. c!');
  });
});

function makeWorld() {
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
    user: { id: 'u-typed', username: 'Caller', secLevel: 50 }, nodeId: 1,
    connectionType: 'telnet', currentConf: 1, currentConfName: 'General', tempData: {}, subState: 'LOGGED_ON',
    inputBuffer: '',
  };
  const collect = (e: string, d: unknown) => { if (e === 'ansi-output') seen.push(String(d)); };
  registerConnectionEmitter(session, { emit: collect } as any);
  userSessions.set('u-typed', session);
  const socket: any = { id: 's-typed', emit: collect, on() {}, join() {}, rooms: new Set(), session };
  return { repo, io, session, socket, seen };
}

const H = require('../../src/handlers/operator-chat.handler');
afterEach(() => H.stopOperatorChatHandler());

describe('GrumpyBot types its reply to the caller', () => {
  it('one character at a time on line 23, never clearing the line, always giving the cursor back', async () => {
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    await wait(2600);
    const pageId = w.session.tempData.pageId;
    expect(w.repo.getPageRequest(pageId)!.sysopId).toBe('bot');

    // The caller is mid-word on line 24 while the bot answers.
    w.session.inputBuffer = 'ok';
    const before = w.seen.length;
    await H.handleUserChatMessage(w.io, w.repo, w.session, 'hello there');
    await wait(3500);
    const chunks = w.seen.slice(before);

    const reply = w.repo.getChatMessages(pageId).filter((m: any) => m.senderId === 'bot').pop()!.message as string;
    const typed = chunks.filter((c) => /^\x1b\[23;\d+H\x1b\[36m.\x1b\[0m/.test(c));
    // Typed, not pasted: at least a character per chunk, many chunks.
    expect(typed.length).toBeGreaterThanOrEqual(Math.min(20, reply.length));
    // What was typed IS the reply (wrapping may eat a space at a fold).
    const typedText = typed.map((c) => c.match(/\x1b\[36m(.)\x1b\[0m/)![1]).join('');
    expect(typedText.replace(/\s/g, '')).toBe(reply.replace(/\s/g, ''));
    // No chunk clears line 23 - that was the flicker.
    expect(chunks.some((c) => /\x1b\[23;\d+H\x1b\[2K/.test(c))).toBe(false);
    // Every typed chunk hands the cursor back to the caller's input: line 24, after "ok".
    for (const c of typed) expect(c.endsWith('\x1b[24;3H')).toBe(true);
    // The finished line is scrolled up from the bottom of the region.
    expect(chunks.some((c) => c.startsWith('\x1b[23;1H\r\n'))).toBe(true);
  });
});
