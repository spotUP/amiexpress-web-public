/**
 * `~XI<door>` names the door and nothing after it.
 *
 * An art file's last line routinely closes with a colour reset. The board's
 * conference bulletin ends `~XISUBSCAN` + ESC[0m, and the ESC was read as part
 * of the door's name: "SUBSCAN\x1b[0m" is no command, so every login printed
 * "No such command!!" and stacked a "Press any key" over the bulletin's pause
 * (found walking the login over telnet, 2026-09-27).
 */
import { parseMciCodes } from '../../src/handlers/screen.handler';

const aSession = (): any => ({
  user: { username: 'sysop', secLevel: 255 }, nodeId: 1, currentConf: 1, currentConfName: 'Main',
  timeRemaining: 3600, slowmo: 0, slowmoCount: 0,
});

describe('a ~XI door at the end of a coloured line', () => {
  it('queues the door by its own name', async () => {
    const result = await parseMciCodes('~\r\nart\r\n~XISUBSCAN\x1b[0m\r\n', aSession());
    expect(result.commands).toEqual(['SUBSCAN']);
  });

  it('leaves the colour reset in the screen, where the artist put it', async () => {
    const result = await parseMciCodes('~\r\nart\r\n~XISUBSCAN\x1b[0m\r\n', aSession());
    expect(result.parsed).toContain('\x1b[0m');
    expect(result.parsed).not.toContain('SUBSCAN');
  });

  it('still reads a door path with a colon and a slash', async () => {
    const result = await parseMciCodes('~\r\nx~XIDOORS:who/NO y', aSession());
    expect(result.commands).toEqual(['DOORS:who/NO']);
  });
});
