"use strict";
/**
 * Pure builder for the LiveChat sidebar item list (channelList).
 *
 * Extracted from server.ts so the file stays under the 2000-line limit.
 * Builds the parallel `items` (rendered strings) and `channelItems`
 * (logical rows) arrays from app state. No blessed/UI side effects.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSidebarItems = buildSidebarItems;
function buildSidebarItems(input) {
    const { channelsToShow, state, onlineUsers, presenceService, presenceIndicators, isCurrentChannel, expandedChannels, collapsedChannels, voiceChannelService, } = input;
    const items = [];
    const channelItems = [];
    // ---------- TEXT CHANNELS ----------
    items.push('{cyan-fg}{bold}TEXT CHANNELS{/bold}{/cyan-fg}');
    channelItems.push({ id: '', name: '', type: 'header' });
    channelsToShow.forEach(ch => {
        const unread = ch.unreadCount ? ` (${ch.unreadCount})` : '';
        const isActive = isCurrentChannel(ch.id, ch.name);
        const hasUnread = ch.unreadCount && ch.unreadCount > 0;
        const isExpanded = collapsedChannels.has(ch.id)
            ? false
            : (isActive || expandedChannels.has(ch.id));
        let color;
        let endColor;
        if (isActive) {
            color = '{white-fg}';
            endColor = '{/white-fg}';
        }
        else if (hasUnread) {
            color = '{green-fg}';
            endColor = '{/green-fg}';
        }
        else {
            color = '{gray-fg}';
            endColor = '{/gray-fg}';
        }
        const arrow = isExpanded ? 'v' : '>';
        items.push(color + arrow + ' # ' + ch.name + unread + endColor);
        channelItems.push({ id: ch.id, name: ch.name, type: 'text' });
        if (isExpanded && isActive) {
            for (const [uid, u] of onlineUsers) {
                const presence = presenceService.get(parseInt(uid));
                const status = presence?.status || u.status;
                const indicator = presenceIndicators[status] || '*';
                items.push(`  {gray-fg}${indicator}{/gray-fg} ${u.username.slice(0, 12)}`);
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
        items.push('{cyan-fg}{bold}DIRECT MESSAGES{/bold}{/cyan-fg}');
        channelItems.push({ id: '', name: '', type: 'header' });
        const maxLabel = 22;
        for (const t of dmThreads) {
            const isActive = state.currentDmThread === t.threadId;
            const color = isActive ? '{white-fg}' : '{gray-fg}';
            const endColor = isActive ? '{/white-fg}' : '{/gray-fg}';
            const prefix = t.isGroup ? '@@' : '@';
            let label = t.displayName || '(unknown)';
            if (label.length > maxLabel)
                label = label.slice(0, maxLabel - 1) + '…';
            items.push(color + prefix + ' ' + label + endColor);
            channelItems.push({ id: t.threadId, name: t.displayName, type: 'dm', isGroup: !!t.isGroup });
        }
        items.push('');
        channelItems.push({ id: '', name: '', type: 'spacer' });
    }
    // ---------- VOICE CHANNELS ----------
    items.push('{cyan-fg}{bold}VOICE CHANNELS{/bold}{/cyan-fg}');
    channelItems.push({ id: '', name: '', type: 'header' });
    const voiceChannels = voiceChannelService.getVoiceChannels();
    if (voiceChannels.length === 0) {
        const isInVoice = voiceChannelService.isInVoiceChannel();
        const icon = isInVoice ? '{green-fg}[V]{/green-fg}' : '{gray-fg}[V]{/gray-fg}';
        items.push(icon + ' Voice {gray-fg}(0){/gray-fg}');
        channelItems.push({ id: 'voice-voice', name: 'Voice', type: 'voice' });
    }
    else {
        voiceChannels.forEach((vc) => {
            const count = vc.participants.length;
            const isInVoice = voiceChannelService.getCurrentVoiceChannel() === vc.id;
            const icon = isInVoice ? '{green-fg}[V]{/green-fg}' : count > 0 ? '{cyan-fg}[V]{/cyan-fg}' : '{gray-fg}[V]{/gray-fg}';
            items.push(icon + ' ' + vc.name + ' {gray-fg}(' + count + '){/gray-fg}');
            channelItems.push({ id: 'voice-' + vc.id, name: vc.name, type: 'voice' });
        });
    }
    return { items, channelItems };
}
