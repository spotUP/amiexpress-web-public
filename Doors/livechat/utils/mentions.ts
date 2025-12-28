/** Mention types */
export type MentionType = 'user' | 'everyone' | 'here';

/** Parsed mention */
export interface Mention {
  type: MentionType;
  username?: string;
  start: number;
  end: number;
}

/** Extract mentions from text */
export function extractMentions(text: string): Mention[] {
  const mentions: Mention[] = [];
  const regex = /@(\w+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    let type: MentionType = 'user';
    if (name === 'everyone') type = 'everyone';
    else if (name === 'here') type = 'here';

    mentions.push({
      type,
      username: type === 'user' ? match[1] : undefined,
      start: match.index,
      end: match.index + match[0].length
    });
  }

  return mentions;
}

/** Check if text mentions a specific user */
export function mentionsUser(text: string, username: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes(`@${username.toLowerCase()}`);
}

/** Check if text has @everyone or @here */
export function hasBroadcastMention(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('@everyone') || lower.includes('@here');
}

/** Highlight mentions for display */
export function highlightMentions(text: string, currentUser: string): string {
  return text.replace(/@(\w+)/g, (match, name) => {
    const lower = name.toLowerCase();
    if (lower === currentUser.toLowerCase()) {
      // Use specific closing tags to avoid resetting ALL attributes
      return `{yellow-bg}{black-fg}@${name}{/black-fg}{/yellow-bg}`;
    }
    if (lower === 'everyone' || lower === 'here') {
      return `{red-fg}@${name}{/red-fg}`;
    }
    return `{cyan-fg}@${name}{/cyan-fg}`;
  });
}

/** Get list of mentioned usernames */
export function getMentionedUsers(text: string): string[] {
  const mentions = extractMentions(text);
  return mentions
    .filter(m => m.type === 'user' && m.username)
    .map(m => m.username!);
}
