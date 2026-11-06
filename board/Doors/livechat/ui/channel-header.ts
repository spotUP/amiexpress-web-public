import type { Channel } from '../types';
import { T } from '../door-theme';

/** Create channel header component */
export function createChannelHeader(blessed: any, screen: any) {
  return blessed.box({
    // A bar, not a frame: Panel borders when the caller names none, and a
    // one-row box with a frame has no interior - its content never renders.
    border: undefined,
    parent: screen,
    top: 1,
    left: 16,
    width: '100%-16',
    height: 1,
    style: { fg: T.accent, bold: true },
    tags: true,
    content: ''
  });
}

/**
 * The chat panel's title: the channel name and its topic. This title is what
 * the user reads as the channel header, and it showed only "#general" after
 * /topic was set - the topic lived in state but no title ever included it.
 */
export function chatPanelTitle(channelName: string, topic: string | undefined, suffix = ''): string {
  return topic ? `${channelName} - ${topic}${suffix}` : `${channelName}${suffix}`;
}

/** Format channel header content */
export function formatChannelHeader(channel: Channel | null, userCount: number): string {
  if (!channel) return ' No channel selected';
  const prefix = channel.type === 'dm' ? '@' : '#';
  return ` ${chatPanelTitle(prefix + channel.name, channel.topic)} [${userCount} users]`;
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
