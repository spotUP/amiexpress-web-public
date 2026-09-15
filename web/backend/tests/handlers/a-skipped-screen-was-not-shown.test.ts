/**
 * A SCREEN THE BOARD DECLINED TO DRAW WAS NOT SHOWN.
 *
 * Sysop, 2026-09-15, photographing a C64 screen holding one line - "[80-COLUMN
 * ANSI SCREEN - SKIPPED]" - and a cursor: "stuck here on live".
 *
 * He was not stuck. He was already logged in on another node, and that is
 * everything the board managed to tell him. `login-post.service.ts` is
 * express.e:29715-29727:
 *
 *     IF displayScreen(SCREEN_ONENODE) = FALSE
 *       aePuts('You are already logged into another node!')
 *
 * The fallback exists for a board whose ONENODE screen cannot reach the
 * caller - and a 40-column caller IS such a board, because ONENODE.TXT is
 * 80-column ANSI art and the PETSCII path skips art rather than smearing it.
 * displayScreen answered TRUE for the skip, the fallback was suppressed, and
 * the caller was disconnected half a second later with no reason given.
 *
 * The rule is the fix: the skip token is a NOTICE, not a screen.
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

/** Eighty columns of the board's own kind of art: a solid ruled frame. */
const ART = [
  '\x1b[0;36m' + '+' + '-'.repeat(78) + '+',
  ...Array.from({ length: 10 }, () => '|' + '#'.repeat(78) + '|'),
  '+' + '-'.repeat(78) + '+',
].join('\r\n') + '\r\n';

function board(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skip-screen-'));
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Screens', 'ONENODE.TXT'), ART, 'latin1');
  return root;
}

function socketDouble() {
  const out: string[] = [];
  return {
    out,
    socket: {
      id: `skip-test-${Math.random().toString(36).slice(2)}`,
      // The output buffer registers a disconnect handler on whatever it is
      // given, so the double has to be an emitter as well as a sink.
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
  nodeId: 1,
  petsciiMode: true,
  screenWidth: 40,
  screenHeight: 25,
  user: { securityLevel: 255 },
});

const ansi = (): any => ({
  nodeId: 1,
  petsciiMode: false,
  screenWidth: 80,
  screenHeight: 25,
  user: { securityLevel: 255 },
});

describe('the 80-column art skip', () => {
  let root: string;
  let previousRoot: any;

  beforeEach(() => {
    root = board();
    previousRoot = config.get('dataDir');
    (config as any).set?.('dataDir', root);
  });

  afterEach(() => {
    if (previousRoot !== undefined) (config as any).set?.('dataDir', previousRoot);
  });

  it('tells the caller it skipped, and answers that the screen was NOT shown', async () => {
    const { socket, out } = socketDouble();
    const shown = await displayScreen(socket, c64(), 'ONENODE', false);

    expect(out.join('')).toContain('SKIPPED');
    // RED before the fix: this was `true`, so every caller with a text
    // fallback for an unshowable screen stayed silent.
    expect(shown).toBe(false);
  });

  it('still answers TRUE for the same screen on an 80-column caller', async () => {
    const { socket, out } = socketDouble();
    const shown = await displayScreen(socket, ansi(), 'ONENODE', false);

    expect(shown).toBe(true);
    expect(out.join('')).not.toContain('SKIPPED');
    expect(out.join('')).toContain('#');
  });
});
