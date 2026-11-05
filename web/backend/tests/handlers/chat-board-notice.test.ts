/**
 * THE BOARD SPEAKING INTO A CHAT IS STILL AN SGR THE LINE MODEL MUST HEAR.
 *
 * The chat is one shared line and the colour switches only when the SENDER
 * changes (express.e chat(), 6164-6171). Any prose emitted around that model
 * which sets a colour and puts it back - the hint under the greeting, /HELP
 * inside a live chat - leaves the terminal in the default while
 * `line.lastSender` still says who spoke last; that speaker's next character
 * then takes the "same sender, no SGR needed" branch and arrives colourless.
 *
 * The greeting hint was fixed for this on 2026-09-08; /HELP was the second
 * copy, raw-emitting `\x1b[36m...\x1b[0m` from command.handler while the
 * caller was mid-turn. `chatNoticeForSession` is the one way to say it.
 */
process.env.SKIP_DB_INIT = '1';

import { activeChatSessions, chatNoticeForSession, callerTypedChar, callerPressedReturn, CHAT_COLOR_USER }
  from '../../src/handlers/operator-chat/chat-stream';
import { registerConnectionEmitter } from '../../src/server/session-emitter-registry';
import { userSessions } from '../../src/server/session-manager';

const HELP = '\x1b[36mType, press return twice to send. /quit or CTRL-C ends the chat.\x1b[0m\r\n';

function world(inChat: boolean) {
  const seen: string[] = [];
  const session: any = { user: { id: 'u-notice' }, tempData: inChat ? { pageId: 'p-notice' } : {} };
  registerConnectionEmitter(session, {
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') seen.push(String(data)); },
  } as any);
  userSessions.set('u-notice', session);
  const chatSession: any = { pageId: 'p-notice', line: { text: '', lastSender: null }, messages: [] };
  if (inChat) activeChatSessions.set('p-notice', chatSession);
  return { seen, session, chatSession };
}

afterEach(() => { activeChatSessions.clear(); userSessions.delete('u-notice'); });

describe("the board's own line inside a live chat", () => {
  it("leaves the caller's next key in the caller's colour, not the terminal default", () => {
    const w = world(true);

    // The caller types /HELP and presses return: they are the last speaker.
    for (const ch of '/help') callerTypedChar({}, w.session, ch);
    callerPressedReturn({}, w.session);
    expect(w.chatSession.line.lastSender).toBe('user');

    // The board answers. Raw-emitted, this reset the terminal and told the
    // line model nothing.
    w.seen.push(chatNoticeForSession(w.session, HELP));
    expect(w.chatSession.line.lastSender).toBeNull();

    const before = w.seen.length;
    callerTypedChar({}, w.session, 'x');

    // The colour comes back with the key, because the model knows nobody is
    // mid-turn. Without the reset this was a bare 'x' in whatever \x1b[0m left.
    expect(w.seen.slice(before).join('')).toBe(`\x1b[${CHAT_COLOR_USER}mx`);
  });

  it('puts the terminal back to plain before the notice, not after it', () => {
    const w = world(true);
    callerTypedChar({}, w.session, 'a');

    expect(chatNoticeForSession(w.session, HELP)).toBe(`\x1b[0m${HELP}`);
  });

  it('is the prose unchanged for a caller who is in no chat at all', () => {
    const w = world(false);

    // /HELP out of a chat has no line model to tell, and must not invent one.
    expect(chatNoticeForSession(w.session, HELP)).toBe(HELP);
    expect(activeChatSessions.size).toBe(0);
  });
});
