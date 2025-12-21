import type { Box } from '../../../engines/ui/blessed';
import type { ChannelMember, Channel } from '../types';
import { color, bold } from '../utils/ansi';

/** Create sidebar box config */
export function sidebarConfig() {
  return {
    label: ' Users ',
    border: { type: 'line' as const },
    tags: true,
    scrollable: true,
    style: { border: { fg: 'magenta' } }
  };
}

/** Format user for sidebar */
export function formatUser(member: ChannelMember): string {
  const prefix = member.isTyping ? '*' : ' ';
  const name = member.isOperator ? bold(member.username) : member.username;
  return `${prefix}${name}`;
}

/** Render user list */
export function renderUsers(box: Box, members: ChannelMember[]): void {
  const lines = members.map(formatUser);
  box.setContent(lines.join('\n'));
}

/** Format channel for list */
export function formatChannel(ch: Channel, isCurrent: boolean): string {
  const prefix = isCurrent ? '>' : ' ';
  const name = isCurrent ? bold(ch.name) : ch.name;
  return `${prefix}#${name} (${ch.memberCount})`;
}

/** Render channel list */
export function renderChannels(box: Box, channels: Channel[], currentId: string | null): void {
  const lines = channels.map(ch => formatChannel(ch, ch.id === currentId));
  box.setContent(lines.join('\n'));
}
