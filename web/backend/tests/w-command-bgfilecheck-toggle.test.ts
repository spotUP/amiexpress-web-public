/**
 * Regression test for C-W: W command option 16 (BACKGROUND FILE CHECK).
 *
 * express.e:25872-25879 — display:
 *   IF(checkToolTypeExists(TOOLTYPE_NODE,node,'BGFILECHECK'))
 *     AND (checkToolTypeExists(TOOLTYPE_NODE,node,'FORCE_BGFILECHECK')=FALSE)
 *     IF userFlags AND USER_BGFILECHECK THEN '... BACKGROUND FILE CHECK... [32mYES[0m'
 *     ELSE                                  '... BACKGROUND FILE CHECK... [37mNO[0m'
 *   ELSE
 *     '[16] [DISABLED]'
 *
 * express.e:26083-26087 — toggle:
 *   CASE 16: userFlags := Eor(userFlags, USER_BGFILECHECK)
 *
 * Web version drops the per-Node tooltype gating (no bg checker process
 * runs server-side, so the gate is moot) and lets the user toggle the
 * preference flag freely. Display still reads userFlags & BGFILECHECK
 * to show YES/NO. WEB_ tag documents the deviation.
 *
 * Pinning the YES/NO display logic + the EOR toggle in the case 16 handler.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('W command option 16 BGFILECHECK display + toggle (C-W, express.e:25872-25879 / 26083-26087)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'commands', 'info-commands.handler.ts'),
    'utf8'
  );

  test('display gates YES/NO on userFlags & BGFILECHECK (not always NO)', () => {
    // The display block reads bgfc = (userFlags) & BGFILECHECK and ternaries
    // a YES/NO emit. Find the BACKGROUND FILE CHECK label and look ~400
    // chars in either direction for the bit-test and YES/NO branches.
    const labelIdx = src.indexOf('BACKGROUND FILE CHECK');
    expect(labelIdx).toBeGreaterThan(-1);
    const window = src.substring(Math.max(0, labelIdx - 400), labelIdx + 400);
    expect(window).toMatch(/userFlags[\s\S]{0,40}?\)\s*&\s*UserFlag\.BGFILECHECK/);
    expect(window).toMatch(/['"`]\\x1b\[32mYES\\x1b\[0m['"`]/);
    expect(window).toMatch(/['"`]\\x1b\[37mNO\\x1b\[0m['"`]/);
  });

  test('case 16 toggles userFlags via XOR with UserFlag.BGFILECHECK and persists', () => {
    const block = src.match(
      /case 16:[\s\S]{0,800}?break;/
    );
    expect(block).not.toBeNull();
    // XOR toggle
    expect(block![0]).toMatch(
      /session\.user\.userFlags\s*=\s*\(session\.user\.userFlags[\s\S]{0,40}?\)\s*\^\s*UserFlag\.BGFILECHECK/
    );
    // Persist via db.updateUser
    expect(block![0]).toMatch(
      /db\.updateUser\([\s\S]{0,200}?userFlags:\s*session\.user\.userFlags/
    );
  });

  test('case 16 has WEB_ tag documenting the dropped Node tooltype gate', () => {
    const block = src.match(/case 16:[\s\S]{0,800}?break;/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/WEB_:|Web version/);
  });
});
