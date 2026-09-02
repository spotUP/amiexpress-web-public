/**
 * Pinned messages panel UI component
 */
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { PANEL_BORDER, PANEL_FOCUS_STYLE } from './theme';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { T } from '../door-theme';

export function createPinnedPanel(screen: Screen, pinnedMessages: any[]) {
  const overlay = createBox({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '80%',
    height: '70%',
    border: {
      type: 'line',
      labelStyle: { fg: T.ink, bg: T.bar }  // Blue background for label
    },
    style: { border: { fg: PANEL_BORDER }, ...PANEL_FOCUS_STYLE },
    label: ' Pinned Messages ',
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
    scrollbar: { ch: '█' },
    focusable: true,
    hidden: true,
    trapFocus: true,
  });

  if (pinnedMessages.length === 0) {
    overlay.setContent(`{${T.dim}-fg}No pinned messages in this room.{/${T.dim}-fg}\n\n{${T.accent}-fg}Press ESC to close{/${T.accent}-fg}`);
  } else {
    let content = `{bold}{${T.accentAlt}-fg}Pinned Messages (${pinnedMessages.length}):{/${T.accentAlt}-fg}{/bold}\n\n`;

    pinnedMessages.forEach((pin, idx) => {
      const pinnedDate = new Date(pin.pinned_at * 1000).toLocaleString();
      const messageDate = new Date(pin.message_created_at * 1000).toLocaleString();

      content += `{${T.accent}-fg}${idx + 1}.{/${T.accent}-fg} {${T.accentAlt}-fg}${pin.sender_username}{/${T.accentAlt}-fg}: ${pin.message}\n`;
      content += `   {${T.dim}-fg}Sent: ${messageDate}{/${T.dim}-fg}\n`;
      content += `   {${T.dim}-fg}Pinned by ${pin.pinned_by} on ${pinnedDate}{/${T.dim}-fg}\n\n`;
    });

    content += `\n{${T.accent}-fg}Press ESC to close{/${T.accent}-fg}`;
    overlay.setContent(content);
  }

  overlay.key(['escape', 'q'], () => {
    overlay.hide();
    overlay.destroy();
    screen.render();
  });

  overlay.show();
  overlay.focus();
  screen.render();

  return overlay;
}
