/**
 * Strip ANSI/VT100 escape sequences from a string.
 *
 * A session log captures a caller's raw terminal output — cursor moves,
 * colour codes, the works (SessionLogManager.ts's `output` field). Ink's
 * <Text> does not interpret those; it prints the literal bytes, which
 * breaks the TUI's own layout (string-width miscounts them) and can leave
 * the console's own screen in a strange state if a code slips through
 * uncleared. Rendered log content goes through this first; "Save to file"
 * (saveSessionLog) is how a sysop gets the untouched original for pasting
 * elsewhere, matching web's separate "Copy Log Content (ANSI preserved)"
 * vs. its own stripped terminal/raw views
 * (web/config-app/src/pages/SessionLogsPage.tsx, utils/ansi-parser.ts).
 *
 * Pattern is the same shape as the `ansi-regex` package (CSI sequences
 * introduced by ESC/CSI, plus OSC sequences terminated by BEL or ST) — not
 * imported as a dependency since dev/console doesn't otherwise depend on it
 * and this is a small, stable, well-known pattern.
 */
const ANSI_PATTERN =
  '[\\u001B\\u009B][[\\]()#;?]*' +
  '(?:' +
    '(?:(?:(?:;[-a-zA-Z\\d/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d/#&.:=?%@~_]*)*)?\\u0007)' +
    '|' +
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~])' +
  ')';

const ANSI_REGEX = new RegExp(ANSI_PATTERN, 'g');

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}
