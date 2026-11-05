import { T } from '../door-theme';
/**
 * Pure builder for the LiveChat sidebar item list (channelList).
 *
 * Extracted from server.ts so the file stays under the 2000-line limit.
 * Builds the parallel `items` (rendered strings) and `channelItems`
 * (logical rows) arrays from app state. No blessed/UI side effects.
 */

export type ChannelItem =
  | { id: string; name: string; type: 'header' | 'spacer' }
  | { id: string; name: string; type: 'text' }
  | { id: string; name: string; type: 'voice' }
  | { id: string; name: string; type: 'user'; username: string }
  | { id: string; name: string; type: 'dm'; isGroup: boolean };

export interface BuilderInput {
  channelsToShow: any[];
  state: any;
  onlineUsers: Map<string, any>;
  presenceService: any;
  presenceIndicators: Record<string, string>;
  isCurrentChannel: (id?: string, name?: string) => boolean;
  expandedChannels: Set<string>;
  collapsedChannels: Set<string>;
  voiceChannelService: any;
}

export interface BuilderOutput {
  items: string[];
  channelItems: ChannelItem[];
}

export function buildSidebarItems(input: BuilderInput): BuilderOutput {
  const {
    channelsToShow,
    state,
    onlineUsers,
    presenceService,
    presenceIndicators,
    isCurrentChannel,
    expandedChannels,
    collapsedChannels,
    voiceChannelService,
  } = input;

  const items: string[] = [];
  const channelItems: ChannelItem[] = [];

  // ---------- TEXT CHANNELS ----------
  items.push(`{${T.accent}-fg}{bold}TEXT CHANNELS{/bold}{/${T.accent}-fg}`);
  channelItems.push({ id: '', name: '', type: 'header' });

  channelsToShow.forEach(ch => {
    const unread = ch.unreadCount ? ` (${ch.unreadCount})` : '';
    const isActive = isCurrentChannel(ch.id, ch.name);
    const hasUnread = ch.unreadCount && ch.unreadCount > 0;
    const isExpanded = collapsedChannels.has(ch.id)
      ? false
      : (isActive || expandedChannels.has(ch.id));

    let color: string;
    let endColor: string;
    if (isActive) { color = `{${T.ink}-fg}`; endColor = `{/${T.ink}-fg}`; }
    else if (hasUnread) { color = `{${T.ok}-fg}`; endColor = `{/${T.ok}-fg}`; }
    else { color = `{${T.dim}-fg}`; endColor = `{/${T.dim}-fg}`; }

    const arrow = isExpanded ? 'v' : '>';
    items.push(color + arrow + ' # ' + ch.name + unread + endColor);
    channelItems.push({ id: ch.id, name: ch.name, type: 'text' });

    if (isExpanded && isActive) {
      for (const [uid, u] of onlineUsers) {
        const presence = presenceService.get(parseInt(uid));
        const status = presence?.status || u.status;
        const indicator = presenceIndicators[status] || '*';
        items.push(`  {${T.dim}-fg}${indicator}{/${T.dim}-fg} ${u.username.slice(0, 12)}`);
        channelItems.push({ id: `user-${uid}`, name: u.username, type: 'user', username: u.username });
      }
    }
  });

  // Spacer
  items.push('');
  channelItems.push({ id: '', name: '', type: 'spacer' });

  // ---------- DIRECT MESSAGES ----------
  // Sits between text and voice. 1:1 = @, group = @@.
  const dmThreads = Array.isArray(state.dmThreads) ? state.dmThreads : [];
  if (dmThreads.length > 0) {
    items.push(`{${T.accent}-fg}{bold}DIRECT MESSAGES{/bold}{/${T.accent}-fg}`);
    channelItems.push({ id: '', name: '', type: 'header' });

    const maxLabel = 22;
    for (const t of dmThreads) {
      const isActive = state.currentDmThread === t.threadId;
      const color = isActive ? `{${T.ink}-fg}` : `{${T.dim}-fg}`;
      const endColor = isActive ? `{/${T.ink}-fg}` : `{/${T.dim}-fg}`;
      const prefix = t.isGroup ? '@@' : '@';
      let label = t.displayName || '(unknown)';
      if (label.length > maxLabel) label = label.slice(0, maxLabel - 1) + '…';
      items.push(color + prefix + ' ' + label + endColor);
      channelItems.push({ id: t.threadId, name: t.displayName, type: 'dm', isGroup: !!t.isGroup });
    }

    items.push('');
    channelItems.push({ id: '', name: '', type: 'spacer' });
  }

  // ---------- VOICE CHANNELS ----------
  items.push(`{${T.accent}-fg}{bold}VOICE CHANNELS{/bold}{/${T.accent}-fg}`);
  channelItems.push({ id: '', name: '', type: 'header' });

  const voiceChannels = voiceChannelService.getVoiceChannels();
  if (voiceChannels.length === 0) {
    const isInVoice = voiceChannelService.isInVoiceChannel();
    const icon = isInVoice ? `{${T.ok}-fg}[V]{/${T.ok}-fg}` : `{${T.dim}-fg}[V]{/${T.dim}-fg}`;
    items.push(icon + ` Voice {${T.dim}-fg}(0){/${T.dim}-fg}`);
    channelItems.push({ id: 'voice-voice', name: 'Voice', type: 'voice' });
  } else {
    voiceChannels.forEach((vc: any) => {
      const count = vc.participants.length;
      const isInVoice = voiceChannelService.getCurrentVoiceChannel() === vc.id;
      const icon = isInVoice ? `{${T.ok}-fg}[V]{/${T.ok}-fg}` : count > 0 ? `{${T.accent}-fg}[V]{/${T.accent}-fg}` : `{${T.dim}-fg}[V]{/${T.dim}-fg}`;
      // A talking marker: without it a busy channel and a silent one look
      // exactly alike, which is how a working voice channel read as broken.
      const talking = vc.participants.some((p: any) => p.isSpeaking)
        ? ` {${T.ok}-fg}[*]{/${T.ok}-fg}`
        : '';
      items.push(icon + ' ' + vc.name + ` {${T.dim}-fg}(` + count + `){/${T.dim}-fg}` + talking);
      channelItems.push({ id: 'voice-' + vc.id, name: vc.name, type: 'voice' });
    });
  }

  return { items, channelItems };
}
