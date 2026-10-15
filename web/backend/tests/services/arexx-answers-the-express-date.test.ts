// @ts-nocheck
/**
 * An AREXX door and a XIM door asked the board the same question and got
 * different answers.
 *
 * The date fields are express's, and express has TWO date formats:
 * formatCDateTime (MiscFuncs.e:343-364, "Mon Jan 07 14:32:00 2026") and
 * formatLongDateTime (:320-341, "Mon 07-Jan-2026 14:32:00"). Every path that
 * answers a door has to pick the one express picks:
 *
 *   DT_STAMP_CTIME  144  express.e:3775  formatCDateTime
 *   DT_CURR_TIME    145  express.e:3772  StringF('\d', getSystemTime()) - the
 *                                        raw seconds, not a rendered date
 *   DT_STAMP_LASTON 143  express.e:3769  formatCDateTime
 *   DT_TIMELASTON   113  express.e:5317  formatLongDateTime
 *
 * AREXX answered 144 with a bare "14:32:00", 145 with a date-and-time string
 * of its own, and 143 with the LONG format - while amiga-emulation/xim/
 * data-query.ts answered all three the express way. Same field id, two
 * boards, depending on how the door was written.
 *
 * The stored `lastLogin` is Unix SECONDS (data-query.ts reads the same field
 * and says so); `new Date(seconds)` reads them as milliseconds, which put
 * every AREXX door's "last on" in January 1970.
 */
import { AREXXInterpreter } from '../../src/services/arexx.service';
import { formatCDateTime, formatLongDateTime } from '../../src/utils/date-time.util';

const DT_TIMELASTON = 113;
const DT_STAMP_LASTON = 143;
const DT_STAMP_CTIME = 144;
const DT_CURR_TIME = 145;

/** Jan 7 2026, 14:32:15 local - the same instant the date util's tests use. */
const LAST_ON = new Date(2026, 0, 7, 14, 32, 15);

function interpreter(user: any = {}) {
  return new AREXXInterpreter({
    user: { username: 'TestUser', secLevel: 20, id: 'date-user', ...user },
    session: { currentConf: 1 },
    socket: null,
    output: [],
  } as any);
}

describe('the dates an AREXX door is handed', () => {
  it('answers DT_STAMP_CTIME with the whole stamp, not a bare time', async () => {
    const answer = await interpreter().bbsFunctions.GetUser(DT_STAMP_CTIME);

    expect(answer).toMatch(/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{2}:\d{2}:\d{2} \d{4}$/);
    expect(answer).toHaveLength(24);
    // The old answer was "14:32:00" and nothing else.
    expect(answer).not.toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('answers DT_CURR_TIME with seconds, because express prints a number there', async () => {
    const answer = await interpreter().bbsFunctions.GetUser(DT_CURR_TIME);

    expect(answer).toMatch(/^\d{10}$/);
    expect(Math.abs(Number(answer) - Math.floor(Date.now() / 1000))).toBeLessThan(5);
  });

  it('answers DT_STAMP_LASTON with formatCDateTime, not the long format', async () => {
    const seconds = Math.floor(LAST_ON.getTime() / 1000);

    const answer = await interpreter({ lastLogin: seconds }).bbsFunctions.GetUser(DT_STAMP_LASTON);

    expect(answer).toBe(formatCDateTime(LAST_ON));
    expect(answer).not.toBe(formatLongDateTime(LAST_ON));
  });

  it('answers DT_TIMELASTON with the long format, which is what :5317 calls', async () => {
    const seconds = Math.floor(LAST_ON.getTime() / 1000);

    const answer = await interpreter({ lastLogin: seconds }).bbsFunctions.GetUser(DT_TIMELASTON);

    expect(answer).toBe(formatLongDateTime(LAST_ON));
  });

  it('reads the stored last-login as SECONDS, so it is not 1970', async () => {
    const seconds = Math.floor(LAST_ON.getTime() / 1000);

    const answer = await interpreter({ lastLogin: seconds }).bbsFunctions.GetUser(DT_TIMELASTON);

    expect(answer).toContain('2026');
    expect(answer).not.toContain('1970');
  });

  it('says Never for a user who has never logged in', async () => {
    expect(await interpreter({ lastLogin: null }).bbsFunctions.GetUser(DT_TIMELASTON)).toBe('Never');
    expect(await interpreter({ lastLogin: null }).bbsFunctions.GetUser(DT_STAMP_LASTON)).toBe('');
  });
});
