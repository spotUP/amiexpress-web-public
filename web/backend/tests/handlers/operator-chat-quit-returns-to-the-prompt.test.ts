/**
 * Leaving a chat puts the terminal back and takes the caller to the prompt.
 *
 * 2026-09-07 22:59, live, screenshot: after /quit the screen still showed
 * the transcript, "Ending Chat." and "Press any key to continue..." sat on
 * top of it, "Chat ended. Returning to menu." under that, and the caller
 * sat there - "it should either exit to the prompt directly or prompt me not
 * leave me hanging like this". Two writers (endChat and handleUserQuitChat),
 * a scroll region never reset, a pause armed with nothing reading it.
 *
 * Now there is one exit: region and mouse reporting off, screen cleared,
 * one "Chat ended." and the menu display flow pumped so the prompt follows
 * without a keypress.
 *
 * The other thing in that screenshot: an AI reply's own `\n` went out bare,
 * so the next line started wherever the cursor was - the staircase. A
 * message's line breaks are lines now, each sent with `\r\n`.
 */
process.env.SKIP_DB_INIT = '1';
jest.setTimeout(20000);

import Database from 'better-sqlite3';
import { OperatorChatRepository } from '../../src/database/operator-chat.repository';
import { registerConnectionEmitter } from '../../src/server/session-emitter-registry';
import { userSessions } from '../../src/server/session-manager';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    user: { id: 'u-quit', username: 'Caller', secLevel: 50, expert: 'Y' }, nodeId: 1,
    connectionType: 'telnet', currentConf: 1, currentConfName: 'General', tempData: {}, subState: 'LOGGED_ON',
    inputBuffer: '',
  };
  const collect = (e: string, d: unknown) => { if (e === 'ansi-output') seen.push(String(d)); };
  // A real transport emitter has `on` (the ANSI buffer subscribes to it); so does this one.
  registerConnectionEmitter(session, { emit: collect, on() {}, listenerCount: () => 0 } as any);
  userSessions.set('u-quit', session);
  const socket: any = { id: 's-quit', emit: collect, on() {}, join() {}, rooms: new Set(), session, server: io };
  return { repo, io, session, socket, seen };
}

const H = require('../../src/handlers/operator-chat.handler');
afterEach(() => H.stopOperatorChatHandler());

describe('leaving the chat', () => {
  it('/quit resets the terminal, clears the screen, says so once, and goes straight to the prompt', async () => {
    const w = makeWorld();
    H.initOperatorChatHandler(w.io, w.repo);
    await H.handlePageSysop(w.socket, w.session, w.io, w.repo);
    await wait(2600);
    expect(w.session.subState).toBe(LoggedOnSubState.OPERATOR_CHAT_ACTIVE);

    const before = w.seen.length;
    await H.handleUserQuitChat(w.io, w.repo, w.session, w.socket);
    const out = w.seen.slice(before).join('');

    // The terminal is put back: scroll region off, mouse reporting off, screen cleared.
    expect(out).toContain('\x1b[r');
    expect(out).toContain('\x1b[?1000l');
    expect(out).toContain('\x1b[2J');
    // Said once, and nothing left hanging.
    expect(out.match(/Chat ended\./g)?.length).toBe(1);
    expect(out).not.toContain('Ending Chat');
    expect(out).not.toContain('Press any key');
    expect(out).not.toContain('Returning to menu');
    // Out of the chat, no pause armed, and the display flow was pumped past DISPLAY_MENU.
    expect(w.session.subState).not.toBe(LoggedOnSubState.OPERATOR_CHAT_ACTIVE);
    expect(w.session.subState).not.toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(w.session.menuPause).toBe(false);
    expect(w.session.tempData?.pageId).toBeUndefined();
  });

  it("a message's own line breaks are lines, each sent with CR LF", () => {
    const { wrapChatMessage } = H;
    expect(wrapChatMessage('*heavy sigh*\n\nWelcome to AMIEXPRESS, node 6.\nWhat do you want?', 78)).toEqual([
      '*heavy sigh*',
      '',
      'Welcome to AMIEXPRESS, node 6.',
      'What do you want?',
    ]);
    // CRLF from a provider is one break, not two.
    expect(wrapChatMessage('a\r\nb', 78)).toEqual(['a', 'b']);
    // A long paragraph still wraps at the width.
    const long = 'word '.repeat(40).trim();
    const lines = wrapChatMessage(long, 78);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(78);
    expect(lines.join(' ')).toBe(long);
  });
});
