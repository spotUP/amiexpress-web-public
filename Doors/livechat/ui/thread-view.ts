/**
 * Thread view UI component
 */
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { PANEL_BORDER, PANEL_FOCUS_STYLE } from './theme';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { T } from '../door-theme';

export function createThreadView(screen: Screen, threadData: any) {
  const overlay = createBox({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '80%',
    height: '80%',
    border: {
      type: 'line',
      labelStyle: { fg: T.ink, bg: T.bar }  // Blue background for label
    },
    style: { border: { fg: PANEL_BORDER }, ...PANEL_FOCUS_STYLE },
    label: ` Thread: ${threadData.parent.message.substring(0, 40)}... `,
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
    scrollbar: { ch: '█' },
    focusable: true,
    hidden: true,
    trapFocus: true,
    zIndex: 9990,
  });

  // Parent message
  let content = `{bold}{${T.accent}-fg}Original Message:{/${T.accent}-fg}{/bold}\n`;
  content += `{${T.accentAlt}-fg}${threadData.parent.sender_username}{/${T.accentAlt}-fg}: ${threadData.parent.message}\n`;
  content += `{${T.dim}-fg}${new Date(threadData.parent.created_at * 1000).toLocaleString()}{/${T.dim}-fg}\n\n`;

  // Replies
  if (threadData.replies && threadData.replies.length > 0) {
    content += `{bold}{${T.ok}-fg}Replies (${threadData.replies.length}):{/${T.ok}-fg}{/bold}\n\n`;
    threadData.replies.forEach((reply: any, idx: number) => {
      content += `{${T.accent}-fg}${idx + 1}.{/${T.accent}-fg} {${T.accentAlt}-fg}${reply.sender_username}{/${T.accentAlt}-fg}: ${reply.message}\n`;
      content += `   {${T.dim}-fg}${new Date(reply.created_at * 1000).toLocaleString()}{/${T.dim}-fg}\n\n`;
    });
  } else {
    content += `{${T.dim}-fg}No replies yet. Be the first to reply!{/${T.dim}-fg}\n`;
  }

  content += `\n{${T.accent}-fg}Press ESC to close{/${T.accent}-fg}`;
  overlay.setContent(content);

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
