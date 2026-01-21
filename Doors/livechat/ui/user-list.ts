import type { Screen, List } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { ChannelMember, PresenceStatus } from '../types';
import { PRESENCE_INDICATORS, PRESENCE_COLORS } from '../types';
import { color, bold } from '../utils/ansi';

/** Create user list component */
export function createUserList(screen: Screen): List {
  return createList({
    parent: screen,
    top: 1,
    right: 0,
    width: 20,
    height: '100%-3',
    label: ' USERS ',
    border: { type: 'line' },
    hidden: true,
    style: {
      fg: 'white',
      border: { fg: 'magenta' },
      selected: { bg: 'blue', fg: 'white' },
    },
    scrollbar: { ch: '█' },
    tags: true
  });
}

/** Format user for list */
export function formatUserItem(
  member: ChannelMember,
  status: PresenceStatus,
  isTyping: boolean
): string {
  const indicator = PRESENCE_INDICATORS[status];
  const c = PRESENCE_COLORS[status];
  const prefix = isTyping ? '*' : ' ';
  let name = member.username;
  if (member.role === 'owner' || member.role === 'admin') {
    name = bold(name);
  }
  return `${prefix}${color(indicator, c)} ${name}`;
}

/** Build user list items */
export function buildUserListItems(
  members: ChannelMember[],
  presenceMap: Map<string, PresenceStatus>,
  typingSet: Set<string>
): string[] {
  return members.map(m => formatUserItem(
    m,
    presenceMap.get(m.userId) || 'offline',
    typingSet.has(m.userId)
  ));
}
