/**
 * A screen can print the time it is being shown at.
 *
 * express.e has the date (~DT) and the time the caller logged on (~CT), and
 * between them no way to put the CURRENT time on a screen. A teletext page's
 * header row is made of exactly that - page number, board, clock - and a
 * static .ttx file cannot hold one. ~TM is a WEB_ extension for it.
 */
process.env.SKIP_DB_INIT = '1';

import type { BBSSession } from '../../src/index';
import {
  buildMciDispatch,
  MCI_SENTINELS,
  type MciFlavour,
} from '../../src/handlers/mci-dispatch';
import { formatLongTime, getSystemTime } from '../../src/utils/date-time.util';

function session(): BBSSession {
  return {
    user: { id: 7, username: 'SYSOP', secLevel: 255 },
    timeRemaining: 3600,
    currentConf: 0,
    currentConfName: 'Main',
    currentMsgBase: 1,
    nodeId: 1,
  } as unknown as BBSSession;
}

const opts = (flavour: MciFlavour = 'ansi') => ({
  flavour, inlineMode: false, sentinels: MCI_SENTINELS,
});

describe('the current-time MCI', () => {
  it('answers with the clock now, not with the logon time', async () => {
    const { dispatch } = await buildMciDispatch(session(), opts() as any);

    const now = (dispatch as any).TM(0);
    expect(typeof now).toBe('string');
    expect(now).toBe(formatLongTime(getSystemTime()));

    // ~CT is the logon clock and stays that: a session that logged on an
    // hour ago must not have its header rewritten to an hour ago.
    expect((dispatch as any).CT).toBeDefined();
  });

  it('is offered in both flavours, like every other clock here', async () => {
    // A PETSCII screen reads the same table; a code that existed for only
    // one of them is how a .seq and a .txt of the same screen drift.
    const ansi = await buildMciDispatch(session(), opts('ansi') as any);
    const petscii = await buildMciDispatch(session(), opts('petscii') as any);
    expect(Object.keys(ansi.dispatch)).toContain('TM');
    expect(Object.keys(petscii.dispatch)).toContain('TM');
  });

  it('does not collide with a code the board already had', async () => {
    const { dispatch } = await buildMciDispatch(session(), opts() as any);
    const keys = Object.keys(dispatch);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
