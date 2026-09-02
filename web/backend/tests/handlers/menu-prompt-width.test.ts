/**
 * C64/40-col plan, Task 4b (sysop, 2026-09-02): the main command prompt is
 * too long for a C64.
 *
 * express.e:28417-28420 builds it as
 *   [0m[35m{bbsName} [0m[[36m{conf}[34m:[36m{name}[0m] Menu ([33m{mins}[0m mins. left):
 * which is 69 printable columns with an 18-char board name and a 22-char
 * conference name - it folds twice on a 40-column screen.
 *
 * On a PETSCII session ONLY, the board name and the words "Menu" and
 * "left" come off, and the conference name is clamped so the whole prompt
 * fits the session width. Every other caller gets the express.e bytes,
 * unchanged - including a narrow ANSI terminal (a phone reporting 40
 * columns is NOT a C64; petsciiMode is the only switch).
 */

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
  doPause: jest.fn(),
  hasKeysFile: jest.fn().mockReturnValue(false),
  hasKeysFileForResolvedPath: jest.fn().mockReturnValue(false),
  parseMciCodes: jest.fn(),
}));
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
  getConfig: jest.fn().mockReturnValue({
    get: jest.fn((key: string) => (key === 'bbsName' ? 'AmiExpress Web BBS' : null)),
  }),
  getMessageBases: jest.fn().mockReturnValue([]),
  getProcessOlmMessageQueue: jest.fn().mockReturnValue(null),
  getScreenMenu: jest.fn().mockReturnValue('MENU'),
}));
jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: jest.fn().mockReturnValue({
    forceMenus: false, noBulls: false, noConfBulls: false,
    forceNewscan: false, noNewscan: false, showNewFiles: false, noNewFiles: false,
    menuPrompt: '',
  }),
}));
jest.mock('../../src/utils/time-tracking.util', () => ({
  updateTimeUsed: jest.fn(),
  checkTimeUsed: jest.fn().mockResolvedValue(false),
  getTimeRemainingMinutes: jest.fn().mockReturnValue(60),
}));
jest.mock('../../src/utils/output.util', () => ({
  emitText: jest.fn(),
  emitPrompt: jest.fn(),
}));
jest.mock('../../src/handlers/transfer/olm.handler', () => ({
  processOlmQueue: jest.fn(),
}), { virtual: true });

import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { displayMenuPrompt } from '../../src/handlers/command-handler/menu';
import { getMessageBases } from '../../src/handlers/command-handler/dependency-injection';
import { emitPrompt } from '../../src/utils/output.util';
import { buildMenuPrompt } from '../../src/utils/menu-prompt.util';

/** 22 characters - the longest realistic conference name on this board. */
const LONG_CONF = 'Amiga Demo Scene Chat!';

function printableLength(text: string): number {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length;
}

function makeSocket() {
  return { emit: jest.fn() };
}

function makeSession(overrides: any = {}) {
  return {
    user: { username: 'tester', expert: 'N' },
    subState: LoggedOnSubState.READ_COMMAND,
    relConfNum: 2,
    currentConf: 1,
    currentConfName: 'TestConf',
    currentMsgBase: 1,
    timeRemaining: 60,
    ...overrides,
  };
}

function lastPrompt(): string {
  const calls = (emitPrompt as jest.Mock).mock.calls;
  return calls.length ? calls[calls.length - 1][1] : '';
}

beforeEach(() => {
  (emitPrompt as jest.Mock).mockClear();
});

describe('buildMenuPrompt - 80 columns is express.e:28417 byte-for-byte', () => {
  const fields = {
    bbsName: 'AmiExpress Web BBS',
    relConfNum: 2,
    confDisplayName: LONG_CONF,
    timeLeft: 60,
  };

  const EXPECTED_80 =
    '\x1b[0m\x1b[35mAmiExpress Web BBS \x1b[0m[\x1b[36m2\x1b[34m:\x1b[36m' +
    LONG_CONF +
    '\x1b[0m] Menu (\x1b[33m60\x1b[0m mins. left): ';

  it('matches the express.e format for a session with no petsciiMode', () => {
    expect(buildMenuPrompt(fields, {})).toBe(EXPECTED_80);
  });

  it('matches the express.e format for an explicitly non-PETSCII session', () => {
    expect(buildMenuPrompt(fields, { petsciiMode: false })).toBe(EXPECTED_80);
  });

  it('matches the express.e format for a narrow ANSI terminal (a phone is not a C64)', () => {
    expect(buildMenuPrompt(fields, { screenWidth: 40, petsciiMode: false })).toBe(EXPECTED_80);
  });

  it('matches the express.e format when the session is missing entirely', () => {
    expect(buildMenuPrompt(fields, undefined)).toBe(EXPECTED_80);
  });
});

