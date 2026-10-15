/**
 * RIP mode prefers .RIP screen files (express.e:6258-6260, 6277-6279,
 * 6294-6296): at every security level and at the plain name, the .RIP
 * variant is tried before the user's screen type and .TXT.
 *
 * Part of the "R at the graphics prompt loads the rip screen files"
 * feature: findSecurityScreen carried the ripMode parameter for months
 * with no caller passing true and no test proving it worked.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { findSecurityScreen } from '../../src/utils/screen-security.util';
import { displayScreen } from '../../src/handlers/screen.handler';
import { config } from '../../src/config';

describe('findSecurityScreen in RIP mode', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rip-screens-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('picks BULL.RIP over BULL.TXT when ripMode is on', () => {
    fs.writeFileSync(path.join(dir, 'BULL.RIP'), '!|*|c05\n');
    fs.writeFileSync(path.join(dir, 'BULL.TXT'), 'plain text\n');
    const base = path.join(dir, 'BULL');
    expect(findSecurityScreen(base, 0, null, true)).toBe(path.join(dir, 'BULL.RIP'));
  });

  test('still picks BULL.TXT when ripMode is off', () => {
    fs.writeFileSync(path.join(dir, 'BULL.RIP'), '!|*|c05\n');
    fs.writeFileSync(path.join(dir, 'BULL.TXT'), 'plain text\n');
    const base = path.join(dir, 'BULL');
    expect(findSecurityScreen(base, 0, null, false)).toBe(path.join(dir, 'BULL.TXT'));
  });

  test('security-levelled .RIP wins at the caller level', () => {
    fs.writeFileSync(path.join(dir, 'BULL10.RIP'), '!|*|c05\n');
    fs.writeFileSync(path.join(dir, 'BULL10.TXT'), 'plain\n');
    fs.writeFileSync(path.join(dir, 'BULL.TXT'), 'plain\n');
    const base = path.join(dir, 'BULL');
    expect(findSecurityScreen(base, 10, null, true)).toBe(path.join(dir, 'BULL10.RIP'));
  });

  test('falls back to .TXT when no .RIP exists, even in ripMode', () => {
    fs.writeFileSync(path.join(dir, 'BULL.TXT'), 'plain text\n');
    const base = path.join(dir, 'BULL');
    expect(findSecurityScreen(base, 0, null, true)).toBe(path.join(dir, 'BULL.TXT'));
  });
});

describe('displayScreen frames RIP screens', () => {
  // Through the REAL displayScreen (screen.handler, loaded the way
  // tests/screens/a-bulletin-reaches-a-c64.test.ts loads it) on a temp board
  // that has both a BULL.RIP and a BULL.TXT: an R caller gets the RIP bytes
  // raw inside the ESC[1! .. ESC[2! frame, and an ANSI caller gets no frame.
  let dir: string;
  let previousRoot: unknown;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rip-board-'));
    fs.mkdirSync(path.join(dir, 'Screens'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Screens', 'BULL.RIP'), '!|*|c05|L00001919', 'latin1');
    fs.writeFileSync(path.join(dir, 'Screens', 'BULL.TXT'), 'plain text\r\n', 'latin1');
    previousRoot = config.get('dataDir');
    config.set('dataDir', dir);
  });
  afterEach(() => {
    config.set('dataDir', previousRoot as string);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function shownTo(ripMode: boolean): Promise<string> {
    const out: string[] = [];
    const socket: any = {
      id: `rip-${ripMode}`, on: () => {}, off: () => {}, removeListener: () => {},
      emit: (event: string, payload: unknown) => { if (event === 'ansi-output') out.push(String(payload)); return true; },
    };
    await displayScreen(socket, { nodeId: 1, ripMode, screenWidth: 80, screenHeight: 24, user: { secLevel: 10 } } as any, 'BULL', false);
    return out.join('');
  }

  test('a RIP caller gets the .RIP bytes raw inside the [1!..[2! framing', async () => {
    expect(await shownTo(true)).toContain('\x1b[1!!|*|c05|L00001919\x1b[2!\r\n');
  });

  test('an ANSI caller is not framed', async () => {
    const out = await shownTo(false);
    expect(out).not.toContain('\x1b[1!');
    expect(out).toContain('plain text');
  });
});
