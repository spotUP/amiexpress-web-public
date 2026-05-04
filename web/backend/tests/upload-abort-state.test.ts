/**
 * Regression test for E-14: Upload A=Abort handling at filename input.
 *
 * express.e:17668-17670 — at the FileName prompt, a single 'A' or 'a' aborts
 * the batch upload by emitting '\b\n' and returning RESULT_FAILURE. The
 * caller cleanItUp's and returns to the main menu loop.
 *
 * Pinning the abort branch shape inside the UPLOAD_FILENAME_INPUT handler
 * catches regressions where:
 *   - the abort branch is removed (B-23-style "tidy up")
 *   - the post-abort transition drifts back to DISPLAY_CONF_BULL (which
 *     re-displays the conference bulletin instead of the menu — the
 *     parallel UPLOAD_OKAY_CONFIRM A=Abort path uses DISPLAY_MENU)
 *
 * Same grep-style approach as conference-join-conf-bull.test.ts because
 * command.handler.ts pulls in the entire BBS subsystem and can't be
 * loaded cleanly under jest.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Upload abort at filename input (E-14, express.e:17668-17670)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'command.handler.ts'),
    'utf8'
  );

  test('UPLOAD_FILENAME_INPUT branch contains A/a abort check', () => {
    const block = src.match(
      /subState === LoggedOnSubState\.UPLOAD_FILENAME_INPUT[\s\S]{0,1500}/
    );
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(
      /\(\s*input === ['"]A['"]\s*\|\|\s*input === ['"]a['"]\s*\)\s*&&\s*input\.length === 1/
    );
  });

  test('abort emits \\r\\n and returns to DISPLAY_MENU (not DISPLAY_CONF_BULL)', () => {
    // Match from the input==='A' || input==='a' guard to the next return,
    // so we only pin the abort branch (not the blank-line / validation paths).
    const abortBranch = src.match(
      /input === ['"]A['"]\s*\|\|\s*input === ['"]a['"][\s\S]{0,400}?return;/
    );
    expect(abortBranch).not.toBeNull();
    const block = abortBranch![0];
    expect(block).toMatch(/emitText\(socket,\s*['"`]\\r\\n['"`]\)/);
    expect(block).toMatch(/subState\s*=\s*LoggedOnSubState\.DISPLAY_MENU\b/);
    expect(block).not.toMatch(/DISPLAY_CONF_BULL/);
    expect(block).toMatch(/tempData\s*=\s*undefined/);
  });

  test('cites express.e:17668-17670 for the abort branch', () => {
    const block = src.match(
      /subState === LoggedOnSubState\.UPLOAD_FILENAME_INPUT[\s\S]{0,1500}/
    );
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/express\.e:17668-17670/);
  });
});
