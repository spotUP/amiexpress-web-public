"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.osc52Copy = osc52Copy;
exports.stripBlessedTags = stripBlessedTags;
exports.createContextMenus = createContextMenus;
const mute_list_1 = require("../core/mute-list");
const theme_1 = require("../ui/theme");
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const door_theme_1 = require("../door-theme");
const reply_quote_1 = require("../core/reply-quote");
const pin_handlers_1 = require("../handlers/pin-handlers");
const reaction_handlers_1 = require("../handlers/reaction-handlers");
const reaction_types_1 = require("../types/reaction.types");
const reaction_rows_1 = require("./reaction-rows");
const edit_handlers_1 = require("../handlers/edit-handlers");
/**
 * OSC 52 "set clipboard": ESC ] 52 ; c ; <base64 of UTF-8> BEL. The web
 * terminal (BBSTerminal) turns it into navigator.clipboard.writeText; the
 * door has no other way to reach the user's clipboard.
 */
function osc52Copy(text) {
    return `\x1b]52;c;${Buffer.from(text, 'utf8').toString('base64')}\x07`;
}
/** Blessed tags ({bold}, {red-fg}, {/}) are markup, not message text. */
function stripBlessedTags(text) {
    return text.replace(/\{\/?[a-z0-9#,-]*\}/gi, '');
}
function createContextMenus(s, ib, sup, sdp, asm, sock, extras = {}) {
    const cm = blessed_1.default.list({ parent: s, top: 0, left: 0, width: 24, height: 6, border: { type: 'line' }, shadow: true, hidden: true, mouse: true, vi: true, keys: true, interactive: true, tags: true, zIndex: 9999, style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground, border: { fg: theme_1.PANEL_BORDER }, selected: { fg: door_theme_1.T.ground, bg: door_theme_1.T.accent } } });
    // Set high z-index to ensure menu appears on top
    cm.zi = 9999;
    cm.zIndex = 9999;
    // The reaction picker: a second popup at the chat menu's place (spec 2026-11-08).
    const rm = blessed_1.default.list({ parent: s, top: 0, left: 0, width: 24, height: reaction_types_1.REACTION_EMOJIS.length + 2, border: { type: 'line' }, shadow: true, hidden: true, mouse: true, vi: true, keys: true, interactive: true, tags: true, zIndex: 10000, style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground, border: { fg: theme_1.PANEL_BORDER }, selected: { fg: door_theme_1.T.ground, bg: door_theme_1.T.accent } } });
    // Above the chat menu it replaces.
    rm.zi = 10000;
    rm.zIndex = 10000;
    let cmt = '';
    let cmty = 'chat';
    function scm(x, y, t, tgt) {
        cmty = t;
        cmt = tgt || '';
        const its = [];
        if (t === 'user' && tgt) {
            // The mute entries are built from the CURRENT state, not from a fixed
            // list: a muted user's entry reads "Unmute User", so the menu says who
            // is muted instead of offering the way in as the way back.
            const muteLabels = extras.muteList
                ? (0, mute_list_1.muteMenuLabels)(extras.muteList, tgt)
                : ['Mute User', 'Ignore', 'Block'];
            its.push('View Profile', 'Send Message', 'Whois', '---', 'Mention', 'Add Note', 'View History', '---', ...muteLabels);
            if (extras.isSysop) {
                its.push('---', `{${door_theme_1.T.alert}-fg}Kick User{/${door_theme_1.T.alert}-fg}`, `{${door_theme_1.T.alert}-fg}Ban User{/${door_theme_1.T.alert}-fg}`);
            }
        }
        else if (t === 'chat') {
            its.push('Reply', 'Quote', 'React', '---', 'Copy Text', 'Pin Message', '---', 'Mark Unread', 'Edit', 'Delete');
        }
        else if (t === 'channel' && tgt) {
            its.push('Join', 'Leave', 'Info', 'Expand/Collapse', '---', extras.isChannelPinned?.(tgt) ? 'Unpin Channel' : 'Pin Channel');
            if (extras.isSysop) {
                its.push('---', 'Clear History', `{${door_theme_1.T.alert}-fg}Archive{/${door_theme_1.T.alert}-fg}`, `{${door_theme_1.T.alert}-fg}Delete Channel{/${door_theme_1.T.alert}-fg}`);
            }
        }
        else if (t === 'video' && tgt) {
            its.push('Focus (Fullscreen)', 'Hide Stream', 'Mute Audio', '---', 'View Profile', 'Send Message');
        }
        cm.setItems(its);
        cm.height = its.length + 2;
        // Ensure max positions are non-negative to prevent off-screen rendering
        const mx = Math.max(s.width - 26, 0);
        const my = Math.max(s.height - (its.length + 4), 0);
        cm.top = Math.max(0, Math.min(y, my));
        cm.left = Math.max(0, Math.min(x, mx));
        cm.show();
        cm.setFront(); // Bring to front
        cm.focus();
        console.log('[context-menus DIAG] scm type=%s target=%s click=(%d,%d) final=(%d,%d) wxh=%dx%d hidden=%s items=%d', t, tgt, x, y, cm.left, cm.top, cm.width, cm.height, cm.hidden, its.length);
        s.render();
    }
    function hcm() {
        cm.hide();
        ib.focus();
        s.render();
    }
    let reactTarget = '';
    function openReactionPicker(x, y, messageId) {
        reactTarget = messageId;
        rm.setItems(reaction_types_1.REACTION_EMOJIS.map((_, i) => (0, reaction_rows_1.reactionPickerLabel)(i)));
        rm.top = y;
        rm.left = x;
        rm.select(0);
        rm.show();
        rm.setFront();
        rm.focus();
        s.render();
    }
    function closeReactionPicker() {
        rm.hide();
        ib.focus();
        s.render();
    }
    rm.on('select', (_it, idx) => {
        const emoji = reaction_types_1.REACTION_EMOJIS[idx];
        const target = reactTarget;
        closeReactionPicker();
        if (!emoji || !target)
            return;
        if (sock && sock.connected === false) {
            asm('The reaction did not go through.');
            return;
        }
        (0, reaction_handlers_1.reactToMessage)(sock, extras.currentRoom ? extras.currentRoom() : '', target, emoji);
        asm('Reaction sent.');
    });
    rm.key(['escape'], closeReactionPicker);
    cm.on('select', (it, idx) => {
        const raw = typeof it === 'string' ? it : it.content || '';
        // Strip blessed color tags so we can compare plain labels (sysop items
        // are styled like `{${T.alert}-fg}Kick User{/${T.alert}-fg}`).
        const si = raw.replace(/\{[^}]*\}/g, '');
        // Ignore separator lines
        if (si === '---') {
            s.render();
            return;
        }
        hcm();
        if (cmty === 'user' && cmt) {
            switch (si) {
                case 'View Profile':
                    sup(cmt);
                    break;
                case 'Send Message':
                    sdp(cmt);
                    break;
                case 'Whois':
                    ib.setValue(`/whois ${cmt}`);
                    ib.submit();
                    ib.clearValue();
                    ib.focus();
                    s.render();
                    break;
                case 'Mention':
                    ib.setValue(`@${cmt} ` + (ib.getValue() || ''));
                    ib.focus();
                    s.render();
                    break;
                case 'Add Note':
                    if (!extras.bbs?.addUserNote || !extras.showPromptDialog) {
                        asm(`{${door_theme_1.T.alert}-fg}Notes are unavailable.{/${door_theme_1.T.alert}-fg}`);
                        break;
                    }
                    extras.showPromptDialog(`Note about ${cmt}:`, '', async (err, val) => {
                        const note = (val || '').trim();
                        if (err || !note)
                            return;
                        let ok = false;
                        try {
                            ok = await extras.bbs.addUserNote(cmt, note);
                        }
                        catch {
                            ok = false;
                        }
                        asm(ok
                            ? `Note saved for ${cmt}.`
                            : `{${door_theme_1.T.alert}-fg}Could not save note for ${cmt}.{/${door_theme_1.T.alert}-fg}`);
                        s.render();
                    });
                    break;
                case 'View History': {
                    const history = extras.messagesOf ? extras.messagesOf(cmt) : [];
                    if (history.length === 0) {
                        asm(`No recent messages from ${cmt}.`);
                        break;
                    }
                    asm(`{${door_theme_1.T.accent}-fg}--- recent messages from ${cmt} ---{/${door_theme_1.T.accent}-fg}`);
                    for (const m of history.slice(-15))
                        asm(`  ${m.content}`);
                    break;
                }
                // Mute, Ignore and Block all used to print a confirmation and do
                // NOTHING - "their messages will be hidden" while the messages kept
                // arriving. Choosing the same level again lifts it, which is the
                // only obvious way back.
                case 'Mute User':
                case 'Unmute User':
                case 'Ignore':
                case 'Unignore':
                case 'Block':
                case 'Unblock': {
                    if (!extras.muteList) {
                        asm(`{${door_theme_1.T.alert}-fg}Muting is unavailable.{/${door_theme_1.T.alert}-fg}`);
                        break;
                    }
                    const level = (0, mute_list_1.muteLevelForLabel)(si);
                    if (!level)
                        break;
                    const before = (0, mute_list_1.muteLevel)(extras.muteList, cmt);
                    const now = (0, mute_list_1.toggleMute)(extras.muteList, cmt, level);
                    // Ignore and block are enforced by the server (it stops delivering
                    // that user's room lines and DMs), so moving into or out of those
                    // levels must reach it, same as /ignore and /unignore.
                    if ((0, mute_list_1.isServerEnforced)(now) && !(0, mute_list_1.isServerEnforced)(before))
                        sock.emit('chat:ignore', { user: cmt });
                    else if ((0, mute_list_1.isServerEnforced)(before) && !(0, mute_list_1.isServerEnforced)(now))
                        sock.emit('chat:unignore', { user: cmt });
                    asm((0, mute_list_1.muteMessage)(cmt, now));
                    break;
                }
                case 'Kick User':
                    if (!extras.isSysop) {
                        asm(`{${door_theme_1.T.alert}-fg}Sysop only.{/${door_theme_1.T.alert}-fg}`);
                        break;
                    }
                    sock.emit('admin:kick-user', { username: cmt });
                    asm(`{${door_theme_1.T.alert}-fg}Kick requested for ${cmt}{/${door_theme_1.T.alert}-fg}`);
                    break;
                case 'Ban User':
                    if (!extras.isSysop) {
                        asm(`{${door_theme_1.T.alert}-fg}Sysop only.{/${door_theme_1.T.alert}-fg}`);
                        break;
                    }
                    sock.emit('admin:ban-user', { username: cmt });
                    asm(`{${door_theme_1.T.alert}-fg}Ban requested for ${cmt}{/${door_theme_1.T.alert}-fg}`);
                    break;
            }
        }
        else if (cmty === 'chat') {
            switch (si) {
                case 'Reply':
                    ib.setValue(cmt ? '/reply ' + cmt + ' ' : '/reply ');
                    ib.focus();
                    s.render();
                    break;
                case 'Quote':
                    {
                        const parent = cmt ? extras.lookupMessage?.(cmt) : undefined;
                        if (!parent) {
                            asm(`{${door_theme_1.T.accentAlt}-fg}Right-click on a message first.{/${door_theme_1.T.accentAlt}-fg}`);
                            break;
                        }
                        ib.setValue((0, reply_quote_1.quoteInputText)(parent));
                        ib.focus();
                        s.render();
                    }
                    break;
                // The menu NOW knows which message is under the pointer - the
                // right-click resolves the row to a message id (see ui/chat-row-map),
                // which it never did before. What is still missing is the other end:
                // the server has no handler for pinning, deleting or reacting to a
                // message, so these say so rather than emitting into the void and
                // reporting success. Half a feature that claims to be whole is worse
                // than one that admits what it is.
                case 'React':
                    if (!cmt) {
                        asm(`{${door_theme_1.T.accentAlt}-fg}Right-click on a message first.{/${door_theme_1.T.accentAlt}-fg}`);
                    }
                    else {
                        openReactionPicker(cm.left, cm.top, cmt);
                    }
                    break;
                case 'Copy Text':
                    {
                        const raw = cmt ? extras.messageText?.(cmt) : undefined;
                        if (!raw) {
                            asm(`{${door_theme_1.T.accentAlt}-fg}Right-click on a message first.{/${door_theme_1.T.accentAlt}-fg}`);
                        }
                        else {
                            s.program.write(osc52Copy(stripBlessedTags(raw)));
                            asm('Copied to clipboard.');
                        }
                    }
                    break;
                case 'Pin Message':
                    if (!cmt) {
                        asm(`{${door_theme_1.T.accentAlt}-fg}Right-click on a message first.{/${door_theme_1.T.accentAlt}-fg}`);
                    }
                    else {
                        (0, pin_handlers_1.pinMessage)(sock, extras.currentRoom ? extras.currentRoom() : '', cmt);
                        asm('Pin requested.');
                    }
                    break;
                case 'Mark Unread':
                    {
                        const room = extras.currentRoom ? extras.currentRoom() : '';
                        asm(room && extras.onMarkChannelUnread?.(room) ? `Marked ${room} as unread` : 'No channel to mark unread.');
                    }
                    break;
                case 'Edit':
                    // With a message under the pointer, edit that one; else your last.
                    ib.setValue(cmt ? `/edit ${cmt} ` : '/edit ');
                    ib.focus();
                    s.render();
                    break;
                case 'Delete':
                    if (!cmt) {
                        asm(`{${door_theme_1.T.accentAlt}-fg}Right-click on a message first.{/${door_theme_1.T.accentAlt}-fg}`);
                    }
                    else {
                        (0, edit_handlers_1.deleteMessage)(sock, extras.currentRoom ? extras.currentRoom() : '', cmt);
                    }
                    break;
            }
        }
        else if (cmty === 'channel' && cmt) {
            switch (si) {
                case 'Join':
                    sock.emit('room:join', { roomName: cmt });
                    break;
                case 'Leave':
                    sock.emit('room:leave', { roomName: cmt });
                    break;
                case 'Info':
                    asm(`Channel: ${cmt}`);
                    break;
                case 'Expand/Collapse':
                    extras.onToggleChannelExpand?.(cmt);
                    break;
                case 'Pin Channel':
                case 'Unpin Channel': {
                    const pinned = extras.onTogglePinChannel?.(cmt);
                    asm(`{${door_theme_1.T.accent}-fg}${pinned ? 'Pinned' : 'Unpinned'} ${cmt}{/${door_theme_1.T.accent}-fg}`);
                    break;
                }
                case 'Clear History':
                    if (!extras.isSysop) {
                        asm(`{${door_theme_1.T.alert}-fg}Sysop only.{/${door_theme_1.T.alert}-fg}`);
                        break;
                    }
                    sock.emit('admin:clear-channel-history', { channel: cmt });
                    asm(`{${door_theme_1.T.alert}-fg}Clear history requested for ${cmt}{/${door_theme_1.T.alert}-fg}`);
                    break;
                case 'Archive':
                    if (!extras.isSysop) {
                        asm(`{${door_theme_1.T.alert}-fg}Sysop only.{/${door_theme_1.T.alert}-fg}`);
                        break;
                    }
                    sock.emit('admin:archive-channel', { channel: cmt });
                    asm(`{${door_theme_1.T.alert}-fg}Archive requested for ${cmt}{/${door_theme_1.T.alert}-fg}`);
                    break;
                case 'Delete Channel':
                    if (!extras.isSysop) {
                        asm(`{${door_theme_1.T.alert}-fg}Sysop only.{/${door_theme_1.T.alert}-fg}`);
                        break;
                    }
                    sock.emit('admin:delete-channel', { channel: cmt });
                    asm(`{${door_theme_1.T.alert}-fg}Delete requested for ${cmt}{/${door_theme_1.T.alert}-fg}`);
                    break;
            }
        }
        else if (cmty === 'video' && cmt) {
            switch (si) {
                case 'Focus (Fullscreen)':
                    extras.onFocusTile?.(cmt);
                    break;
                case 'Hide Stream':
                    extras.onHideTile?.(cmt);
                    break;
                case 'Mute Audio':
                    extras.onMuteRemote?.(cmt);
                    break;
                case 'View Profile':
                    sup(cmt);
                    break;
                case 'Send Message':
                    sdp(cmt);
                    break;
            }
        }
    });
    cm.key(['escape'], hcm);
    // Close context menu when clicking outside of it
    s.on('mouse', (data) => {
        if (data.action === 'mousedown' && !rm.hidden) {
            const l = rm.left || 0, t = rm.top || 0;
            if (data.x < l || data.x >= l + (rm.width || 24) || data.y < t || data.y >= t + (rm.height || 10))
                closeReactionPicker();
            return;
        }
        if (data.action === 'mousedown' && !cm.hidden) {
            // Get context menu bounds
            const menuLeft = cm.left || 0;
            const menuTop = cm.top || 0;
            const menuWidth = cm.width || 22;
            const menuHeight = cm.height || 6;
            // Check if click is outside the menu
            const isOutside = data.x < menuLeft || data.x >= menuLeft + menuWidth ||
                data.y < menuTop || data.y >= menuTop + menuHeight;
            if (isOutside) {
                hcm();
            }
        }
    });
    return { contextMenu: cm, reactionPicker: rm, showContextMenu: scm, hideContextMenu: hcm };
}
