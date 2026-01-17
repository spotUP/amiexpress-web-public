"use strict";
/**
 * Voice Channel List Integration
 *
 * Integrates voice channels into the main channel list (Discord-style)
 * - Shows voice channels with [V] prefix
 * - Displays participant count
 * - Click to join/leave
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatChannelListWithVoice = formatChannelListWithVoice;
exports.renderChannelItem = renderChannelItem;
exports.isVoiceChannel = isVoiceChannel;
exports.extractChannelId = extractChannelId;
exports.updateChannelListDisplay = updateChannelListDisplay;
exports.getVoiceChannelTooltip = getVoiceChannelTooltip;
exports.createVoiceChannelHeader = createVoiceChannelHeader;
exports.createTextChannelHeader = createTextChannelHeader;
exports.formatChannelListWithHeaders = formatChannelListWithHeaders;
/**
 * Format channel list items to include voice channels
 */
function formatChannelListWithVoice(textChannels, voiceChannels) {
    const items = [];
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
function renderChannelItem(item, currentVoiceChannel) {
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
function isVoiceChannel(itemText) {
    return itemText.includes('[V]');
}
/**
 * Extract channel ID from formatted channel item
 */
function extractChannelId(items, selectedIndex) {
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
function updateChannelListDisplay(channelList, textChannels, voiceChannels, currentVoiceChannel) {
    const items = formatChannelListWithVoice(textChannels, voiceChannels);
    // Render items with formatting
    const displayItems = items.map(item => renderChannelItem(item, currentVoiceChannel));
    // Update blessed list widget
    channelList.setItems(displayItems);
    return items;
}
/**
 * Get voice channel participant tooltip
 */
function getVoiceChannelTooltip(voiceChannel) {
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
function createVoiceChannelHeader() {
    return '{cyan-fg}{bold}VOICE CHANNELS{/bold}{/cyan-fg}';
}
/**
 * Create text channel section header
 */
function createTextChannelHeader() {
    return '{cyan-fg}{bold}TEXT CHANNELS{/bold}{/cyan-fg}';
}
/**
 * Format full channel list with section headers (Discord-style)
 */
function formatChannelListWithHeaders(textChannels, voiceChannels, currentVoiceChannel) {
    const displayItems = [];
    const itemMapping = [];
    // Text channels section
    if (textChannels.length > 0) {
        displayItems.push(createTextChannelHeader());
        // Add placeholder for header (not selectable)
        itemMapping.push({ id: '', name: '', type: 'text' });
        for (const channel of textChannels) {
            const item = {
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
            const item = {
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
