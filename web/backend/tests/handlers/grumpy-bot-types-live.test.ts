/**
 * The chat is express.e's one scrolling stream, and the bot types into it.
 *
 * express.e chat() (5860-6065): no clear, no scroll region, no input line.
 * The caller's keys echo where the cursor is; the other side's text arrives
 * WORD BY WORD (5966-5990) in the sender's colour, and around each incoming
 * word the receiver's half-typed word is rubbed out and put back (5968-5979).
 * This port had a split screen of its own invention until 2026-09-07 ("make
 * the flow of the chat 1:1 - ours dont feel like a real operator page chat
 * with the input at the bottom etc").
 *
 * Also here: the engine tag is ours and added once (the model copied it from
 * its history: "[AI] [AI] *grumble*"), and the bot's opening line is a
 * message it types, not a caption in the layout.
 */
process.env.SKIP_DB_INIT = '1';
jest.setTimeout(20000);

import Database from 'better-sqlite3';
import { OperatorChatRepository } from '../../src/database/operator-chat.repository';
import { registerConnectionEmitter } from '../../src/server/session-emitter-registry';
import { userSessions } from '../../src/server/session-manager';
import { planWordTyping, applyWordPlan, stripEngineTag, getGrumpySysopResponse } from '../../src/handlers/grumpy-sysop-bot.handler';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const INTRO = /is AFK|isn't answering|sysop is off doing|didn't answer your page/;

describe('the word plan', () => {
  it('with no typos is the text, one word at a time', () => {
    const plan = planWordTyping('Read the docs, kid.', { typingSpeed: 10, typoProbability: 0 }, () => 0.5);
    expect(plan.map((w) => w.word)).toEqual(['Read', 'the', 'docs,', 'kid.']);
    expect(plan.every((w) => w.typo === null)).toBe(true);
    expect(applyWordPlan(plan)).toBe('Read the docs, kid.');
    // A word takes time; punctuation adds a breath.
    expect(plan[3]!.beforeMs).toBeGreaterThan(plan[1]!.beforeMs);
  });

  it('a typo is one neighbouring key in one word, and the right word follows it', () => {
    const plan = planWordTyping('Hi lamer', { typingSpeed: 10, typoProbability: 1 }, () => 0);
    expect(plan[0]!.typo).not.toBeNull();
    expect(plan[0]!.typo).not.toBe(plan[0]!.word);
    expect(plan[0]!.typo!.length).toBe(plan[0]!.word.length);
    expect(plan[0]!.typoMs).toBeGreaterThan(0);
    expect(applyWordPlan(plan)).toBe('Hi lamer');
  });

  it('every pause scales with the typing speed', () => {
    const slow = planWordTyping('Well, no.', { typingSpeed: 40, typoProbability: 0 }, () => 0.5);
    const fast = planWordTyping('Well, no.', { typingSpeed: 1, typoProbability: 0 }, () => 0.5);
    const total = (p: typeof slow) => p.reduce((a, w) => a + w.beforeMs, 0);
    expect(total(fast) * 30).toBeLessThan(total(slow));
  });
});

