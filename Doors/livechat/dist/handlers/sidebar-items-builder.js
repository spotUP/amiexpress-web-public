"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSidebarItems = buildSidebarItems;
const door_theme_1 = require("../door-theme");
function buildSidebarItems(input) {
    const { channelsToShow, state, onlineUsers, presenceService, presenceIndicators, isCurrentChannel, expandedChannels, collapsedChannels, voiceChannelService, } = input;
    const items = [];
    const channelItems = [];
    // ---------- TEXT CHANNELS ----------
    items.push(`{${door_theme_1.T.accent}-fg}{bold}TEXT CHANNELS{/bold}{/${door_theme_1.T.accent}-fg}`);
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
            color = `{${door_theme_1.T.ink}-fg}`;
            endColor = `{/${door_theme_1.T.ink}-fg}`;
        }
        else if (hasUnread) {
            color = `{${door_theme_1.T.ok}-fg}`;
            endColor = `{/${door_theme_1.T.ok}-fg}`;
        }
        else {
            color = `{${door_theme_1.T.dim}-fg}`;
            endColor = `{/${door_theme_1.T.dim}-fg}`;
        }
        const arrow = isExpanded ? 'v' : '>';
        items.push(color + arrow + ' # ' + ch.name + unread + endColor);
        channelItems.push({ id: ch.id, name: ch.name, type: 'text' });
        if (isExpanded && isActive) {
            for (const [uid, u] of onlineUsers) {
                const presence = presenceService.get(parseInt(uid));
                const status = presence?.status || u.status;
                const indicator = presenceIndicators[status] || '*';
                items.push(`  {${door_theme_1.T.dim}-fg}${indicator}{/${door_theme_1.T.dim}-fg} ${u.username.slice(0, 12)}`);
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
        items.push(`{${door_theme_1.T.accent}-fg}{bold}DIRECT MESSAGES{/bold}{/${door_theme_1.T.accent}-fg}`);
        channelItems.push({ id: '', name: '', type: 'header' });
        const maxLabel = 22;
        for (const t of dmThreads) {
            const isActive = state.currentDmThread === t.threadId;
            const color = isActive ? `{${door_theme_1.T.ink}-fg}` : `{${door_theme_1.T.dim}-fg}`;
            const endColor = isActive ? `{/${door_theme_1.T.ink}-fg}` : `{/${door_theme_1.T.dim}-fg}`;
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
    items.push(`{${door_theme_1.T.accent}-fg}{bold}VOICE CHANNELS{/bold}{/${door_theme_1.T.accent}-fg}`);
    channelItems.push({ id: '', name: '', type: 'header' });
    const voiceChannels = voiceChannelService.getVoiceChannels();
    if (voiceChannels.length === 0) {
        const isInVoice = voiceChannelService.isInVoiceChannel();
        const icon = isInVoice ? `{${door_theme_1.T.ok}-fg}[V]{/${door_theme_1.T.ok}-fg}` : `{${door_theme_1.T.dim}-fg}[V]{/${door_theme_1.T.dim}-fg}`;
        items.push(icon + ` Voice {${door_theme_1.T.dim}-fg}(0){/${door_theme_1.T.dim}-fg}`);
        channelItems.push({ id: 'voice-voice', name: 'Voice', type: 'voice' });
    }
    else {
        voiceChannels.forEach((vc) => {
            const count = vc.participants.length;
            const isInVoice = voiceChannelService.getCurrentVoiceChannel() === vc.id;
            const icon = isInVoice ? `{${door_theme_1.T.ok}-fg}[V]{/${door_theme_1.T.ok}-fg}` : count > 0 ? `{${door_theme_1.T.accent}-fg}[V]{/${door_theme_1.T.accent}-fg}` : `{${door_theme_1.T.dim}-fg}[V]{/${door_theme_1.T.dim}-fg}`;
            // A talking marker: without it a busy channel and a silent one look
            // exactly alike, which is how a working voice channel read as broken.
            const talking = vc.participants.some((p) => p.isSpeaking)
                ? ` {${door_theme_1.T.ok}-fg}[*]{/${door_theme_1.T.ok}-fg}`
                : '';
            items.push(icon + ' ' + vc.name + ` {${door_theme_1.T.dim}-fg}(` + count + `){/${door_theme_1.T.dim}-fg}` + talking);
            channelItems.push({ id: 'voice-' + vc.id, name: vc.name, type: 'voice' });
        });
    }
    return { items, channelItems };
}
