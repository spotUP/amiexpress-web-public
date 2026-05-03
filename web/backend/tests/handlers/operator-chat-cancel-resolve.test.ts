/**
 * Regression for #12: cancelling an operator-page (Q / CTRL+C / /CANCEL while in
 * OPERATOR_CHAT_WAITING) used to crash the command handler with:
 *   Error: TypeInfo not known for "OperatorChatRepository"
 *       at handleCommand (.../command.handler.ts)
 *
 * Background:
 *   The earlier code resolved the repository through tsyringe:
 *     const repository = container.resolve(OperatorChatRepository);
 *   But OperatorChatRepository is NOT decorated with @injectable(), so
 *   tsyringe threw on every cancel. The exception propagated up through
 *   handleCommand, the user got an [ERROR] line, and the page state was
 *   left dangling — i.e. the cancel never actually fired.
 *
 *   The fix routes the lookup through the same path that every other
 *   OperatorChat caller uses (index.ts, config-routes.ts, the
 *   OPERATOR_CHAT_ACTIVE branch a few lines down): db.getOperatorChatRepository().
 *
 * This test is a source-level guard — it asserts the buggy resolve pattern
 * is gone and the new pattern is present, so future edits can't silently
 * re-introduce the crash.
 */

import * as fs from 'fs';
import * as path from 'path';

const COMMAND_HANDLER_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../src/handlers/command.handler.ts'),
  'utf8'
);

// Strip line comments + block comments so the source-level regex tests don't
// false-positive against historical references to the buggy pattern preserved
// in the explanatory comments alongside the fix.
function stripComments(src: string): string {
  // Remove block comments first, then line comments. Order matters because
  // a `// ...` inside a /* */ would otherwise be left behind.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('OPERATOR_CHAT_WAITING cancel — repository resolution (regression for #12)', () => {
  const SRC_NO_COMMENTS = stripComments(COMMAND_HANDLER_SRC);

  // Carve out the OPERATOR_CHAT_WAITING block so we don't accidentally match
  // patterns from elsewhere in the giant command.handler.ts file.
  const operatorWaitingBlockMatch = SRC_NO_COMMENTS.match(
    /session\.subState === LoggedOnSubState\.OPERATOR_CHAT_WAITING[\s\S]*?return;/
  );

  test('the OPERATOR_CHAT_WAITING block exists and is locatable in command.handler.ts', () => {
    expect(operatorWaitingBlockMatch).not.toBeNull();
  });

  test('the cancel branch resolves OperatorChatRepository via getDatabase(), not tsyringe container', () => {
    expect(operatorWaitingBlockMatch).not.toBeNull();
    const block = operatorWaitingBlockMatch![0];

    // The buggy pattern must not be present anywhere in this block.
    expect(block).not.toMatch(/container\.resolve\s*\(\s*OperatorChatRepository\s*\)/);

    // The correct pattern must be present.
    expect(block).toMatch(/getDatabase\s*\(\s*\)/);
    expect(block).toMatch(/getOperatorChatRepository\s*\(\s*\)/);
  });

  test('cancel branch has a fallback path when the repository is unavailable (no silent crash)', () => {
    expect(operatorWaitingBlockMatch).not.toBeNull();
    const block = operatorWaitingBlockMatch![0];

    // The fix includes an else branch that emits "Aborted!" and resets subState
    // when the database isn't available, so the user is never stuck waiting.
    expect(block).toMatch(/Aborted!/);
    expect(block).toMatch(/DISPLAY_MENU/);
  });

  test('cancel triggers on Q, CTRL+C, /QUIT, or /CANCEL (matches express.e:2342)', () => {
    expect(operatorWaitingBlockMatch).not.toBeNull();
    const block = operatorWaitingBlockMatch![0];

    // CTRL+C is byte 0x03
    expect(block).toMatch(/\\x03/);
    expect(block).toMatch(/['"]Q['"]/);
    expect(block).toMatch(/\/QUIT/);
    expect(block).toMatch(/\/CANCEL/);
  });
});
