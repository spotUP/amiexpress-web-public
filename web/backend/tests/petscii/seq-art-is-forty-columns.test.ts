/**
 * Phase 6 of the 80-column PETSCII plan: `.seq` art is FORTY columns wide.
 *
 * A `.seq` is a C64 screen the sysop drew cell by cell. There is no fold that
 * makes one 80 columns without stretching it or leaving half the screen
 * empty, so an 80-column PETSCII caller is served the ordinary ANSI screen
 * instead - which costs him nothing, because the transducer turns it into
 * PETSCII on the wire exactly as it does every other byte the board sends.
 * It is the same sentence a door's `<name>_C64` files already follow
 * (xim/io-file-display.ts): art named for the C64's screen is 40 columns
 * wide, and an 80-column caller gets the ordinary file.
 *
 * Driven at the REAL entry point - `displayScreen(socket, session, 'Logoff')`,
 * the call system-commands.handler.ts makes - because the choice lives inside
 * loadScreenFile's variant list and nothing else can reach it. LOGOFF is the
 * screen to drive it with: the board ships BOTH `001.logoff.seq` and
 * `001.logoff.txt`, so the resolver has a real choice to get wrong, and
 * `session.lastScreenFilePath` is the file it settled on rather than a path
 * this test handed it.
 */
import * as path from 'path';

process.env.SKIP_DB_INIT = '1';

import { displayScreen } from '../../src/handlers/screen.handler';

/** The `~3SR_` die, pinned so the walker always lands on the 001 screen. */
const FIRST_SCREEN = 0;

interface Captured {
  petsciiBytes: Buffer[];
  ansi: string[];
}

const captured = (): Captured => ({ petsciiBytes: [], ansi: [] });

const socketFor = (cap: Captured) =>
  ({
    id: `seq-art-width-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    emit: (event: string, data: any) => {
      if (event === 'petscii-bytes') cap.petsciiBytes.push(Buffer.from(data, 'base64'));
      else if (event === 'ansi-output') cap.ansi.push(String(data));
    },
    on: () => {},
  }) as any;

/** A PETSCII caller at one of the two widths the graphics prompt offers. */
const petsciiSession = (columns: 40 | 80): any => ({
  petsciiMode: true,
  petsciiColumns: columns,
  screenWidth: columns,
  nodeId: 1,
  currentConf: 0,
  currentConfName: 'Amiga',
  user: { username: 'Spot', timesCalled: 42 },
});

const screenPath = (file: string) =>
  new RegExp(`${path.sep}Screens${path.sep}logoff${path.sep}${file}$`);

describe('a .seq is 40-column art, so only a 40-column caller is served one', () => {
  let randomSpy: jest.SpyInstance;
  beforeEach(() => { randomSpy = jest.spyOn(Math, 'random').mockReturnValue(FIRST_SCREEN); });
  afterEach(() => randomSpy?.mockRestore());

  it('the C64 caller lands on 001.logoff.seq and gets its art as PETSCII bytes', async () => {
    const cap = captured();
    const session = petsciiSession(40);

    expect(await displayScreen(socketFor(cap), session, 'Logoff')).toBe(true);

    expect(session.lastScreenFilePath).toMatch(screenPath('001\\.logoff\\.seq'));
    expect(cap.petsciiBytes.length).toBeGreaterThan(0);
  });

  it('the 80-column caller lands on 001.logoff.txt instead - the art is not stretched', async () => {
    const cap = captured();
    const session = petsciiSession(80);

    expect(await displayScreen(socketFor(cap), session, 'Logoff')).toBe(true);

    expect(session.lastScreenFilePath).toMatch(screenPath('001\\.logoff\\.txt'));
    // No hand-drawn 40-column screen was put on his 80-column glass...
    expect(cap.petsciiBytes).toHaveLength(0);
    // ...and he is not left with a blank screen either: the ordinary screen
    // went out, and the transducer downstream is what makes it PETSCII.
    expect(cap.ansi.join('').length).toBeGreaterThan(0);
  });
});
