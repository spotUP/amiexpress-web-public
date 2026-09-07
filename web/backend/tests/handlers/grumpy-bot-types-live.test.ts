/**
 * The chat is express.e's one scrolling stream, and the bot types into it.
 *
 * express.e chat() (6067-6244), the procedure F1 runs unless a translator is
 * active: no clear, no scroll region, no input line. Every key from either
 * side goes out with sendChar the moment it is pressed (6172); the colour
 * switches only when the SENDER changes (6164-6171); backspace is
 * BS-space-BS to both sides (6147-6149); return is a newline (6138). Both
 * sides share ONE line buffer, and past 78 columns the half-typed word at its
 * end is rubbed out and put at the start of the next line (6181-6223).
 *
 * This port had a split screen of its own invention until 2026-09-07 ("make
 * the flow of the chat 1:1 - ours dont feel like a real operator page chat
 * with the input at the bottom etc"), and then, briefly, a word-at-a-time
 * delivery read off tranChat() - the translator variant - by mistake ("he
 * types word by word thats wrong").
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
import { planNaturalTyping, applyTypingPlan, stripEngineTag, getGrumpySysopResponse } from '../../src/handlers/grumpy-sysop-bot.handler';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const INTRO = /is AFK|isn't answering|sysop is off doing|didn't answer your page/;

describe('the typing plan', () => {
  it('with no typos types the text in order, one character per event', () => {
    const plan = planNaturalTyping('Read the docs.', { typingSpeed: 10, typoProbability: 0 }, () => 0.5);
    const chars = plan.filter((e) => e.kind === 'char').map((e) => (e as any).ch).join('');
    expect(chars).toBe('Read the docs.');
    expect(plan.some((e) => e.kind === 'backspace')).toBe(false);
    expect(applyTypingPlan(plan)).toBe('Read the docs.');
  });

  it('a typo is a neighbouring key, a pause, a backspace and the right key - and the line still comes out right', () => {
    const plan = planNaturalTyping('Hi lamer', { typingSpeed: 10, typoProbability: 1 }, () => 0);
    expect(plan.slice(0, 5).map((e) => e.kind)).toEqual(['char', 'pause', 'backspace', 'pause', 'char']);
    expect((plan[0] as any).ch).toBe('G');
    expect((plan[4] as any).ch).toBe('H');
    expect(applyTypingPlan(plan)).toBe('Hi lamer');
  });

  it('every pause scales with the typing speed', () => {
    const total = (p: ReturnType<typeof planNaturalTyping>) => p.reduce((a, e) => a + (e.kind === 'pause' ? e.ms : 0), 0);
    const slow = planNaturalTyping('Well, no.', { typingSpeed: 40, typoProbability: 0 }, () => 0.5);
    const fast = planNaturalTyping('Well, no.', { typingSpeed: 1, typoProbability: 0 }, () => 0.5);
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

/** What stays on the screen: escapes gone, and every BS-space-BS takes the character before it. */
const shown = (chunks: string[]) => {
  let s = chunks.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  while (/[^\x08]\x08 \x08/.test(s)) s = s.replace(/[^\x08]\x08 \x08/, '');
  return s;
};

