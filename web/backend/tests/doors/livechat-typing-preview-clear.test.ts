/**
 * A delivered message clears the sender's typing preview.
 *
 * Reported live 2026-08-26 with two users typing at once: the same message
 * appeared TWICE, in two different formats and colours -
 *
 *   [12:58] spot: 456 [12:58] spot: 456
 *   [12:58] <spot> 456      <- the preview, angle brackets
 *   [12:58] spot: 456       <- the delivered message, colon
 *
 * The angle-bracket copy is the typing preview, which shows what somebody is
 * typing before they send it. Clearing it rested entirely on a separate
 * chat:keystroke-submit event arriving first; when it did not, the preview
 * stayed on screen beside the delivered line.
 *
 * The message is the authority - it IS the text the preview was showing - so
 * the preview is reconciled against it rather than against a signal that can
 * go missing.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { processKeystroke } from '../../../../Doors/livechat/ui/typing-preview';

const handlers = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'Doors', 'livechat', 'handlers', 'chat-socket-handlers.ts'),
  'utf8'
);

describe('when a message arrives', () => {
  const handler = handlers.slice(
    handlers.indexOf("sock.on('chat:message'"),
    handlers.indexOf("sock.on('chat:edited'")
  );

  it('clears that user\'s typing preview', () => {
    expect(handler).toMatch(/pk\(st\.typingBuffers, m\.userId, m\.username, 'SUBMIT', ''\)/);
  });

  it('redraws the previews after clearing', () => {
    // Dropping the buffer without refreshing leaves the old line painted.
    expect(handler).toMatch(/'SUBMIT', ''\);\s*\n\s*utp\(\);/);
  });

  it('still ignores its own messages', () => {
    // The sender shows their own message from a local echo.
    expect(handler).toMatch(/if \(m\.userId === String\(uid\)\) return;/);
  });
});

describe('the preview buffer itself', () => {
  it('is removed on submit', () => {
    const buffers = new Map<number, any>();
    processKeystroke(buffers, 7, 'spot', '4', 'cyan');
    processKeystroke(buffers, 7, 'spot', '5', 'cyan');
    expect(buffers.has(7)).toBe(true);

    processKeystroke(buffers, 7, 'spot', 'SUBMIT', '');

    expect(buffers.has(7)).toBe(false);
  });

  it('is removed on clear', () => {
    const buffers = new Map<number, any>();
    processKeystroke(buffers, 7, 'spot', 'x', 'cyan');

    processKeystroke(buffers, 7, 'spot', 'CLEAR', '');

    expect(buffers.has(7)).toBe(false);
  });

  it('leaves other users alone', () => {
    const buffers = new Map<number, any>();
    processKeystroke(buffers, 7, 'spot', 'x', 'cyan');
    processKeystroke(buffers, 9, 'sysop', 'y', 'magenta');

    processKeystroke(buffers, 7, 'spot', 'SUBMIT', '');

    expect(buffers.has(9)).toBe(true);
  });
});
