/**
 * A PETSCII caller is not offered a terminal font.
 *
 * The sysop, 2026-09-28: "i can break it by connecting in petscii mode and
 * change font to for example topaz" - "changing font should be gated in
 * petscii mode". A PETSCII screen is the C64 character ROM on the canvas; the
 * font pick reached the hidden xterm behind it. Both font menus - W row 18
 * and F in the user stats screen - now say so instead of offering a list.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/database', () => ({ db: { updateUser: jest.fn(), getUserById: jest.fn() } }));

import { handleWOptionSelectInput } from '../../src/handlers/commands/info-commands.handler';
import { handleUserStatsMenuInput } from '../../src/handlers/commands/user-commands.handler';
import { flushOutput } from '../../src/utils/output.util';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { PETSCII_FONT_IS_FIXED } from '../../src/utils/petscii-session-model';

function aCaller(petscii: boolean) {
  const events: Array<[string, unknown]> = [];
  const socket: any = {
    id: `font-gate-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => events.push([event, data]),
    on: () => {},
  };
  const session: any = {
    user: { id: 'u1', username: 'sysop', secLevel: 255, fontPreference: 'TopazPlus_a1200' },
    nodeId: 1, currentConf: 1, relConfNum: 1, screenWidth: petscii ? 40 : 80, screenHeight: 25,
    petsciiMode: petscii, subState: LoggedOnSubState.W_OPTION_SELECT, tempData: {},
  };
  const text = () => { flushOutput(socket); return events.filter(([e]) => e === 'ansi-output').map(([, d]) => String(d)).join(''); };
  return { socket, session, events, text };
}

describe('the terminal font menus', () => {
  it('W row 18 tells a PETSCII caller why, and opens no font list', async () => {
    const { socket, session, events, text } = aCaller(true);

    await handleWOptionSelectInput(socket, session, '18');

    expect(text()).toContain(PETSCII_FONT_IS_FIXED);
    expect(session.subState).not.toBe(LoggedOnSubState.W_EDIT_FONT);
    expect(events.some(([e]) => e === 'set-font')).toBe(false);
  });

  it('W row 18 still opens the font list for an ANSI caller', async () => {
    const { socket, session, text } = aCaller(false);

    await handleWOptionSelectInput(socket, session, '18');

    expect(text()).toContain('Select Terminal Font');
    expect(session.subState).toBe(LoggedOnSubState.W_EDIT_FONT);
  });

  it('F in the user stats screen does the same for a PETSCII caller', () => {
    const { socket, session, text } = aCaller(true);
    session.subState = LoggedOnSubState.USER_STATS_MENU;

    handleUserStatsMenuInput(socket, session, 'F');

    expect(text()).toContain(PETSCII_FONT_IS_FIXED);
    expect(session.subState).not.toBe(LoggedOnSubState.FONT_SELECTION);
  });
});
