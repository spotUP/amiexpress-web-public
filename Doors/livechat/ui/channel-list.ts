import type { Screen, List } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Channel } from '../types';

/** Create channel list component */
export function createChannelList(screen: Screen): List {
  return createList({
    parent: screen,
    top: 1,
    left: 0,
    width: 20,
    height: '100%-3',
    label: ' CHANNELS ',
    border: { type: 'line' },
    style: {
      fg: 'white',
      border: { fg: 'cyan' },
      selected: { bg: 'blue', fg: 'white', bold: true },
      item: { fg: 'white' },
    },
    keys: true,
    vi: true,
    scrollbar: { ch: '█' }
  });
}

/** Format channel item for list */
export function formatChannelItem(ch: Channel, unread: number): string {
  const prefix = ch.type === 'dm' ? '@' : '#';
  const badge = unread > 0 ? ` (${unread})` : '';
  return `${prefix}${ch.name}${badge}`;
}

/** Group channels by category */
export function groupChannels(channels: Channel[]): Map<string, Channel[]> {
  const grouped = new Map<string, Channel[]>();
  for (const ch of channels) {
    const cat = ch.category || 'Other';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(ch);
  }
  return grouped;
}

/** Build list items with categories */
export function buildChannelListItems(channels: Channel[]): string[] {
  const items: string[] = [];
  const grouped = groupChannels(channels);
  for (const [cat, chs] of grouped) {
    items.push(`{bold}${cat}{/bold}`);
    for (const ch of chs) {
      items.push(`  ${formatChannelItem(ch, 0)}`);
    }
  }
  return items;
}
