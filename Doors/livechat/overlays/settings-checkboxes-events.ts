/**
 * Settings event checkboxes
 */
import blessed, { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { AppState } from '../core/state';

export function createEventCheckboxes(p: Box, state: AppState, l: number, r: number) {
  blessed.box({
    parent: p,
    top: r++,
    left: l,
    width: 20,
    height: 1,
    content: '{cyan-fg}BBS Events:{/cyan-fg}',
    tags: true,
    style: { fg: 'white' },
  });

  const showLogins = blessed.checkbox({
    parent: p,
    top: r++,
    left: l + 2,
    text: 'Show User Logins/Logouts',
    checked: state.prefs.showLogins,
    mouse: true,
    style: { fg: 'white' },
  });

  const showFileActivity = blessed.checkbox({
    parent: p,
    top: r++,
    left: l + 2,
    text: 'Show File Uploads/Downloads',
    checked: state.prefs.showFileActivity,
    mouse: true,
    style: { fg: 'white' },
  });

  const showDoorActivity = blessed.checkbox({
    parent: p,
    top: r++,
    left: l + 2,
    text: 'Show Door Activity',
    checked: state.prefs.showDoorActivity,
    mouse: true,
    style: { fg: 'white' },
  });

  const showMessages = blessed.checkbox({
    parent: p,
    top: r++,
    left: l + 2,
    text: 'Show New Messages',
    checked: state.prefs.showMessages,
    mouse: true,
    style: { fg: 'white' },
  });

  const showAnnouncements = blessed.checkbox({
    parent: p,
    top: r++,
    left: l + 2,
    text: 'Show System Announcements',
    checked: state.prefs.showSystemAnnouncements,
    mouse: true,
    style: { fg: 'white' },
  });

  return { showLogins, showFileActivity, showDoorActivity, showMessages, showAnnouncements, nextRow: r };
}
