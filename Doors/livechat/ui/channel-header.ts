import type { Channel } from '../types';

/** Create channel header component */
export function createChannelHeader(blessed: any, screen: any) {
  return blessed.box({
    parent: screen,
    top: 1,
    left: 16,
    width: '100%-16',
    height: 1,
    style: { fg: 'cyan', bg: 'black', bold: true },
    tags: true,
    content: ''
  });
}

/** Format channel header content */
export function formatChannelHeader(channel: Channel | null, userCount: number): string {
  if (!channel) return ' No channel selected';
  const topic = channel.topic ? ` - ${channel.topic}` : '';
  const prefix = channel.type === 'dm' ? '@' : '#';
  return ` ${prefix}${channel.name}${topic} [${userCount} users]`;
}

/** Update channel header */
export function updateChannelHeader(
  header: any,
  channel: Channel | null,
  userCount: number
): void {
  header.setContent(formatChannelHeader(channel, userCount));
}

/** Format pinned indicator */
export function formatPinnedCount(count: number): string {
  return count > 0 ? ` [${count} pinned]` : '';
}
