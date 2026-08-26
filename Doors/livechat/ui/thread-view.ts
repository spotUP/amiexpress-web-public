/**
 * Thread view UI component
 */
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { PANEL_BORDER, PANEL_FOCUS_STYLE } from './theme';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export function createThreadView(screen: Screen, threadData: any) {
  const overlay = createBox({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '80%',
    height: '80%',
    border: {
      type: 'line',
      labelStyle: { fg: 'white', bg: 'blue' }  // Blue background for label
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
  let content = `{bold}{cyan-fg}Original Message:{/cyan-fg}{/bold}\n`;
  content += `{yellow-fg}${threadData.parent.sender_username}{/yellow-fg}: ${threadData.parent.message}\n`;
  content += `{gray-fg}${new Date(threadData.parent.created_at * 1000).toLocaleString()}{/gray-fg}\n\n`;

  // Replies
  if (threadData.replies && threadData.replies.length > 0) {
    content += `{bold}{green-fg}Replies (${threadData.replies.length}):{/green-fg}{/bold}\n\n`;
    threadData.replies.forEach((reply: any, idx: number) => {
      content += `{cyan-fg}${idx + 1}.{/cyan-fg} {yellow-fg}${reply.sender_username}{/yellow-fg}: ${reply.message}\n`;
      content += `   {gray-fg}${new Date(reply.created_at * 1000).toLocaleString()}{/gray-fg}\n\n`;
    });
  } else {
    content += `{gray-fg}No replies yet. Be the first to reply!{/gray-fg}\n`;
  }

  content += `\n{cyan-fg}Press ESC to close{/cyan-fg}`;
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
