/**
 * The message feed's one cross-module call must keep working.
 *
 * `amiga-emulation/xim/msgfeed.ts` builds AEW_MSGQUERY's "new for me" set by
 * asking `scanConferenceForNewMail` - deliberately, so the count STAT reports
 * and the rows LIST flags 'N' come from ONE walk instead of a second copy of
 * the rule. It reaches it through `require(...)`, across a module boundary
 * that no type-check covers.
 *
 * On 2026-09-08 the export was dropped while tidying that handler's own
 * callers (d1a297411). A require of a missing export is `undefined`, calling
 * it is a TypeError, and msgfeed's catch - which exists so a door never hangs
 * on an unreadable base - swallowed it. STAT then answered "<total>|0|..." to
 * every caller, in every base, for five days: the SUBS door told everyone they
 * had no new messages while the board was holding them.
 *
 * Nothing failed loudly. `tsc` cannot see through `require`, the catch turned
 * the TypeError into a quiet console line, and no test drove the pair.
 *
 * So this pins the seam itself, not the behaviour on either side of it - the
 * behaviour has its own suites, and both were green while this was broken.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');

describe('the mail scan, as the message feed reaches it', () => {
  it('is exported from the handler', () => {
    // The require in msgfeed.ts resolves a named export off the module. A
    // function that is merely defined is `undefined` to it.
    const scan = require(path.join(SRC, 'handlers/message/message-scan.handler'));

    expect(typeof scan.scanConferenceForNewMail).toBe('function');
  });

  it('is still the function msgfeed asks for, by name', () => {
    // If the feed is ever changed to ask for something else, this test should
    // be updated deliberately rather than keep guarding a name nobody uses.
    const feed = fs.readFileSync(path.join(SRC, 'amiga-emulation/xim/msgfeed.ts'), 'utf8');

    expect(feed).toMatch(/scan\.scanConferenceForNewMail\(/);
  });

  it('takes the five arguments the feed passes it', () => {
    // userId, conferenceId, messageBaseId, user, bbsDataPath. A silent arity
    // change would not throw - it would just stop counting, which is exactly
    // the failure this file exists for.
    const scan = require(path.join(SRC, 'handlers/message/message-scan.handler'));

    expect(scan.scanConferenceForNewMail.length).toBe(5);
  });
});