describe('buildMenuPrompt - 40 columns for a PETSCII session', () => {
  const c64 = { petsciiMode: true, screenWidth: 40 };

  it('drops the BBS name', () => {
    const prompt = buildMenuPrompt(
      { bbsName: 'AmiExpress Web BBS', relConfNum: 2, confDisplayName: LONG_CONF, timeLeft: 60 },
      c64
    );
    expect(prompt).not.toContain('AmiExpress Web BBS');
  });

  it('fits inside 40 columns, leaving the last one for the cursor, with a 22-char name', () => {
    const prompt = buildMenuPrompt(
      { bbsName: 'AmiExpress Web BBS', relConfNum: 2, confDisplayName: LONG_CONF, timeLeft: 60 },
      c64
    );
    expect(printableLength(prompt)).toBeLessThanOrEqual(39);
  });

  it('is exactly these bytes - trailing space and colour codes included', () => {
    const prompt = buildMenuPrompt(
      { bbsName: 'AmiExpress Web BBS', relConfNum: 2, confDisplayName: LONG_CONF, timeLeft: 60 },
      c64
    );
    expect(prompt).toBe(
      '\x1b[0m[\x1b[36m2\x1b[34m:\x1b[36mAmiga Demo Scene Chat!\x1b[0m] (\x1b[33m60\x1b[0m mins): '
    );
  });

  it('still names the conference number, the conference and the time left', () => {
    const prompt = buildMenuPrompt(
      { bbsName: 'AmiExpress Web BBS', relConfNum: 2, confDisplayName: 'General', timeLeft: 60 },
      c64
    );
    const plain = prompt.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    expect(plain).toContain('2:General');
    expect(plain).toContain('60');
  });

  it('clamps an over-long conference name rather than overflowing', () => {
    const prompt = buildMenuPrompt(
      {
        bbsName: 'AmiExpress Web BBS',
        relConfNum: 12,
        confDisplayName: 'A Conference Name Far Too Long For Forty Columns',
        timeLeft: 1440,
      },
      c64
    );
    expect(printableLength(prompt)).toBeLessThanOrEqual(39);
  });

  it('leaves the cursor column free for the multi-message-base display name too', () => {
    const prompt = buildMenuPrompt(
      {
        bbsName: 'AmiExpress Web BBS',
        relConfNum: 2,
        confDisplayName: `${LONG_CONF} - Chatter`,
        timeLeft: 60,
      },
      c64
    );
    expect(printableLength(prompt)).toBeLessThanOrEqual(39);
  });
});

describe('displayMenuPrompt uses the session width (real dispatch)', () => {
  it('emits the express.e 80-column prompt for an ordinary session', () => {
    displayMenuPrompt(makeSocket(), makeSession({ currentConfName: LONG_CONF }));

    expect(lastPrompt()).toBe(
      '\x1b[0m\x1b[35mAmiExpress Web BBS \x1b[0m[\x1b[36m2\x1b[34m:\x1b[36m' +
        LONG_CONF +
        '\x1b[0m] Menu (\x1b[33m60\x1b[0m mins. left): '
    );
  });

  it('emits a prompt without the BBS name, inside 39 columns, for a PETSCII session', () => {
    displayMenuPrompt(
      makeSocket(),
      makeSession({ currentConfName: LONG_CONF, petsciiMode: true, screenWidth: 40 })
    );

    const prompt = lastPrompt();
    expect(prompt).not.toContain('AmiExpress Web BBS');
    expect(printableLength(prompt)).toBeLessThanOrEqual(39);
  });

  it('leaves the cursor column free on the multiple-message-base branch as well', () => {
    (getMessageBases as jest.Mock).mockReturnValueOnce([
      { id: 1, conferenceId: 1, name: 'General' },
      { id: 2, conferenceId: 1, name: 'Chatter' },
    ]);

    displayMenuPrompt(
      makeSocket(),
      makeSession({ currentConfName: LONG_CONF, petsciiMode: true, screenWidth: 40 })
    );

    expect(printableLength(lastPrompt())).toBeLessThanOrEqual(39);
  });
});
