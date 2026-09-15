/**
 * Pressing Return at the menu redraws the menu. Every time.
 *
 * express.e:28228 redisplays the menu when a caller enters an empty command,
 * with no rate limit of any kind. This port added a 500ms debounce to
 * `displayMainMenu` for "rapid door-completion/state-transition races" - a
 * guard with no express.e equivalent - and it does not know the difference
 * between a race and a keystroke.
 *
 * The live board, 2026-09-15, while the sysop was at the menu:
 *
 *   === handleCommand called ===  data: "\r"   subState: read_command
 *    Empty command, redisplaying menu
 *   [menu] displayMainMenu SKIPPED (debounce - last menu was 129 ms ago)
 *
 * Two separate keypresses, the second swallowed. He pressed a key and the
 * board did nothing - which is worse than the doubled draw the guard exists
 * to prevent, because the caller is the one who asked.
 *
 * Source-level because `command.handler` pulls in the whole BBS and cannot be
 * loaded under jest; the same reason `upload-abort-state` reads it this way.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'handlers', 'command.handler.ts'), 'utf8');
const MENU = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'handlers', 'command-handler', 'menu.ts'), 'utf8');

/** The empty-command branch, sliced to the call it makes. */
function emptyCommandBranch(): string {
  const at = SRC.indexOf('Empty command, redisplaying menu');
  expect(at).toBeGreaterThan(-1);
  return SRC.slice(at, SRC.indexOf(';', SRC.indexOf('menuDisplayMainMenu', at)));
}

describe('an empty command at the menu', () => {
  it('redraws the menu without asking the debounce', () => {
    expect(emptyCommandBranch()).toMatch(/menuDisplayMainMenu\(socket, session, false, [^)]*true\)/);
  });

  it('cites the express.e line it is porting', () => {
    expect(SRC.slice(SRC.indexOf('Empty command, redisplaying menu') - 900,
                     SRC.indexOf('Empty command, redisplaying menu'))).toContain('28228');
  });
});

describe('the debounce itself', () => {
  it('still exists for the races it was written for', () => {
    // The round trip: this fix exempts ONE caller, it does not delete the
    // guard. Internal callers that fire twice on a state transition still
    // meet it.
    expect(MENU).toContain('_lastMainMenuTime');
    expect(MENU).toMatch(/now - lastMenuTime < 500/);
  });

  it('can be bypassed by a caller that means it', () => {
    expect(MENU).toMatch(/bypassDebounce/);
  });

  it('is still marked as having no express.e equivalent', () => {
    // So nobody later mistakes it for ported behaviour.
    expect(MENU).toMatch(/no express\.e equivalent/i);
  });
});
