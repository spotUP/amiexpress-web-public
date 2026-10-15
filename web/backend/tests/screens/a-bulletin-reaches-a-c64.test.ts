/**
 * THE BOARD'S OWN BULLETINS REACH A C64, AS CONTENT.
 *
 * The sysop, 2026-09-15, walking the board on a C64: "i still get a lot of
 * warning during log in and bulls etc". The warning is
 * `[80-COLUMN ANSI SCREEN - SKIPPED]` - a screen that scores as art and is
 * 80 columns wide was not shown at all.
 *
 * A generated `.seq` cannot answer for these: MultiTop rewrites bull1-6 at
 * every logoff, the achievements board rewrites AchieveTop, the news tick
 * rewrites bull7/bull8. A file drawn beside them freezes last week's numbers
 * in front of exactly the callers who cannot see the real ones. So the
 * adaptation happens when the screen is READ, through the C64 door adapter's
 * own rule ladder.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../../src/utils/flag-pause.util', () => ({
  checkForPause: jest.fn().mockResolvedValue(true),
  flagPause: jest.fn().mockResolvedValue(true),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayScreen } from '../../src/handlers/screen.handler';
import { config } from '../../src/config';

/** MultiTop's own shape: a rule, a header, and two columns of ranked names. */
const BULLETIN = [
  '\x1b[0;36m  MultiTop-II' + ' '.repeat(30) + 'Design Created (c)1994 Bobo/Mysti',
  '\x1b[0;33mNo# Username (Handle)   Uploaded Bytes No# Username (Handle)   Uploaded Bytes',
  '===-===================-==============-===-===================-==============',
  ' 1. sysop                    5,120,000 16. ansiguy                          0',
  ' 2. testuser                         0 17. anotheruser                      0',
  ' 3. thirduser                        0 18. fourthuser                       0',
  ' 4. fifthuser                        0 19. sixthuser                        0',
  ' 5. seventhuser                      0 20. eighthuser                       0',
  ' 6. ninthuser                        0 21. tenthuser                        0',
  '===-===================-==============-===-===================-==============',
].join('\r\n') + '\r\n';

function socketDouble() {
  const out: string[] = [];
  return {
    out,
    socket: {
      id: `bulletin-${Math.random().toString(36).slice(2)}`,
      on: () => {},
      off: () => {},
      removeListener: () => {},
      emit: (event: string, payload: any) => {
        if (event === 'ansi-output' && typeof payload === 'string') out.push(payload);
        return true;
      },
    } as any,
  };
}

const c64 = (): any => ({
  nodeId: 1, petsciiMode: true, screenWidth: 40, screenHeight: 25, user: { securityLevel: 255 },
});
const ansi = (): any => ({
  nodeId: 1, petsciiMode: false, screenWidth: 80, screenHeight: 24, user: { securityLevel: 255 },
});

/** The rows a caller actually got, with the colour bytes stripped. */
const rowsOf = (out: string[]): string[] =>
  out.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split(/\r?\n/).filter((r) => r.trim() !== '');

let root: string;
let previousRoot: any;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bulletin-40-'));
  fs.mkdirSync(path.join(root, 'Bulletins'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Screens', 'BULL.TXT'), BULLETIN, 'latin1');
  previousRoot = config.get('dataDir');
  (config as any).set?.('dataDir', root);
});

afterEach(() => {
  if (previousRoot !== undefined) (config as any).set?.('dataDir', previousRoot);
});

describe('an 80-column bulletin, served to a C64', () => {
  it('arrives as content, not as a skip notice', async () => {
    const { socket, out } = socketDouble();
    const shown = await displayScreen(socket, c64(), 'BULL', false);

    expect(shown).toBe(true);
    expect(out.join('')).not.toContain('SKIPPED');
    // The names and the numbers are what a bulletin IS.
    const text = rowsOf(out).join('\n');
    expect(text).toContain('sysop');
    expect(text).toContain('5,120,000');
    expect(text).toContain('MultiTop-II');
  });

  it('fits a C64 screen - no row wider than forty columns', async () => {
    const { socket, out } = socketDouble();
    await displayScreen(socket, c64(), 'BULL', false);

    const tooWide = rowsOf(out).filter((r) => r.length > 40);
    expect(tooWide).toEqual([]);
  });

  it('leaves the 80-column caller byte-identical', async () => {
    const { socket: c, out: narrow } = socketDouble();
    const { socket: w, out: wide } = socketDouble();
    await displayScreen(c, c64(), 'BULL', false);
    await displayScreen(w, ansi(), 'BULL', false);

    expect(wide.join('')).toContain('No# Username (Handle)   Uploaded Bytes No#');
    expect(narrow.join('')).not.toContain('No# Username (Handle)   Uploaded Bytes No#');
  });
});
