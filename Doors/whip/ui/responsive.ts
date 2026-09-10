import {
  createTerminalModeSwitch,
  type TerminalModeSwitch,
} from '@amiexpress/bbs-door-sdk/utils/terminal-mode';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

/**
 * WHIP's responsive switch (2026-09-10): the door opens at the board's
 * 80 columns and the caller asks for more with Alt+Enter - the same key
 * as livechat, grandmaster and the editors. Same contract as theirs:
 * widen on toggle, follow resizes, put 80 back on the way out.
 *
 * Fixed start, never wide: "opened in responsive mode by default in the
 * bbs it should not" (2026-09-01). Boards opened before a widen keep
 * their columns until reopened - kanban measures screen.width once at
 * open - so onRelayout repaints; the next board takes the width.
 */
export function attachResponsiveMode(
  bbs: any,
  screen: Screen,
  onRelayout: () => void
): TerminalModeSwitch {
  return createTerminalModeSwitch({
    bbs,
    screen,
    start: 'fixed',
    onRelayout,
  });
}
