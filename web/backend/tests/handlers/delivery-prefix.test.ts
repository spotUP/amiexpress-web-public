/**
 * A reply typed after kept thinking dots starts on a fresh line.
 *
 * The dots stay standing (erasing read as taking the thinking back),
 * but they occupy the line's first cells, so a reply typed right after
 * them wrapped early - its first line broke N cells short (screenshot,
 * 2026-09-10). deliverToCaller takes prefixReturn for exactly this:
 * one return before the first character, dots intact above.
 *
 * Driven: deliverToCaller with a registered emitter, bytes captured.
 */
import { deliverToCaller, activeChatSessions } from '../../src/handlers/operator-chat/chat-stream';
import { userSessions } from '../../src/server/session-manager';
import { thinkingDotsShown, clearThinkingDotsShown } from '../../src/handlers/operator-chat/thinking-dots';

function liveChat(): { cs: any; page: any; seen: string[] } {
  const seen: string[] = [];
  const emitter = { emit: (event: string, bytes?: string) => { if (event === 'ansi-output' && bytes) seen.push(bytes); } };
  const session: any = { user: { id: 'u9' }, nodeId: 9, connectionEmitter: emitter };
  userSessions.set('u9', session);
  const cs: any = { line: { text: '', lastSender: 'sysop' } };
  const page: any = { id: 'p9', userId: 'u9' };
  activeChatSessions.set('p9', cs);
  return { cs, page, seen };
}

function dropLive(page: any, cs: any): void {
  activeChatSessions.delete(page.id);
  userSessions.delete(String(page.userId));
}

describe('reply after kept dots', () => {
  it('starts on a fresh line when asked', async () => {
    const { cs, page, seen } = liveChat();
    try {
      await deliverToCaller(null, cs, page, 'hi', null, { prefixReturn: true });
      expect(seen[0]).toBe('\r\n');
      expect(seen.join('')).toContain('hi');
    } finally { dropLive(page, cs); }
  });

  it('no prefix by default', async () => {
    const { cs, page, seen } = liveChat();
    try {
      await deliverToCaller(null, cs, page, 'hi', null);
      expect(seen[0]).not.toBe('\r\n');
      expect(seen.join('')).toContain('hi');
    } finally { dropLive(page, cs); }
  });
});

describe('thinkingDotsShown', () => {
  it('counts nothing without a session and clears on demand', () => {
    expect(thinkingDotsShown(null)).toBe(0);
    expect(thinkingDotsShown(undefined)).toBe(0);
    const cs: any = {};
    expect(thinkingDotsShown(cs)).toBe(0);
    clearThinkingDotsShown(cs);
    clearThinkingDotsShown(null);
  });
});
