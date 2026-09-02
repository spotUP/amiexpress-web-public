import type { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { PANEL_BORDER } from './theme';
import type { DisplayMessage } from '../types';
import { userName, timestamp } from '../utils/ansi';
import { escapeContent } from '../utils/format';
import { T } from '../door-theme';

/** Create chat panel box config */
export function chatPanelConfig() {
  return {
    label: ' Chat ',
    border: { type: 'line' as const },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '█', track: { ch: '│', style: { fg: T.dim } }, style: { fg: T.accent } },
    tags: true,
    style: {
      fg: T.ink,
      border: { fg: PANEL_BORDER }
    }
  };
}

/** Format message for display */
export function formatMessage(msg: DisplayMessage): string {
  const time = timestamp(msg.time);
  const name = userName(msg.username, msg.color);
  const content = escapeContent(msg.content);
  if (msg.isSystem) {
    return `${time} {${T.dim}-fg}*** ${content}{/${T.dim}-fg}`;
  }
  return `${time} ${name}: ${content}`;
}

/** Render messages to box */
export function renderMessages(box: Box, messages: DisplayMessage[]): void {
  const lines = messages.map(formatMessage);
  box.setContent(lines.join('\n'));
  box.setScrollPerc(100);
}
