/**
 * D5b: the web teletext session is 26 rows, so a page's row 24 shows above
 * the door status bar. Entry point: applyGraphicsAnswer (the T answer), the
 * one place the web teletext session is created; the door then builds its
 * screen from the session height exactly as Doors/teletext/app.ts does.
 */
import { applyGraphicsAnswer } from '../../src/handlers/command-handler/pre-login';
import { doorScreenHeight, TELETEXT_SESSION_ROWS } from '../../src/amiga-emulation/xim/screen-width.util';
import { TeletextScreen } from '../../../../sdk/teletext/screen';
import { importTti } from '../../../../sdk/teletext/marco/tti/index';

describe('web teletext session rows (D5b)', () => {
  test('T answer makes a 26-row session; row 24 paints above the status bar', () => {
    const socket = { emit: jest.fn() };
    const session: any = { connectionType: 'web', user: {} };
    applyGraphicsAnswer(socket, session, 'T');

    expect(session.screenHeight).toBe(26);
    expect(TELETEXT_SESSION_ROWS).toBe(26);
    expect(doorScreenHeight(session, 24)).toBe(26);
    expect(socket.emit).toHaveBeenCalledWith('texttv-mode', { enabled: true, cols: 40, rows: 26 });

    const out: string[] = [];
    const screen = new TeletextScreen({
      write: d => out.push(d),
      rows: Number(session.screenHeight),
    });
    const page = importTti(['PN,10000', 'SC,0000', 'PS,8000', 'OL,1,TOP', 'OL,24,FASTEXT ROW'].join('\n')).pages[0].subpages[0];
    screen.paint(page);
    screen.status('P100');
    const all = out.join('');
    expect(all).toContain('\x1b[25;1H');
    expect(all).toContain('FASTEXT ROW');
    expect(all.indexOf('FASTEXT ROW')).toBeLessThan(all.indexOf('\x1b[26;1H'));
    expect(all).toContain('P100');
  });
});
