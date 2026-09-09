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
import { THINKING_DOTS_AFTER_MS } from '../../src/handlers/operator-chat/thinking-dots';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

/**
 * HOLDING THE MODEL BACK, so a reply is slow enough to be worth dots.
 *
 * Nothing on the real path is reliably slower than THINKING_DOTS_AFTER_MS
 * without going out to a network: `botThinkTime` is spent AFTER the reply
 * already exists (the /quit-while-thinking test below leans on that), and a
 * provider with no key answers at once by design. So the model call itself is
 * held here, and only for the test that sets `mockHold` - every other test in
 * this file, including the one that asserts the real no-provider reply, goes
 * through `jest.requireActual`.
 *
 * A factory and not `jest.spyOn`: @swc/jest emits each export as a
 * non-configurable getter, and spying on one throws "Cannot redefine
 * property". The `mock` prefix is what lets the hoisted factory close over it.
 */
let mockHold: { ms: number; reply: string } | null = null;
jest.mock('../../src/handlers/grumpy-sysop-bot.handler', () => {
  const actual = jest.requireActual('../../src/handlers/grumpy-sysop-bot.handler');
  return {
    ...actual,
    getGrumpySysopResponse: async (...args: unknown[]) => {
      if (!mockHold) return (actual as any).getGrumpySysopResponse(...args);
      const { ms, reply } = mockHold;
      await new Promise((r) => setTimeout(r, ms));
      return reply;
    },
  };
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait for what the caller is meant to see, not for a fixed number of
 * milliseconds. The bot TYPES its lines a character at a time, so "3.5
 * seconds should be enough" is a race that loses on a loaded machine - this
 * suite failed that way on 2026-09-08 while the rest of the tree was
 * rebuilding. Polls to a generous deadline and returns as soon as it is
 * there.
 */
async function until(seen: string[], re: RegExp, ms = 12000): Promise<string> {
  const plain = () => seen.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (re.test(plain())) return plain();
    await wait(50);
  }
  return plain();
}

/**
 * Wait until a whole line the board RECORDED has been typed to the caller.
 * `until(INTRO)` returns on the intro's first words - the bot is still
 * typing the rest - so anything asserting the full message must wait for
 * the full message. Compared without whitespace, because the shared line
 * wraps at 78 columns.
 */
async function untilTyped(seen: string[], text: () => string | undefined, ms = 12000): Promise<void> {
  const bare = (v: string) => v.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\s/g, '');
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const want = text();
    if (want && bare(seen.join('')).includes(bare(want))) return;
    await wait(50);
  }
}
/**
 * Wait on a condition rather than on a guess at how long the bot needs.
 *
 * The interleave test slept `wait(4000)` for two replies the bot TYPES a
 * character at a time, and was red in the shared tree because one of them had
 * not been recorded yet on a loaded worker. Nothing about the assertion needed
 * a fixed pace.
 */
/**
 * The bot finishes a line with return twice - the line ends, then a blank line
 * hands the turn back. That pair is the only reliable "it has stopped typing"
 * signal, and waiting for it is what these tests actually mean by their sleeps.
 */
function handedBack(chunks: string[]): boolean {
  return chunks.length >= 2 &&
    chunks[chunks.length - 1] === '\r\n' &&
    chunks[chunks.length - 2] === '\r\n';
}

async function untilTrue(what: string, ok: () => boolean, ms = 15000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (ok()) return;
    await wait(50);
  }
  throw new Error(`timed out after ${ms}ms waiting for: ${what}`);
}

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

