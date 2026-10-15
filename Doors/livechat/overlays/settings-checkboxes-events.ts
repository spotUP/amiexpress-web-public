/**
 * Settings event checkboxes
 */
import blessed, { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { AppState } from '../core/state';
import { T } from '../door-theme';

export function createEventCheckboxes(p: Box, state: AppState, l: number, r: number) {
  blessed.box({
    // A bar, not a frame: Panel borders when the caller names none, and a
    // one-row box with a frame has no interior - its content never renders.
    border: undefined,
    parent: p,
    top: r++,
    left: l,
    width: 20,
    height: 1,
    content: `{${T.accent}-fg}BBS Events:{/${T.accent}-fg}`,
    tags: true,
    style: { fg: T.ink },
  });

  const showLogins = blessed.checkbox({
    parent: p,
    top: r++,
    left: l + 2,
    text: 'Show User Logins/Logouts',
    checked: state.prefs.showLogins,
    mouse: true,
    style: { fg: T.ink },
  });

  const showFileActivity = blessed.checkbox({
    parent: p,
    top: r++,
    left: l + 2,
    text: 'Show File Uploads/Downloads',
    checked: state.prefs.showFileActivity,
    mouse: true,
    style: { fg: T.ink },
  });

  const showDoorActivity = blessed.checkbox({
    parent: p,
    top: r++,
    left: l + 2,
    text: 'Show Door Activity',
    checked: state.prefs.showDoorActivity,
    mouse: true,
    style: { fg: T.ink },
  });

  const showMessages = blessed.checkbox({
    parent: p,
    top: r++,
    left: l + 2,
    text: 'Show New Messages',
    checked: state.prefs.showMessages,
    mouse: true,
    style: { fg: T.ink },
  });

  const showAnnouncements = blessed.checkbox({
    parent: p,
    top: r++,
    left: l + 2,
    text: 'Show System Announcements',
    checked: state.prefs.showSystemAnnouncements,
    mouse: true,
    style: { fg: T.ink },
  });

  return { showLogins, showFileActivity, showDoorActivity, showMessages, showAnnouncements, nextRow: r };
}
