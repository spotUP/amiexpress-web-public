/**
 * Voice Channel List Integration
 *
 * Integrates voice channels into the main channel list (Discord-style)
 * - Shows voice channels with [V] prefix
 * - Displays participant count
 * - Click to join/leave
 */

export interface VoiceChannelInfo {
  id: string;
  name: string;
  participantCount: number;
  participants: Array<{
    userId: number | string;
    username: string;
    isSpeaking: boolean;
  }>;
}

export interface ChannelListItem {
  id: string;
  name: string;
  type: 'text' | 'voice';
  participantCount?: number;
  isActive?: boolean;
}

/**
 * Format channel list items to include voice channels
 */
export function formatChannelListWithVoice(
  textChannels: Array<{ id: string; name: string; isActive?: boolean }>,
  voiceChannels: VoiceChannelInfo[]
): ChannelListItem[] {
  const items: ChannelListItem[] = [];

  // Add text channels
  for (const channel of textChannels) {
    items.push({
      id: channel.id,
      name: channel.name,
      type: 'text',
      isActive: channel.isActive,
    });
  }

  // Add voice channels
  for (const voiceChannel of voiceChannels) {
    items.push({
      id: voiceChannel.id,
      name: voiceChannel.name,
      type: 'voice',
      participantCount: voiceChannel.participantCount,
    });
  }

  return items;
}

/**
 * Render channel item with appropriate prefix and formatting
 */
export function renderChannelItem(
  item: ChannelListItem,
  currentVoiceChannel?: string
): string {
  if (item.type === 'voice') {
    const icon = '[V]';
    const count = item.participantCount || 0;
    const isInVoice = item.id === currentVoiceChannel;

    // Highlight if currently in this voice channel
    if (isInVoice) {
      return `{green-fg}{bold}${icon} ${item.name} (${count}){/bold}{/green-fg}`;
    }

    // Show participant count
    if (count > 0) {
      return `{cyan-fg}${icon}{/cyan-fg} ${item.name} {gray-fg}(${count}){/gray-fg}`;
    }

    // Empty voice channel
    return `{gray-fg}${icon} ${item.name}{/gray-fg}`;
  }

  // Text channel
  const prefix = '#';
  if (item.isActive) {
    return `{bold}${prefix} ${item.name}{/bold}`;
  }
  return `${prefix} ${item.name}`;
}

/**
 * Check if channel list item is a voice channel
 */
export function isVoiceChannel(itemText: string): boolean {
  return itemText.includes('[V]');
}

/**
 * Extract channel ID from formatted channel item
 */
export function extractChannelId(items: ChannelListItem[], selectedIndex: number): {
  id: string;
  type: 'text' | 'voice';
} | null {
  if (selectedIndex < 0 || selectedIndex >= items.length) {
    return null;
  }

  const item = items[selectedIndex];
  return {
    id: item.id,
    type: item.type,
  };
}

/**
 * Update channel list with voice channel information
 */
export function updateChannelListDisplay(
  channelList: any,
  textChannels: Array<{ id: string; name: string; isActive?: boolean }>,
  voiceChannels: VoiceChannelInfo[],
  currentVoiceChannel?: string
): ChannelListItem[] {
  const items = formatChannelListWithVoice(textChannels, voiceChannels);

  // Render items with formatting
  const displayItems = items.map(item =>
    renderChannelItem(item, currentVoiceChannel)
  );

  // Update blessed list widget
  channelList.setItems(displayItems);

  return items;
}

/**
 * Get voice channel participant tooltip
 */
export function getVoiceChannelTooltip(voiceChannel: VoiceChannelInfo): string {
  if (voiceChannel.participantCount === 0) {
    return `${voiceChannel.name} - Empty`;
  }

  const participants = voiceChannel.participants
    .slice(0, 5) // Show max 5
    .map(p => {
      const speakingIcon = p.isSpeaking ? '[*]' : '[ ]';
      return `  ${speakingIcon} ${p.username}`;
    })
    .join('\n');

  const more = voiceChannel.participantCount > 5
    ? `\n  ... and ${voiceChannel.participantCount - 5} more`
    : '';

  return `${voiceChannel.name} (${voiceChannel.participantCount}):\n${participants}${more}`;
}

/**
 * Create voice channel section header
 */
export function createVoiceChannelHeader(): string {
  return '{cyan-fg}{bold}VOICE CHANNELS{/bold}{/cyan-fg}';
}

/**
 * Create text channel section header
 */
export function createTextChannelHeader(): string {
  return '{cyan-fg}{bold}TEXT CHANNELS{/bold}{/cyan-fg}';
}

/**
 * Format full channel list with section headers (Discord-style)
 */
export function formatChannelListWithHeaders(
  textChannels: Array<{ id: string; name: string; isActive?: boolean }>,
  voiceChannels: VoiceChannelInfo[],
  currentVoiceChannel?: string
): { displayItems: string[]; itemMapping: ChannelListItem[] } {
  const displayItems: string[] = [];
  const itemMapping: ChannelListItem[] = [];

  // Text channels section
  if (textChannels.length > 0) {
    displayItems.push(createTextChannelHeader());
    // Add placeholder for header (not selectable)
    itemMapping.push({ id: '', name: '', type: 'text' });

    for (const channel of textChannels) {
      const item: ChannelListItem = {
        id: channel.id,
        name: channel.name,
        type: 'text',
        isActive: channel.isActive,
      };
      displayItems.push(renderChannelItem(item, currentVoiceChannel));
      itemMapping.push(item);
    }
  }

  // Voice channels section
  if (voiceChannels.length > 0) {
    displayItems.push(''); // Spacer
    itemMapping.push({ id: '', name: '', type: 'text' });

    displayItems.push(createVoiceChannelHeader());
    itemMapping.push({ id: '', name: '', type: 'text' });

    for (const voiceChannel of voiceChannels) {
      const item: ChannelListItem = {
        id: voiceChannel.id,
        name: voiceChannel.name,
        type: 'voice',
        participantCount: voiceChannel.participantCount,
      };
      displayItems.push(renderChannelItem(item, currentVoiceChannel));
      itemMapping.push(item);
    }
  }

  return { displayItems, itemMapping };
}
