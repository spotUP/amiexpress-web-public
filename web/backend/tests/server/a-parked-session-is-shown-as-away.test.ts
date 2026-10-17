/**
 * S10: a parked web session (dropped, inside its resume window) is AWAY.
 *
 * WHO and NM show `Detached` in the action column for it - the name stays,
 * so a sysop can see whose session is waiting - and the notify senders treat
 * the caller as not on the board (email and push go out). A resume clears
 * `detachedAt` and every reader flips back.
 *
 * WHO and NM both take the action from who-table.util's whoEntry, so the
 * rule lives there once; these tests drive the two commands to prove each
 * passes the parked state in.
 */
process.env.SKIP_DB_INIT = '1';

import { handleWhoCommand, setInfoCommandsDependencies } from '../../src/handlers/commands/info-commands.handler';
import { handleNodeManagementCommand, setMessageCommandsDependencies } from '../../src/handlers/message/message-commands.handler';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';
import { userSessions } from '../../src/server/session-manager';
import { isLoggedOn } from '../../src/notify/presence';

const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

function caller(nodeId: number, username: string, extra: Record<string, unknown> = {}): any {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.DISPLAY_MENU,
    nodeId,
    screenWidth: 80,
    user: { id: nodeId, username, location: 'Gothenburg', secLevel: 255 },
    ...extra,
  };
}

function capture(): { socket: any; text: () => string } {
  const printed: string[] = [];
  const socket: any = { id: `away-${Math.random()}`, emit: (e: string, d: unknown) => { if (e === 'ansi-output') printed.push(String(d)); } };
  return { socket, text: () => { flushOutput(socket); return visible(printed.join('')); } };
}

/** The row of the given node, as the viewer sees it. */
function rowOf(text: string, name: string): string {
  return text.split('\r\n').filter(l => l.includes(name)).join(' / ');
}

describe('a parked session is shown as away', () => {
  it('WHO says Detached for a parked caller and his activity again after a resume', () => {
    const me = caller(1, 'spot');
    const parked = caller(2, 'randy', { detachedAt: Date.now() });
    setInfoCommandsDependencies({ sessions: new Map([['1', me], ['2', parked]]) });

    let out = capture();
    handleWhoCommand(out.socket, me);
    expect(rowOf(out.text(), 'randy')).toContain('Detached');

    parked.detachedAt = undefined;
    out = capture();
    handleWhoCommand(out.socket, me);
    const row = rowOf(out.text(), 'randy');
    expect(row).toContain('IDLE');
    expect(row).not.toContain('Detached');
  });

  it.each([80, 40])('NM says Detached for a parked caller at %i columns', (width) => {
    const me = caller(1, 'spot', { screenWidth: width });
    const parked = caller(2, 'randy', { detachedAt: Date.now() });
    setMessageCommandsDependencies({ sessions: new Map([['1', me], ['2', parked]]) } as any);

    let out = capture();
    handleNodeManagementCommand(out.socket, me);
    expect(out.text()).toContain('Detached');

    parked.detachedAt = undefined;
    out = capture();
    handleNodeManagementCommand(out.socket, me);
    expect(out.text()).not.toContain('Detached');
  });

  it('the notify senders see a parked caller as not on the board', () => {
    const parked = caller(2, 'randy', { detachedAt: Date.now() });
    userSessions.set('u-randy', parked);
    try {
      expect(isLoggedOn('u-randy')).toBe(false);
      parked.detachedAt = undefined;
      expect(isLoggedOn('u-randy')).toBe(true);
    } finally {
      userSessions.delete('u-randy');
    }
  });
});