describe('the chat is one stream', () => {
  it("opens the way express does, and the bot's first line is a message it types, one character at a time", async () => {
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    await wait(3500);
    const pageId = w.session.tempData.pageId;
    const all = w.seen.join('');

    // Nothing of the old split screen.
    expect(all).not.toContain('\x1b[2J');
    expect(all).not.toMatch(/\x1b\[\d+;\d+r/);
    expect(all).not.toContain('\x1b[?1000h');
    expect(all).not.toMatch(/\x1b\[\d+;\d+H/);
    // express.e:6085-6087, the built-in start line, in the colour that was current.
    expect(all).toContain('\r\n\r\nThis is GrumpyBot, How can I help you??\r\n\r\n');
    // The opening line is a message: saved, and typed after the start line.
    const messages = w.repo.getChatMessages(pageId);
    expect(messages.length).toBe(1);
    expect(messages[0].senderId).toBe('bot');
    expect(messages[0].message).toMatch(INTRO);
    const text = shown(w.seen);
    expect(text.indexOf('How can I help you??')).toBeLessThan(text.search(INTRO));
    expect(text.replace(/\s/g, '')).toContain(messages[0].message.replace(/\s/g, ''));
    // One character per chunk, and the sysop colour ONCE, on the first (6164-6167).
    const startAt = w.seen.findIndex((c) => c.startsWith('\x1b[36m'));
    expect(startAt).toBeGreaterThan(0);
    expect(w.seen[startAt]).toMatch(/^\x1b\[36m.$/);
    const typed = w.seen.slice(startAt + 1, startAt + 20);
    for (const c of typed) expect(c).toMatch(/^(.|\r\n|\x08 \x08)$/);
  });

  it('the caller and the bot share one line: the colour switches with the sender, backspace rubs out, return ends it', async () => {
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    await wait(3500);

    const before = w.seen.length;
    // The caller types "ok", corrects, types more, presses return - as the
    // chat branch of command.handler drives it.
    H.callerTypedChar(w.io, w.session, 'o');
    H.callerTypedChar(w.io, w.session, 'k');
    H.callerBackspaced(w.io, w.session);
    H.callerTypedChar(w.io, w.session, 'i');
    H.callerPressedReturn(w.io, w.session);
    const mine = w.seen.slice(before);
    expect(mine).toEqual(['\x1b[33mo', 'k', '\x08 \x08', 'i', '\r\n']);
    expect(shown(mine)).toBe('oi\r\n');

    // Now the bot answers: the colour switches back once, then characters.
    const b2 = w.seen.length;
    await H.handleUserChatMessage(w.io, w.repo, w.session, 'oi');
    await wait(3500);
    const reply = w.seen.slice(b2);
    expect(reply[0]).toMatch(/^\x1b\[36m.$/);
    expect(reply.filter((c) => c.startsWith('\x1b[36m')).length).toBe(1);
    const said = w.repo.getChatMessages(w.session.tempData.pageId).filter((m: any) => m.senderId === 'bot').pop()!.message as string;
    expect(shown(reply).replace(/\s/g, '')).toContain(said.replace(/\s/g, ''));
    expect(reply[reply.length - 1]).toBe('\r\n');
  });

  it('past 78 columns the half-typed word moves to the next line (express.e:6181-6223)', () => {
    const cs: any = { line: { text: '', lastSender: 'sysop' } };
    let out = '';
    const text = 'x'.repeat(70) + ' wordthatwraps';
    for (const ch of text) out += H.chatCharBytes(cs, 'sysop', ch);
    // At the 79th character: the partial word is rubbed out, a newline, the word again.
    const rubbed = 'wordthat'.length;
    expect(out).toContain('\x08 \x08'.repeat(rubbed) + '\r\n' + 'wordthat');
    expect(cs.line.text).toBe('wordthatwraps');
    // A line with no space in it simply breaks.
    const cs2: any = { line: { text: '', lastSender: 'sysop' } };
    let out2 = '';
    for (const ch of 'y'.repeat(79)) out2 += H.chatCharBytes(cs2, 'sysop', ch);
    expect(out2.endsWith('y\r\n')).toBe(true);
    expect(cs2.line.text).toBe('');
  });

  it('two lines for one caller never interleave: the second waits for the first', async () => {
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    await wait(1300);
    await H.handleUserChatMessage(w.io, w.repo, w.session, 'hello');
    await wait(4000);
    const text = shown(w.seen).replace(/\s+/g, ' ');
    const messages = w.repo.getChatMessages(w.session.tempData.pageId).filter((m: any) => m.senderId === 'bot').map((m: any) => m.message as string);
    expect(messages.length).toBe(2);
    let cursor = 0;
    for (const m of messages) {
      const at = text.indexOf(m.replace(/\s+/g, ' ').trim(), cursor);
      expect(at).toBeGreaterThanOrEqual(cursor);
      cursor = at + 1;
    }
  });
});
