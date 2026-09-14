/**
 * "reply breaks in olm" - sysop, 2026-09-14, at 40 columns:
 *
 *   - OLM to Which Node? [Node #] [R] To Rep
 *   ly Or [Q] To Quit:
 *
 * The word cut in half at the screen edge is the board's own prompt, not a
 * door's: OLM is an INTERNAL command (express.e:25406-25503). The board
 * folds its text for a narrow caller at ONE choke point - `emitText`
 * (utils/ansi-buffer.util.ts), documented as the drop-in replacement for
 * `socket.emit('ansi-output', ...)`. This handler used the raw emit twenty-
 * one times and reached the wire unfolded.
 */
process.env.SKIP_DB_INIT = '1';

import { wrapForSession } from '../../src/utils/wrap-for-session.util';

const PROMPT =
  '\r\n\x1b[32m-\x1b[0m OLM to Which Node? \x1b[36m[\x1b[0mNode \x1b[33m#\x1b[36m]\x1b[0m ' +
  '\x1b[36m[\x1b[0mR\x1b[36m]\x1b[0m To Reply\x1b[0m Or \x1b[36m[\x1b[0mQ\x1b[36m]\x1b[0m To Quit\x1b[32m:\x1b[0m ';

const C64 = { petsciiMode: true, screenWidth: 40 };
const visible = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

describe('the OLM prompt at forty columns', () => {
  it('is wider than the screen, which is why it has to fold', () => {
    expect(visible(PROMPT).replace(/\r\n/g, '').length).toBeGreaterThan(40);
  });

  it('breaks between words, never through one', () => {
    const rows = visible(wrapForSession(PROMPT, C64 as never)).split(/\r?\n/).filter(Boolean);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(40);
    // The failure the sysop photographed: 'Reply' split across the edge.
    expect(rows.some((r) => r.endsWith('Rep'))).toBe(false);
    expect(rows.some((r) => r.startsWith('ly'))).toBe(false);
    // Every word still there, in order.
    expect(rows.join(' ').split(/\s+/).filter(Boolean)).toEqual(
      visible(PROMPT).split(/\s+/).filter(Boolean),
    );
  });

  it('the handler emits through the choke point, not around it', () => {
    // A raw `socket.emit('ansi-output', ...)` never meets wrapForSession.
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, '../../src/handlers/transfer/olm.handler.ts'),
      'utf8',
    );
    const raw = (src.match(/socket\.emit\('ansi-output'/g) ?? []).length;
    expect({ rawEmits: raw }).toEqual({ rawEmits: 0 });
  });
});
