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

describe('displayScreen frames RIP screens (source pin)', () => {
  // The behavioural proof is the login probe (R -> \x1b[1! + !| + \x1b[2!);
  // importing the real screen.handler drags in the server. The pin holds
  // the framing block in place the way screen-loader-case.test.ts pins the
  // variant ordering.
  test('the isRip branch emits the [1!..[2! framing and returns before MCI', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/handlers/screen.handler.ts'),
      'utf8',
    );
    expect(src).toContain("if (isRip && session.ripMode) {");
    expect(src).toContain("'\\x1b[1!' + content + '\\x1b[2!\\r\\n'");
  });
});