describe('the engine tag', () => {
  it('is stripped from a model line, however many times it was copied', () => {
    expect(stripEngineTag('[AI] [AI] *grumble* OH, real mature.')).toBe('*grumble* OH, real mature.');
    expect(stripEngineTag('[RB] Read the docs.')).toBe('Read the docs.');
    expect(stripEngineTag('No tag here')).toBe('No tag here');
  });
  it('is added exactly once, in front, by us', async () => {
    const reply = await getGrumpySysopResponse('hi', {
      userHandle: 'Caller', nodeId: 1, conferenceName: 'General', timeOnline: 5,
      messageHistory: [{ role: 'bot', content: '[RB] [RB] earlier line' }],
    }, { provider: 'rule-based' });
    expect(reply).toMatch(/^\[RB\] (?!\[)/);
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
  registerConnectionEmitter(session, { emit: collect, on() {}, listenerCount: () => 0 } as any);
  userSessions.set('u-typed', session);
  const socket: any = { id: 's-typed', emit: collect, on() {}, join() {}, rooms: new Set(), session };
  return { repo, io, session, socket, seen };
}

const H = require('../../src/handlers/operator-chat.handler');
afterEach(() => H.stopOperatorChatHandler());

/** Bytes with every escape sequence and every erase run removed: what stays on the screen. */
const shown = (chunks: string[]) =>
  chunks.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x08 \x08/g, '');

describe('the chat is one stream', () => {
  it("opens the way express does, and the bot's first line is a message it types", async () => {
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    await wait(3500);
    const pageId = w.session.tempData.pageId;
    const all = w.seen.join('');

    // Nothing of the old split screen: no clear, no scroll region, no mouse, no line 23/24 positioning.
    expect(all).not.toContain('\x1b[2J');
    expect(all).not.toMatch(/\x1b\[\d+;\d+r/);
    expect(all).not.toContain('\x1b[?1000h');
    expect(all).not.toMatch(/\x1b\[2[34];\d+H/);
    // express.e:5899-5901, the built-in start line, then the sysop's colour.
    expect(all).toContain('This is GrumpyBot, How can I help you??');
    // The opening line is a message: saved, and on the screen after the start line.
    const messages = w.repo.getChatMessages(pageId);
    expect(messages.length).toBe(1);
    expect(messages[0].senderId).toBe('bot');
    expect(messages[0].message).toMatch(INTRO);
    const text = shown(w.seen);
    expect(text.indexOf('How can I help you??')).toBeLessThan(text.search(INTRO));
    expect(text.replace(/\s/g, '')).toContain(messages[0].message.replace(/\s/g, ''));
  });

  it("a reply arrives word by word, and the caller's half-typed word is rubbed out and put back around each", async () => {
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    await wait(3500);
    const pageId = w.session.tempData.pageId;

    // The caller typed a line, pressed return, and is two letters into the next one.
    const before = w.seen.length;
    await H.handleUserChatMessage(w.io, w.repo, w.session, 'hello there');
    w.session.inputBuffer = 'ok';
    await wait(3500);
    const chunks = w.seen.slice(before);

    // Return ended the caller's line (express.e:5988).
    expect(chunks[0]).toBe('\r\n');

    const reply = w.repo.getChatMessages(pageId).filter((m: any) => m.senderId === 'bot').pop()!.message as string;
    const words = chunks.filter((c) => /\x1b\[36m\S/.test(c));
    // Word by word: as many chunks as words, each carrying one word.
    expect(words.length).toBe(reply.split(/\s+/).filter(Boolean).length);
    expect(words.map((c) => c.match(/\x1b\[36m([^\x1b]*)/)![1].trim()).join(' ')).toBe(reply.replace(/\s+/g, ' ').trim());
    // Around each word: "ok" rubbed out first, put back after, in the caller's colour.
    for (const c of words) {
      expect(c.startsWith('\b \b\b \b')).toBe(true);
      expect(c.endsWith('\x1b[33mok')).toBe(true);
    }
    // No positioning, no clearing - a stream.
    expect(chunks.join('')).not.toMatch(/\x1b\[\d+;\d+H/);
    expect(chunks.join('')).not.toContain('\x1b[2K');
    // The line ends with return, and the caller's word follows onto the new line.
    expect(chunks.some((c) => c === '\b \b\b \b\r\n\x1b[33mok')).toBe(true);
  });

  it('two lines for one caller never interleave: the second waits for the first', async () => {
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    // Do NOT wait for the opening line to finish; answer at once.
    await wait(1300);
    await H.handleUserChatMessage(w.io, w.repo, w.session, 'hello');
    await wait(4000);
    const text = shown(w.seen).replace(/\s+/g, ' ');
    // The bot's lines (the caller's own line is on their screen as they typed it, not on this wire).
    const messages = w.repo.getChatMessages(w.session.tempData.pageId).filter((m: any) => m.senderId === 'bot').map((m: any) => m.message as string);
    expect(messages.length).toBe(2);
    // Every line appears whole and in order, no word of one inside another.
    let cursor = 0;
    for (const m of messages) {
      const at = text.indexOf(m.replace(/\s+/g, ' ').trim(), cursor);
      expect(at).toBeGreaterThanOrEqual(cursor);
      cursor = at + 1;
    }
  });
});
