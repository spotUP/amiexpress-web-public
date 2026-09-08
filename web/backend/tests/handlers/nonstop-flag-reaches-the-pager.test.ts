/**
 * `~NS` suppressed nothing, because it set the wrong half of a split flag.
 *
 * express has ONE flag, `nonStopDisplayFlag` (express.e:120). The pager tests
 * it - `IF(nonStopDisplayFlag=FALSE) THEN lineCount++` (express.e:5190) - and
 * the door API sets and reports the same one (BB_NONSTOPTEXT,
 * express.e:3875-3876, :4037).
 *
 * This port split it: `session.tempData.nonStopDisplayFlag` for the pager,
 * `session.nonStopText` for doors, XIM and AREXX. `~NS` and `~NSF` set only
 * the door-facing half, so a screen asking for non-stop output still stopped
 * at every page. `setNonStopMode` owns both now, which is the only way they
 * stay in step.
 */
process.env.SKIP_DB_INIT = '1';

import { setNonStopMode } from '../../src/utils/flag-pause.util';

describe('setNonStopMode', () => {
  it('sets the half the pager reads', () => {
    const session: any = {};

    setNonStopMode(session, true);

    expect(session.tempData.nonStopDisplayFlag).toBe(true);
  });

  it('sets the half doors, XIM and AREXX read, in the same call', () => {
    const session: any = {};

    setNonStopMode(session, true);

    expect(session.nonStopText).toBe(true);
  });

  it('clears both together', () => {
    const session: any = { tempData: { nonStopDisplayFlag: true }, nonStopText: true };

    setNonStopMode(session, false);

    expect(session.tempData.nonStopDisplayFlag).toBe(false);
    expect(session.nonStopText).toBe(false);
  });

  it('does not throw on a session with no tempData yet', () => {
    expect(() => setNonStopMode({} as any, true)).not.toThrow();
  });
});
