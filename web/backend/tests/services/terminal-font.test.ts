/**
 * One font list, one way to apply a pick.
 *
 * W row 18 offered five fonts under its own numbering and sent `set-font`;
 * the user stats menu offered eight, spelled out twice, and sent
 * `font-changed`, which nothing listens for - so its pick was saved and only
 * showed at the next login. A third route, `set-font-preference`, had no
 * sender at all. Now both menus read TERMINAL_FONTS and apply through
 * chooseTerminalFont.
 */
process.env.SKIP_DB_INIT = '1';

const updateUser = jest.fn();
jest.mock('../../src/database', () => ({ db: { updateUser: (...a: unknown[]) => updateUser(...a) } }));

import { TERMINAL_FONTS } from '../../src/constants/terminal-fonts';
import { BBS_FONTS } from '../../../../packages/terminal/src/utils/session-font';
import { chooseTerminalFont, fontForChoice } from '../../src/services/terminal-font.service';
import { handleFontSelectionInput } from '../../src/handlers/commands/user-commands.handler';
import { handleWEditFontInput } from '../../src/handlers/commands/info-commands.handler';

function aCaller(petscii = false) {
  const events: Array<[string, unknown]> = [];
  const socket: any = { id: `tf-${Math.random()}`, emit: (e: string, d: unknown) => events.push([e, d]), on: () => {} };
  const session: any = { user: { id: 'u1', username: 'sysop', secLevel: 255 }, petsciiMode: petscii, currentConf: 1, relConfNum: 1, screenWidth: 80, tempData: {} };
  return { socket, session, events };
}

beforeEach(() => updateUser.mockReset());

describe('the terminal font', () => {
  it('is offered from the same list the browser loads', () => {
    expect(TERMINAL_FONTS.map((f) => f.id)).toEqual([...BBS_FONTS]);
  });

  it('reads a menu number as the same font in either menu', () => {
    expect(fontForChoice('1')).toBe('mosoul');
    expect(fontForChoice(String(TERMINAL_FONTS.length))).toBe('TopazPlus_a1200');
    expect(fontForChoice('0')).toBeNull();
    expect(fontForChoice('x')).toBeNull();
  });

  it('picked in the user stats menu, reaches the screen now - not at the next login', async () => {
    const { socket, session, events } = aCaller();
    await handleFontSelectionInput(socket, session, '5');
    expect(events).toContainEqual(['set-font', 'Topaz_a500']);
    expect(updateUser).toHaveBeenCalledWith('u1', { fontPreference: 'Topaz_a500' });
  });

  it('picked at W row 18, offers all eight', async () => {
    const { socket, session, events } = aCaller();
    await handleWEditFontInput(socket, session, '2');
    expect(events).toContainEqual(['set-font', 'MicroKnight']);
  });

  it('is never applied to a PETSCII session, whichever menu asked', async () => {
    const { socket, session, events } = aCaller(true);
    expect(await chooseTerminalFont(socket, session, 'Topaz_a500')).toBe('petscii');
    expect(events.some(([e]) => e === 'set-font')).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
