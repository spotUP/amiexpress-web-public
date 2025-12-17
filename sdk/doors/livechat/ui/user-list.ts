import type { ChannelMember, PresenceStatus } from '../types';
import { PRESENCE_INDICATORS, PRESENCE_COLORS } from '../types';
import { color, bold } from '../utils/ansi';

/** Create user list component */
export function createUserList(blessed: any, screen: any) {
  return blessed.list({
    parent: screen,
    top: 1,
    right: 0,
    width: 16,
    height: '100%-3',
    label: ' USERS ',
    border: { type: 'line' },
    hidden: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'magenta' },
      selected: { bg: 'blue', fg: 'white' },
      label: { fg: 'magenta', bold: true }
    },
    scrollbar: { ch: '|', style: { inverse: true } },
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
