/**
 * WHO's Chat column: express.e pads chatstr with `\l\s[9]` (24260), which
 * counts the escape's bytes - "YES" gets one space, "NO" two, so both fill
 * the four columns under "Chat" and the row's closing bar meets the frame.
 * The port printed "YES" bare and "NO " with one space: every row's last
 * bar sat one column left of the frame. The header's bytes are express's
 * too (24223: the blue starts inside the Location column).
 */
process.env.SKIP_DB_INIT = '1';

import { handleWhoCommand, setInfoCommandsDependencies } from '../../src/handlers/commands/info-commands.handler';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';

const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

function caller(nodeId: number, username: string, quietNode: boolean): any {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.DISPLAY_MENU,
    nodeId,
    user: { id: nodeId, username, location: 'Gothenburg', quietNode, secLevel: 255 },
  };
}

test('every WHO row closes on the frame, YES and NO alike', () => {
  const me = caller(1, 'spot', false);
  setInfoCommandsDependencies({ sessions: new Map([['a', me], ['b', caller(2, 'randy', true)]]) });
  const printed: string[] = [];
  const socket: any = { id: 'who-frame', emit: (e: string, d: unknown) => { if (e === 'ansi-output') printed.push(String(d)); } };

  handleWhoCommand(socket, me);
  flushOutput(socket);

  const lines = printed.join('').split('\r\n');
  const frame = visible(lines.find(l => visible(l).startsWith('.---'))!).length;
  const rows = lines.filter(l => /YES|NO/.test(visible(l)) && visible(l).startsWith('| 0'));
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(visible(row).length).toBe(frame);
  expect(printed.join('')).toContain('\x1b[36m Location   \x1b[34m         |');
});
