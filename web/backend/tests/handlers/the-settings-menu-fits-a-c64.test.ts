/**
 * "SCROLLBACK DOESNT WORK IN PETSCII MODE SO I CANT SEE ALL OPTIONS IN W"
 * (the sysop, 2026-09-23).
 *
 * It does not, and it should not - a C64 has 25 rows and no scrollback. The
 * menu is what has to fit. Measured on a real 40x25 session before the
 * change: 28 rows, five of them wider than 40 columns and so wrapping to two,
 * which is 33 rows on a screen that holds 25.
 */
import { squeezeRow, visibleLength, wMenuPage, wMenuPrompt, wMenuPageStep }
  from '../../src/handlers/commands/w-menu-pager';

const ESC = String.fromCharCode(27);
const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
const ROW = `${ESC}[34m[${ESC}[0m 17${ESC}[34m] ${ESC}[35mMODEM EMULATION SPEED.. ${ESC}[33mMAX (No Throttle)${ESC}[0m`;

describe('a settings row on a C64', () => {
  it('fits by losing dots, not by losing its value', () => {
    const squeezed = squeezeRow(ROW, 40);

    expect(visibleLength(squeezed)).toBeLessThanOrEqual(40);
    expect(strip(squeezed)).toContain('MODEM EMULATION');
    expect(squeezed).toContain('MAX (No Throttle)');
    expect(squeezed).toContain('17');
  });

  it('keeps a leader, so the label does not run into the value', () => {
    expect(strip(squeezeRow(ROW, 40))).toMatch(/EMULATION\.+ MAX/);
  });

  it('cuts the value only when the dots have run out', () => {
    const cut = squeezeRow('[ 19] VIEW MY DATA (GDPR).... print a copy of your record', 40);
    expect(visibleLength(cut)).toBe(40);
    // The label keeps its floor; the sentence after it is what is cut.
    expect(cut).toContain('VIEW MY DATA');
    expect(cut).toContain('print a copy');
  });

  it('leaves a row that already fits exactly as it was', () => {
    const short = `${ESC}[34m[${ESC}[0m 10${ESC}[34m] ${ESC}[35mSCREEN CLEAR............ ${ESC}[33mNO${ESC}[0m`;
    expect(squeezeRow(short, 80)).toBe(short);
  });
});

describe('the settings menu on a screen that does not scroll', () => {
  const lines = Array.from({ length: 28 }, (_, i) => `[ ${i}] OPTION ${i}`);

  it('hands out one screenful at a time', () => {
    const first = wMenuPage(lines, 40, 20, 1);

    expect(first.rows).toHaveLength(20);
    expect(first.pages).toBe(2);
    expect(first.rows[0]).toContain('OPTION 0');
  });

  it('shows the rest on the next page', () => {
    const second = wMenuPage(lines, 40, 20, 2);

    expect(second.rows).toHaveLength(8);
    expect(second.rows[7]).toContain('OPTION 27');
  });

  it('wraps round to the first page when the caller asks for one past the last', () => {
    // Clamping meant `+` on the last page repainted the last page: the screen
    // changed and nothing moved, with no way back to the top but to leave.
    expect(wMenuPage(lines, 40, 20, 3).page).toBe(1);
    expect(wMenuPage(lines, 40, 20, 4).page).toBe(2);
    expect(wMenuPage(lines, 40, 20, 0).page).toBe(2);   // `-` from the first
  });

  it('says how to reach the rest, and says nothing when there is no rest', () => {
    expect(wMenuPrompt(wMenuPage(lines, 40, 20, 1))).toContain('+=page 1/2');
    expect(wMenuPrompt(wMenuPage(lines, 40, 40, 1))).toBe('Which to change <CR>=QUIT ? ');
  });

  it('knows a page step from an option number', () => {
    expect(wMenuPageStep('+')).toBe(1);
    expect(wMenuPageStep('-')).toBe(-1);
    expect(wMenuPageStep('22')).toBeNull();
    expect(wMenuPageStep('')).toBeNull();
  });
});

/**
 * And through the real command, which is the only proof that matters: the
 * menu a 40x25 caller is handed, and what `+` does next.
 */
jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../../src/handlers/door.handler', () => ({ executeDoor: jest.fn() }));
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({ getDoors: () => [] }));
jest.mock('../../src/database', () => ({ db: { updateUser: jest.fn(async () => undefined) } }));
jest.mock('../../src/utils/acs.util', () => {
  const actual = jest.requireActual('../../src/utils/acs.util');
  return { ...actual, checkSecurity: () => true };
});

