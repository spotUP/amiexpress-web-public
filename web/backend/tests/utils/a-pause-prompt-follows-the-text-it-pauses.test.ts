/**
 * A pause prompt reaches the caller AFTER the text it pauses.
 *
 * Board text goes through a 16 ms output buffer; checkForPause and flagPause
 * wrote their prompts straight to the socket, so a prompt overtook the rows
 * still waiting in the buffer. On the logon scan the `(Pause)...More` for
 * Console Demoscene's table appeared under the previous conference's
 * question, and the table itself ended with no prompt under it (sysop,
 * 2026-09-30: "no visible prompt at the last one").
 */
process.env.SKIP_DB_INIT = '1';

import { checkForPause, flagPause } from '../../src/utils/flag-pause.util';
import { emitText } from '../../src/utils/output.util';

function caller() {
  const out: string[] = [];
  const socket: any = { id: `pp-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {}, removeListener() {} };
  const session: any = { screenHeight: 10, tempData: { lineCount: 9 } };
  return { out, socket, session };
}

describe('a pause prompt', () => {
  it('checkForPause: after the row it pauses', () => {
    const { out, socket, session } = caller();
    emitText(socket, 'Public   Spot   Results from Conftop!  000166\r\n');
    void checkForPause(socket, session);
    const all = out.join('');
    expect(all.indexOf('000166')).toBeGreaterThanOrEqual(0);
    expect(all.indexOf('More(y/n/ns)')).toBeGreaterThan(all.indexOf('000166'));
  });

  it('flagPause: after the row it pauses', () => {
    const { out, socket, session } = caller();
    emitText(socket, 'FILE.LHA   12345  a file\r\n');
    void flagPause(socket, session);
    const all = out.join('');
    expect(all.indexOf('FILE.LHA')).toBeGreaterThanOrEqual(0);
    expect(all.indexOf('lags, More')).toBeGreaterThan(all.indexOf('FILE.LHA'));
  });
});
