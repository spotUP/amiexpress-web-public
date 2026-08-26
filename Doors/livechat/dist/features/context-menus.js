"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContextMenus = createContextMenus;
const mute_list_1 = require("../core/mute-list");
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
function createContextMenus(s, ib, sup, sdp, asm, sock, extras = {}) {
    const cm = blessed_1.default.list({ parent: s, top: 0, left: 0, width: 24, height: 6, border: { type: 'line' }, shadow: true, hidden: true, mouse: true, vi: true, keys: true, interactive: true, tags: true, zIndex: 9999, style: { fg: 'white', bg: 'black', border: { fg: 'cyan' }, selected: { fg: 'black', bg: 'cyan' } } });
    // Set high z-index to ensure menu appears on top
    cm.zi = 9999;
    cm.zIndex = 9999;
    let cmt = '';
    let cmty = 'chat';
    function scm(x, y, t, tgt) {
        cmty = t;
        cmt = tgt || '';
        const its = [];
        if (t === 'user' && tgt) {
            its.push('View Profile', 'Send Message', 'Whois', '---', 'Mention', 'Add Note', 'View History', '---', 'Mute User', 'Ignore', 'Block');
            if (extras.isSysop) {
                its.push('---', '{red-fg}Kick User{/red-fg}', '{red-fg}Ban User{/red-fg}');
            }
        }
        else if (t === 'chat') {
            its.push('Reply', 'Quote', 'React', '---', 'Copy Text', 'Pin Message', '---', 'Mark Unread', 'Edit', 'Delete');
        }
        else if (t === 'channel' && tgt) {
            its.push('Join', 'Leave', 'Info', 'Expand/Collapse', '---', 'Pin Channel');
            if (extras.isSysop) {
                its.push('---', 'Clear History', '{red-fg}Archive{/red-fg}', '{red-fg}Delete Channel{/red-fg}');
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
    cm.on('select', (it, idx) => {
        const raw = typeof it === 'string' ? it : it.content || '';
        // Strip blessed color tags so we can compare plain labels (sysop items
        // are styled like '{red-fg}Kick User{/red-fg}').
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
                    asm(`Add note for ${cmt} (not implemented yet)`);
                    break;
                case 'View History':
                    asm(`Viewing message history for ${cmt} (not implemented yet)`);
                    break;
                // Mute, Ignore and Block all used to print a confirmation and do
                // NOTHING - "their messages will be hidden" while the messages kept
                // arriving. Choosing the same level again lifts it, which is the
                // only obvious way back.
                case 'Mute User':
                case 'Ignore':
                case 'Block': {
                    if (!extras.muteList) {
                        asm('{red-fg}Muting is unavailable.{/red-fg}');
                        break;
                    }
                    const level = si === 'Mute User' ? 'mute' : si === 'Ignore' ? 'ignore' : 'block';
                    const now = (0, mute_list_1.toggleMute)(extras.muteList, cmt, level);
                    asm((0, mute_list_1.muteMessage)(cmt, now));
                    break;
                }
                case 'Kick User':
                    if (!extras.isSysop) {
                        asm('{red-fg}Sysop only.{/red-fg}');
                        break;
                    }
                    sock.emit('admin:kick-user', { username: cmt });
                    asm(`{red-fg}Kick requested for ${cmt}{/red-fg}`);
                    break;
                case 'Ban User':
                    if (!extras.isSysop) {
                        asm('{red-fg}Sysop only.{/red-fg}');
                        break;
                    }
                    sock.emit('admin:ban-user', { username: cmt });
                    asm(`{red-fg}Ban requested for ${cmt}{/red-fg}`);
                    break;
            }
        }
        else if (cmty === 'chat') {
            switch (si) {
                case 'Reply':
                    ib.setValue('/reply ');
                    ib.focus();
                    s.render();
                    break;
                case 'Quote':
                    ib.setValue('> ');
                    ib.focus();
                    s.render();
                    break;
                case 'React':
                    asm('Opening emoji picker for reaction...');
                    // TODO: Open emoji picker in reaction mode
                    break;
                case 'Copy Text':
                    asm('Copy to clipboard (not available in terminal)');
                    break;
                case 'Pin Message':
                    asm('Pin message (requires message ID)');
                    // TODO: Get message ID and call /pin command
                    break;
                case 'Mark Unread':
                    asm('Marked as unread');
                    // TODO: Mark channel as having unread messages
                    break;
                case 'Edit':
                    ib.setValue('/edit ');
                    ib.focus();
                    s.render();
                    break;
                case 'Delete':
                    asm('{red-fg}Delete message (not implemented){/red-fg}');
                    // TODO: Confirm and delete message
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
                    asm(`{cyan-fg}Pinned ${cmt}{/cyan-fg}`);
                    // TODO: persist a local pinned-channels list in prefs
                    break;
                case 'Clear History':
                    if (!extras.isSysop) {
                        asm('{red-fg}Sysop only.{/red-fg}');
                        break;
                    }
                    sock.emit('admin:clear-channel-history', { channel: cmt });
                    asm(`{red-fg}Clear history requested for ${cmt}{/red-fg}`);
                    break;
                case 'Archive':
                    if (!extras.isSysop) {
                        asm('{red-fg}Sysop only.{/red-fg}');
                        break;
                    }
                    sock.emit('admin:archive-channel', { channel: cmt });
                    asm(`{red-fg}Archive requested for ${cmt}{/red-fg}`);
                    break;
                case 'Delete Channel':
                    if (!extras.isSysop) {
                        asm('{red-fg}Sysop only.{/red-fg}');
                        break;
                    }
                    sock.emit('admin:delete-channel', { channel: cmt });
                    asm(`{red-fg}Delete requested for ${cmt}{/red-fg}`);
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
    return { contextMenu: cm, showContextMenu: scm, hideContextMenu: hcm };
}