describe('the engine tags, now that there is one engine', () => {
  it('are still stripped - from a model line, and from the rows a board recorded while they were in use', () => {
    expect(stripEngineTag('[AI] [AI] *grumble* OH, real mature.')).toBe('*grumble* OH, real mature.');
    expect(stripEngineTag('[RB] Read the docs.')).toBe('Read the docs.');
    expect(stripEngineTag('No tag here')).toBe('No tag here');
  });
  it('are never added: with no provider reachable the co-sysop says so, plainly', async () => {
    const reply = await getGrumpySysopResponse('hi', {
      userHandle: 'Caller', nodeId: 1, conferenceName: 'General', timeOnline: 5,
      messageHistory: [{ role: 'bot', content: '[RB] [RB] earlier line' }],
    }, { provider: 'openrouter', openRouterApiKey: '', budgetMs: 500 });
    expect(reply).not.toMatch(/^\[(AI|RB)\]/);
    expect(reply).toContain('ask me again in a minute');
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
    const pageId = w.session.tempData.pageId;
    await untilTyped(w.seen, () => w.repo.getChatMessages(pageId)[0]?.message as string | undefined);
    const all = w.seen.join('');

    // Nothing of the old split screen.
    expect(all).not.toContain('\x1b[2J');
    expect(all).not.toMatch(/\x1b\[\d+;\d+r/);
    expect(all).not.toContain('\x1b[?1000h');
    expect(all).not.toMatch(/\x1b\[\d+;\d+H/);
    // express.e:6085-6087, the built-in start line, in the colour that was
    // current - for a HUMAN answer. A bot persona greets in its own voice,
    // so the generic line is skipped and the opening line is the first
    // thing typed. THREE returns above it are gone with it.
    expect(shown(w.seen)).not.toContain('How can I help you??');
    // The opening line is a message: saved, and the first thing typed.
    const messages = w.repo.getChatMessages(pageId);
    expect(messages.length).toBe(1);
    expect(messages[0].senderId).toBe('bot');
    expect(messages[0].message).toMatch(INTRO);
    const text = shown(w.seen);
    expect(text.replace(/\s/g, '')).toContain(messages[0].message.replace(/\s/g, ''));
    // One character per chunk, and the sysop colour ONCE, on the first
    // (6164-6167) - of the INTRO, which is now the first typed line. The
    // search starts after the hint, which is the board talking and resets
    // the colour between the two.
    const hintAt = w.seen.findIndex((c) => c.includes('press return twice to send'));
    expect(hintAt).toBeGreaterThan(0);
    const startAt = hintAt + 1 + w.seen.slice(hintAt + 1).findIndex((c) => c.startsWith('\x1b[36m'));
    expect(startAt).toBeGreaterThan(hintAt);
    expect(w.seen[startAt]).toMatch(/^\x1b\[36m.$/);
    const typed = w.seen.slice(startAt + 1, startAt + 20);
    for (const c of typed) expect(c).toMatch(/^(.|\r\n|\x08 \x08)$/);
  });

  it('the caller and the bot share one line: the colour switches with the sender, backspace rubs out, return ends it', async () => {
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    // The page timeout, the bot's opening line typed out, and the blank line
    // that hands the turn back. Sleeping 3500ms for it passed on an idle
    // machine and failed on a loaded one.
    await untilTrue('the bot to finish its opening line', () => handedBack(w.seen));

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
    await untilTrue('the reply to finish and hand the turn back',
      () => handedBack(w.seen.slice(b2)));
    const reply = w.seen.slice(b2);
    expect(reply[0]).toMatch(/^\x1b\[36m.$/);
    expect(reply.filter((c) => c.startsWith('\x1b[36m')).length).toBe(1);
    const said = w.repo.getChatMessages(w.session.tempData.pageId).filter((m: any) => m.senderId === 'bot').pop()!.message as string;
    expect(shown(reply).replace(/\s/g, '')).toContain(said.replace(/\s/g, ''));
    // Return twice: the line ends, then a blank line hands the turn back.
    expect(reply.slice(-2)).toEqual(['\r\n', '\r\n']);
    // 40s for the same reason as the interleave test: the bot TYPES its reply
    // one character at a time. Every wait above is a condition, so this is
    // only reached on a real failure.
  }, 40000);

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

  it('a reply that was still thinking when the caller quit is never typed - not on the next page either', async () => {
    const w = makeWorld();
    // A think time the /quit can land inside: the reply is generated, then
    // waits, then types. The wait is where the leak lived (2026-09-08 07:05).
    w.repo.updateConfig({ botThinkTime: 1500 } as any);
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    await wait(3500);
    await H.handleUserChatMessage(w.io, w.repo, w.session, 'what is After by Art?');
    await wait(300);                                   // the reply exists and is thinking
    const before = w.seen.length;
    await H.handleUserQuitChat(w.io, w.repo, w.session, w.socket);
    await wait(3500);                                  // well past the think time
    const after = w.seen.slice(before).join('');
    expect(after).toContain('Ending Chat.');
    // Nothing in the bot's colour after the chat ended - no leaked reply.
    const tail = after.slice(after.indexOf('Ending Chat.'));
    expect(tail).not.toContain('\x1b[36m');
    expect(tail).not.toMatch(/\[(RB|AI)\]/);
  });

  it('return twice sends: a line with text is kept, an empty line hands over what was kept as one message', () => {
    const session: any = { user: { id: 'u', username: 'Knut', secLevel: 30 } };
    expect(H.callerLineEntered(session, 'hello there')).toEqual({});
    expect(H.callerLineEntered(session, 'second line  ')).toEqual({});
    expect(H.callerLineEntered(session, '')).toEqual({ send: 'hello there\nsecond line' });
    expect(H.callerLineEntered(session, '')).toEqual({});           // nothing kept: just a blank line
    expect(H.callerLineEntered(session, '   ')).toEqual({});        // whitespace is an empty line
  });

  it('a caller who presses return once and waits is told how to send - once, and never mid-line', async () => {
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    await wait(3000);

    // They type a line and press return, the way a caller who does not know
    // the convention does - and then they wait.
    for (const ch of 'are you there') H.callerTypedChar(w.io, w.session, ch);
    H.callerPressedReturn(w.io, w.session);
    expect(H.callerLineEntered(w.session, 'are you there')).toEqual({});
    const before = w.seen.length;
    H.scheduleSendHint(w.io, w.session, 30);
    await wait(200);
    const said = w.seen.slice(before).join('').replace(/\x1b\[[0-9;]*m/g, '');
    expect(said).toContain('press return once more on the empty line and I will read it');

    // Once per chat: a second kept line says nothing more.
    const after = w.seen.length;
    H.callerLineEntered(w.session, 'hello?');
    H.scheduleSendHint(w.io, w.session, 30);
    await wait(200);
    expect(w.seen.slice(after).join('')).not.toContain('press return once more');
  });

  it('the hint stays silent while the caller is still typing, and once the line has been sent', async () => {
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    await wait(3000);

    // Mid-line: the caller has a half-typed line, so nothing lands in it.
    H.callerLineEntered(w.session, 'first line');
    w.session.inputBuffer = 'still typ';
    let before = w.seen.length;
    H.scheduleSendHint(w.io, w.session, 30);
    await wait(200);
    expect(w.seen.slice(before).join('')).not.toContain('press return once more');

    // Sent: nothing is pending, so an armed hint says nothing either.
    w.session.inputBuffer = '';
    H.scheduleSendHint(w.io, w.session, 60);
    expect(H.callerLineEntered(w.session, '')).toEqual({ send: 'first line' });
    H.cancelSendHint(w.session);
    before = w.seen.length;
    await wait(200);
    expect(w.seen.slice(before).join('')).not.toContain('press return once more');
  });

  it('the start of a bot chat tells the caller how to send', async () => {
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    await until(w.seen, /press return twice to send/);
    const all = w.seen.join('');
    // Both ways out, because express named neither and no sysop is here to
    // end the chat for the caller (express.e:6118 CTRL-C, F1 for the sysop).
    // No generic greeting precedes it for a bot answer.
    expect(all).not.toContain('How can I help you??');
    const hint = all.slice(all.indexOf('press return twice to send'));
    expect(hint).toContain('/quit or CTRL-C leaves the chat');
  });

  it("the caller's key is in the caller's colour even when no chat is found for the session", () => {
    const w = makeWorld();
    w.session.tempData = {};
    const before = w.seen.length;
    H.callerTypedChar(w.io, w.session, 'o');
    expect(w.seen.slice(before)).toEqual(['\x1b[33mo']);
  });

  it('two lines for one caller never interleave: the second waits for the first', async () => {
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    const botLines = () =>
      w.repo.getChatMessages(w.session.tempData.pageId).filter((m: any) => m.senderId === 'bot');
    // The page timeout, then the bot takes it and records its opening line.
    await untilTrue('the bot to take the page', () => botLines().length >= 1);
    await H.handleUserChatMessage(w.io, w.repo, w.session, 'hello');
    // Its answer is the second: the point of the test is that the second
    // waits for the first, so wait for there to BE a second.
    await untilTrue('the second bot line', () => botLines().length >= 2);
    // RECORDED is not TYPED. The assertion below looks for both messages in
    // the caller's stream, in order, so wait for the second one to finish
    // arriving a character at a time - see untilTyped.
    await untilTyped(w.seen, () => botLines()[1]?.message);
    const text = shown(w.seen).replace(/\s+/g, ' ');
    const messages = botLines().map((m: any) => m.message as string);
    expect(messages.length).toBe(2);
    let cursor = 0;
    for (const m of messages) {
      const at = text.indexOf(m.replace(/\s+/g, ' ').trim(), cursor);
      expect(at).toBeGreaterThanOrEqual(cursor);
      cursor = at + 1;
    }
    // 40s, not the file's 20s: the second reply is ~440 characters and the bot
    // TYPES it one at a time, after a page timeout and a first reply. The
    // waits above are all conditions, so this bound is only reached on a real
    // failure - it is not a sleep.
  }, 40000);

  it('shows the caller it is thinking when the reply is slow, and rubs it out', async () => {
    // The reply is held back past the dot threshold, so the caller sees dots;
    // by the time the reply has been typed they are gone again. The held
    // reply contains no full stop, so a chunk that is exactly '.' can only be
    // a thinking dot.
    mockHold = { ms: THINKING_DOTS_AFTER_MS + 900, reply: 'no full stops in this one' };
    try {
      const w = makeWorld();
      H.initOperatorChatHandler(w.io, w.repo);
      await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
      await untilTrue('the bot to finish its opening line', () => handedBack(w.seen));

      const before = w.seen.length;
      await H.handleUserChatMessage(w.io, w.repo, w.session, 'something slow');
      await untilTrue('the dots to appear', () => w.seen.slice(before).some((c) => c === '.'));
      // And bare: a raw \x1b[36m on a dot would leave line.lastSender saying
      // `user` while the terminal stood in the sysop's cyan, so the caller's
      // next key would come out cyan - verbatim the bug callerTypedChar was
      // fixed for ("sometimes i get the sysop cyan when i type", 2026-09-08).
      expect(w.seen.slice(before).join('')).not.toContain('\x1b[36m.');

      await untilTrue('the reply to finish', () => handedBack(w.seen.slice(before)));
      const shownNow = shown(w.seen.slice(before));
      // Every dot the board typed while thinking was rubbed out: what is left is
      // the reply, and a run of leading dots would be the bug.
      expect(shownNow.trimStart().startsWith('.')).toBe(false);
      expect(shownNow.replace(/\s/g, '')).toContain('nofullstopsinthisone');
    } finally {
      mockHold = null;
    }
  }, 40000);

  it('a caller who quits while the co-sysop is thinking takes its dots with him', async () => {
    // CTRL-C (express.e:6118) and /quit both end the chat through endChat, and
    // both used to leave the thinking dots standing on the line above
    // "Ending Chat." - the window self-stopped, so nothing leaked, but nothing
    // rubbed the dots out either.
    mockHold = { ms: THINKING_DOTS_AFTER_MS + 1500, reply: 'never typed' };
    try {
      const w = makeWorld();
      H.initOperatorChatHandler(w.io, w.repo);
      await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
      await untilTrue('the bot to finish its opening line', () => handedBack(w.seen));

      const before = w.seen.length;
      await H.handleUserChatMessage(w.io, w.repo, w.session, 'something slow');
      await untilTrue('the dots to appear', () => w.seen.slice(before).some((c) => c === '.'));

      await H.handleUserQuitChat(w.io, w.repo, w.session, w.socket);
      const text = shown(w.seen.slice(before));
      expect(text).toContain('Ending Chat.');
      // Nothing of the thinking window is left ahead of the end-of-chat line.
      expect(text.slice(0, text.indexOf('Ending Chat.'))).not.toContain('.');

      // And the held reply, arriving after the chat is gone, types nothing -
      // no dot of its own either.
      const after = w.seen.length;
      await wait(2500);
      expect(w.seen.slice(after).some((c) => c === '.')).toBe(false);
    } finally {
      mockHold = null;
    }
  }, 40000);

  it('keeps typing dots through the think pause, right up to the first character of the reply', async () => {
    // WHERE the window is closed, pinned. Stopping it when the MODEL returned
    // looked right and left the caller staring at a dead line for the whole of
    // botThinkTime afterwards - a second by default, and this board's sysop can
    // raise it - which is the exact silence the dots exist to fill. The row is
    // recorded at the top of sendBotMessageWithTyping, BEFORE that pause, so
    // "the reply exists but nothing has been typed yet" is observable: a dot
    // arriving after it is a dot the old placement could not have produced.
    mockHold = { ms: THINKING_DOTS_AFTER_MS + 400, reply: 'no full stops in this one' };
    try {
      const w = makeWorld();
      H.initOperatorChatHandler(w.io, w.repo);
      await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
      await untilTrue('the bot to finish its opening line', () => handedBack(w.seen));
      // Raised only now, so the intro is not slowed down as well.
      w.repo.updateConfig({ botThinkTime: 2500 } as any);

      const botLines = () =>
        w.repo.getChatMessages(w.session.tempData.pageId).filter((m: any) => m.senderId === 'bot');
      const said = botLines().length;
      await H.handleUserChatMessage(w.io, w.repo, w.session, 'something slow');
      await untilTrue('the model to return and its line to be recorded', () => botLines().length > said);

      const thinking = w.seen.length;
      await untilTrue('a dot AFTER the model returned', () => w.seen.slice(thinking).some((c) => c === '.'));
      // And nothing of the reply had been typed when it arrived.
      const firstDot = w.seen.slice(thinking).findIndex((c) => c === '.');
      expect(shown(w.seen.slice(thinking, thinking + firstDot))).not.toContain('no full stops');

      // The whole run still ends clean: dots gone, reply typed from the margin.
      await untilTrue('the reply to finish', () => handedBack(w.seen.slice(thinking)));
      const shownNow = shown(w.seen.slice(thinking));
      expect(shownNow.trimStart().startsWith('.')).toBe(false);
      expect(shownNow.replace(/\s/g, '')).toContain('nofullstopsinthisone');
    } finally {
      mockHold = null;
    }
  }, 40000);

  it('types its opening line instead of pasting it, and still prints the hint at once', async () => {
    // The generic greeting is gone for bot answers; the persona's own
    // opening line is the first thing typed. It must still arrive one
    // character per emit, while the hint below it is the BOARD talking
    // and stays instant.
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    await untilTrue('the opening line to be saved', () => (w.repo.getChatMessages(w.session.tempData.pageId) ?? []).length > 0);
    const opening = w.repo.getChatMessages(w.session.tempData.pageId)[0].message as string;
    const head = opening.slice(0, 20);

    // Typed means one character per emit, not one emit carrying the sentence.
    await untilTrue('the opening line to finish typing', () => shown(w.seen).includes(head));
    expect(w.seen.some((chunk) => chunk.includes(head) && chunk.length > head.length + 10)).toBe(false);
    // The hint arrives whole.
    await untilTrue('the hint', () => shown(w.seen).includes('press return twice to send'));
    expect(w.seen.some((chunk) => chunk.includes('press return twice to send'))).toBe(true);
  }, 40000);

  it("carries the sysop colour into the line after the board's hint", async () => {
    // THE GREETING TAUGHT THE LINE MODEL A LIE. Typing the greeting sets the
    // line's lastSender to 'sysop'; the hint under it is the BOARD talking
    // and resets the terminal with \x1b[0m. Emit that reset without telling
    // the line model and the intro - same speaker as the greeting, as far as
    // the model knows - is typed with no colour at all, in whatever the
    // reset left. Every SGR the chat sends goes through the line model.
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    // The hint, and then the first thing the co-sysop types under it - which
    // is all this needs, and all it waits for. untilTyped() would do, but it
    // cannot match a message that wrapped at 78 columns (its bare() drops
    // escapes and whitespace, not the BS-space-BS rub-out) and so silently
    // spends its whole 12s deadline whenever a long intro comes up.
    const hintIndex = () => w.seen.findIndex((c) => c.includes('press return twice to send'));
    const typedAfterHint = () => {
      const at = hintIndex();
      return at < 0 ? undefined : w.seen.slice(at + 1).find((c) => /[^\s]/.test(c.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')));
    };
    await untilTrue('the hint, and the co-sysop speaking under it', () => typedAfterHint() !== undefined);

    expect(hintIndex()).toBeGreaterThan(0);
    expect(typedAfterHint()).toMatch(/^\x1b\[36m/);
  }, 40000);

  it('puts the caller in the chat before the opening line has finished typing, not after', async () => {
    // The opening line types for a second or more, and acceptPage awaits it. Send
    // the re-link and the accepted events AFTER that await and the caller
    // spends the whole opening line in their pre-chat subState: their keys go to
    // the menu they paged from - a menu command can start under the greeting -
    // and chatOfSession finds no chat, so they can neither type into it nor
    // /quit it. The window used to be a microsecond; typing made it seconds.
    const w = makeWorld();
    // Read the subState AT each emit rather than polling for it: a poll races
    // the very window under test and would pass on a slow machine by luck.
    const at: Array<{ chunk: string; subState: unknown; pageId: unknown }> = [];
    const push = w.seen.push.bind(w.seen);
    (w.seen as any).push = (...chunks: string[]) => {
      for (const chunk of chunks) at.push({ chunk, subState: w.session.subState, pageId: w.session.tempData?.pageId });
      return push(...chunks);
    };
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    await untilTrue('the opening line to be saved', () => (w.repo.getChatMessages(w.session.tempData.pageId) ?? []).length > 0);
    const opening = w.repo.getChatMessages(w.session.tempData.pageId)[0].message as string;

    // The opening line's first character - the colour switch rides on it.
    const firstChar = at.find((r) => r.chunk === `\x1b[36m${opening[0]}`);
    expect(firstChar).toBeDefined();
    expect(firstChar!.subState).toBe(LoggedOnSubState.OPERATOR_CHAT_ACTIVE);
    expect(firstChar!.pageId).toBe(w.session.tempData.pageId);
  }, 40000);
});