import { flushOutput } from '../../src/utils/output.util';
import {
  handleWriteUserParamsCommand, handleWOptionSelectInput,
} from '../../src/handlers/commands/info-commands.handler';

let seq = 0;

function caller(width: number, height: number) {
  const emitted: string[] = [];
  const session: any = {
    nodeId: 1, currentConf: 1, tempData: {},
    petsciiMode: width === 40, terminalType: width === 40 ? 'c64' : 'web',
    screenWidth: width, screenHeight: height,
    user: { id: 'u1', username: 'SYSOP', secLevel: 255, email: 'a@b.c' },
  };
  const socket: any = {
    id: `w-fits-${seq++}`, session,
    emit(event: string, data: unknown) { if (event === 'ansi-output') emitted.push(String(data)); return true; },
    on() { return socket; },
  };
  let raw = '';
  const rows = () => {
    flushOutput(socket);
    raw = emitted.join('');
    emitted.length = 0;
    return raw.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').split('\r\n');
  };
  return { socket, session, rows, lastRaw: () => raw };
}

describe('the settings menu a C64 caller is handed', () => {
  it('fits his screen, every row and the page as a whole', () => {
    const d = caller(40, 25);
    handleWriteUserParamsCommand(d.socket, d.session);
    const rows = d.rows();

    expect(rows.length).toBeLessThanOrEqual(25);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(40);
  });

  it('tells him there is more, and gives it to him', async () => {
    const d = caller(40, 25);
    handleWriteUserParamsCommand(d.socket, d.session);
    expect(d.rows().join('\n')).toContain('+=page 1/2');

    await handleWOptionSelectInput(d.socket, d.session, '+');
    const second = d.rows().join('\n');

    // The PETSCII character set is the row he could not reach.
    expect(second).toContain('PETSCII CHARACTER SET');
    expect(second).toContain('page 2/2');
    // And the page REPLACES the one before it: a C64 has no scrollback, so
    // printing under the last page leaves the caller reading the tail of both.
    expect(d.lastRaw()).toContain('\u001b[2J');
  });

  it('comes back round to the first page', async () => {
    const d = caller(40, 25);
    handleWriteUserParamsCommand(d.socket, d.session);
    d.rows();

    await handleWOptionSelectInput(d.socket, d.session, '+');
    d.rows();
    await handleWOptionSelectInput(d.socket, d.session, '+');

    expect(d.rows().join('\n')).toContain('page 1/2');
  });

  it('still takes the number he types, from whichever page he is on', async () => {
    const d = caller(40, 25);
    handleWriteUserParamsCommand(d.socket, d.session);
    await handleWOptionSelectInput(d.socket, d.session, '+');
    await handleWOptionSelectInput(d.socket, d.session, '22');

    expect(d.session.user.petsciiCharset).toBe('swedish');
  });
});

describe('the settings menu on the board\'s own screen', () => {
  it('is not paged, and says nothing about pages', () => {
    const d = caller(80, 24);
    handleWriteUserParamsCommand(d.socket, d.session);
    const text = d.rows().join('\n');

    expect(text).toContain('LOGIN NAME');
    expect(text).toContain('PETSCII CHARACTER SET');
    expect(text).toContain('Which to change <CR>=QUIT ? ');
    expect(text).not.toContain('=page');
  });
});

/**
 * And the page key itself, from the keystroke rather than from the handler:
 * "if + shall do something in W i dont think it works" (the sysop,
 * 2026-09-23). The prompt says `+=page 1/2`, which reads as a KEY.
 */
import { handleUserEditInput } from '../../src/handlers/command-handler/user-edit-states';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

describe('the page key', () => {
  it('turns the page on the keystroke, with no RETURN after it', async () => {
    const d = caller(40, 25);
    handleWriteUserParamsCommand(d.socket, d.session);
    d.rows();

    await handleUserEditInput(d.socket, d.session, '+');

    expect(d.rows().join('\n')).toContain('PETSCII CHARACTER SET');
  });

  it('is still a character when the caller is typing a number', async () => {
    const d = caller(40, 25);
    handleWriteUserParamsCommand(d.socket, d.session);
    d.session.subState = LoggedOnSubState.W_OPTION_SELECT;
    d.rows();

    await handleUserEditInput(d.socket, d.session, '2');
    await handleUserEditInput(d.socket, d.session, '+');

    expect(d.session.inputBuffer).toBe('2+');
  });
});
