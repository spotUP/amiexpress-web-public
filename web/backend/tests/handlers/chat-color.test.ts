/**
 * WEB_CHAT_COLOR: model markup becomes terminal SGR, and escape bytes never
 * count as columns.
 *
 * Driven, not read: renderChatMarkup is pure text, and chatCharBytes is fed
 * character by character exactly like deliverToCaller feeds it.
 */
import { renderChatMarkup, chatCharBytes } from '../../src/handlers/operator-chat/chat-stream';

describe('model markup renders', () => {
  it('paints titles cyan and resets after', () => {
    expect(renderChatMarkup('<title>Top callers</title>')).toBe('\x1b[0;36mTop callers\x1b[0m');
  });
  it('color tags render unpainted, inner text kept', () => {
    expect(renderChatMarkup('<color g>1. spot - 0 pts</color>')).toBe('1. spot - 0 pts');
    expect(renderChatMarkup('<color g>x</color g>')).toBe('x');
    expect(renderChatMarkup('<colour c>y</colour>')).toBe('y');
  });
  it('forgives a miscased title', () => {
    expect(renderChatMarkup('<TITLE>Z</TITLE>')).toBe('\x1b[0;36mZ\x1b[0m');
  });
  it('an unclosed title paints to the end, an unclosed color stays plain', () => {
    expect(renderChatMarkup('From the board: <title>Turrican')).toBe('From the board: \x1b[0;36mTurrican\x1b[0m');
    expect(renderChatMarkup('Score: <color g>42')).toBe('Score: 42');
  });
  it('leaves non-markup angle brackets alone', () => {
    expect(renderChatMarkup('a < b and <blink>x</blink>')).toBe('a < b and <blink>x</blink>');
  });
});

describe('escape bytes never count as columns', () => {
  it('78 visible characters plus paint do not wrap early', () => {
    const cs: any = { line: { text: '', lastSender: 'sysop' } };
    let out = '';
    const painted = renderChatMarkup(`<title>${'x'.repeat(70)}</title>rest`);
    for (const ch of painted) out += chatCharBytes(cs, 'sysop', ch);
    expect(cs.line.text.length).toBeLessThanOrEqual(78);
    expect(out).toContain('\x1b[0;36m');
    expect(out).not.toContain('\r\n');
  });
  it('a lone ESC (the ESC key) still counts as typed', () => {
    const cs: any = { line: { text: '', lastSender: 'sysop' } };
    chatCharBytes(cs, 'sysop', '\x1b');
    chatCharBytes(cs, 'sysop', 'q');
    expect(cs.line.text).toBe('\x1bq');
  });
});
