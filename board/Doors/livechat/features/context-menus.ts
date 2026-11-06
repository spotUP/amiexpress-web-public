import { toggleMute, muteLevel, isServerEnforced, muteMessage, muteMenuLabels, muteLevelForLabel, type MuteList } from '../core/mute-list';
import { PANEL_BORDER } from '../ui/theme';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { T } from '../door-theme';
import type { Message } from '../types';
import { pinMessage } from '../handlers/pin-handlers';
import { reactToMessage } from '../handlers/reaction-handlers';
import { deleteMessage } from '../handlers/edit-handlers';

export interface ContextMenuExtras {
  isSysop?: boolean;
  onFocusTile?: (userId: string) => void;
  onHideTile?: (userId: string) => void;
  onMuteRemote?: (userId: string) => void;
  onToggleChannelExpand?: (channelName: string) => void;
  /** The user's mute list, so Mute/Ignore/Block actually do something. */
  muteList?: MuteList;
  /** BBSApi - `addUserNote` persists a sysop note to the account-editor store. */
  bbs?: { addUserNote?: (username: string, text: string) => Promise<boolean> };
  /** The door's prompt dialog, for entering a note's text. */
  showPromptDialog?: (prompt: string, def: string, cb: (err: any, val?: string) => void) => void;
  /** This user's actual chat messages, for View History. */
  messagesOf?: (username: string) => Message[];
  /** The room a pin is written into. */
  currentRoom?: () => string;
  /** Pinned channels sort first in the channel list (kept in the user's prefs). */
  isChannelPinned?: (name: string) => boolean;
  onTogglePinChannel?: (name: string) => boolean;
  /** Gives the channel an unread count again; false when the channel is unknown. */
  onMarkChannelUnread?: (name: string) => boolean;
  /** The text of a message by id, for Copy Text. */
  messageText?: (id: string) => string | undefined;
}

/**
 * OSC 52 "set clipboard": ESC ] 52 ; c ; <base64 of UTF-8> BEL. The web
 * terminal (BBSTerminal) turns it into navigator.clipboard.writeText; the
 * door has no other way to reach the user's clipboard.
 */
export function osc52Copy(text: string): string {
  return `\x1b]52;c;${Buffer.from(text, 'utf8').toString('base64')}\x07`;
}

/** Blessed tags ({bold}, {red-fg}, {/}) are markup, not message text. */
export function stripBlessedTags(text: string): string {
  return text.replace(/\{\/?[a-z0-9#,-]*\}/gi, '');
}

export function createContextMenus(s: Screen, ib: any, sup: (u: string) => void, sdp: (u: string) => void, asm: (m: string) => void, sock: any, extras: ContextMenuExtras = {}) {
  const cm = blessed.list({ parent: s, top: 0, left: 0, width: 24, height: 6, border: { type: 'line' }, shadow: true, hidden: true, mouse: true, vi: true, keys: true, interactive: true, tags: true, zIndex: 9999, style: { fg: T.ink, bg: T.ground, border: { fg: PANEL_BORDER }, selected: { fg: T.ground, bg: T.accent } } } as any);

  // Set high z-index to ensure menu appears on top
  (cm as any).zi = 9999;
  (cm as any).zIndex = 9999;

  let cmt = '';
  let cmty: 'user' | 'chat' | 'channel' | 'video' = 'chat';

  function scm(x: number, y: number, t: 'user' | 'chat' | 'channel' | 'video', tgt?: string) {
    cmty = t;
    cmt = tgt || '';
    const its: string[] = [];
    if (t === 'user' && tgt) {
      // The mute entries are built from the CURRENT state, not from a fixed
      // list: a muted user's entry reads "Unmute User", so the menu says who
      // is muted instead of offering the way in as the way back.
      const muteLabels = extras.muteList
        ? muteMenuLabels(extras.muteList, tgt)
        : ['Mute User', 'Ignore', 'Block'];
      its.push('View Profile', 'Send Message', 'Whois', '---', 'Mention', 'Add Note', 'View History', '---', ...muteLabels);
      if (extras.isSysop) {
        its.push('---', `{${T.alert}-fg}Kick User{/${T.alert}-fg}`, `{${T.alert}-fg}Ban User{/${T.alert}-fg}`);
      }
    } else if (t === 'chat') {
      its.push('Reply', 'Quote', 'React', '---', 'Copy Text', 'Pin Message', '---', 'Mark Unread', 'Edit', 'Delete');
    } else if (t === 'channel' && tgt) {
      its.push('Join', 'Leave', 'Info', 'Expand/Collapse', '---', extras.isChannelPinned?.(tgt) ? 'Unpin Channel' : 'Pin Channel');
      if (extras.isSysop) {
        its.push('---', 'Clear History', `{${T.alert}-fg}Archive{/${T.alert}-fg}`, `{${T.alert}-fg}Delete Channel{/${T.alert}-fg}`);
      }
    } else if (t === 'video' && tgt) {
      its.push('Focus (Fullscreen)', 'Hide Stream', 'Mute Audio', '---', 'View Profile', 'Send Message');
    }
    cm.setItems(its);
    (cm as any).height = its.length + 2;
    // Ensure max positions are non-negative to prevent off-screen rendering
    const mx = Math.max((s.width as number) - 26, 0);
    const my = Math.max((s.height as number) - (its.length + 4), 0);
    (cm as any).top = Math.max(0, Math.min(y, my));
    (cm as any).left = Math.max(0, Math.min(x, mx));
    cm.show();
    cm.setFront();  // Bring to front
    cm.focus();
    console.log('[context-menus DIAG] scm type=%s target=%s click=(%d,%d) final=(%d,%d) wxh=%dx%d hidden=%s items=%d',
      t, tgt, x, y, (cm as any).left, (cm as any).top, (cm as any).width, (cm as any).height, cm.hidden, its.length);
    s.render();
  }

  function hcm() {
    cm.hide();
    ib.focus();
    s.render();
  }

  cm.on('select', (it: any, idx: number) => {
    const raw = typeof it === 'string' ? it : (it as any).content || '';
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
            asm(`{${T.alert}-fg}Notes are unavailable.{/${T.alert}-fg}`);
            break;
          }
          extras.showPromptDialog(`Note about ${cmt}:`, '', async (err: any, val?: string) => {
            const note = (val || '').trim();
            if (err || !note) return;
            let ok = false;
            try { ok = await extras.bbs!.addUserNote!(cmt, note); } catch { ok = false; }
            asm(ok
              ? `Note saved for ${cmt}.`
              : `{${T.alert}-fg}Could not save note for ${cmt}.{/${T.alert}-fg}`);
            s.render();
          });
          break;
        case 'View History': {
          const history = extras.messagesOf ? extras.messagesOf(cmt) : [];
          if (history.length === 0) {
            asm(`No recent messages from ${cmt}.`);
            break;
          }
          asm(`{${T.accent}-fg}--- recent messages from ${cmt} ---{/${T.accent}-fg}`);
          for (const m of history.slice(-15)) asm(`  ${m.content}`);
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
            asm(`{${T.alert}-fg}Muting is unavailable.{/${T.alert}-fg}`);
            break;
          }
          const level = muteLevelForLabel(si);
          if (!level) break;
          const before = muteLevel(extras.muteList, cmt);
          const now = toggleMute(extras.muteList, cmt, level);
          // Ignore and block are enforced by the server (it stops delivering
          // that user's room lines and DMs), so moving into or out of those
          // levels must reach it, same as /ignore and /unignore.
          if (isServerEnforced(now) && !isServerEnforced(before)) sock.emit('chat:ignore', { user: cmt });
          else if (isServerEnforced(before) && !isServerEnforced(now)) sock.emit('chat:unignore', { user: cmt });
          asm(muteMessage(cmt, now));
          break;
        }
        case 'Kick User':
          if (!extras.isSysop) { asm(`{${T.alert}-fg}Sysop only.{/${T.alert}-fg}`); break; }
          sock.emit('admin:kick-user', { username: cmt });
          asm(`{${T.alert}-fg}Kick requested for ${cmt}{/${T.alert}-fg}`);
          break;
        case 'Ban User':
          if (!extras.isSysop) { asm(`{${T.alert}-fg}Sysop only.{/${T.alert}-fg}`); break; }
          sock.emit('admin:ban-user', { username: cmt });
          asm(`{${T.alert}-fg}Ban requested for ${cmt}{/${T.alert}-fg}`);
          break;
      }
    } else if (cmty === 'chat') {
      switch (si) {
        case 'Reply':
          ib.setValue(cmt ? '/reply ' + cmt + ' ' : '/reply ');
          ib.focus();
          s.render();
          break;
        case 'Quote':
          ib.setValue('> ');
          ib.focus();
          s.render();
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
            asm(`{${T.accentAlt}-fg}Right-click on a message first.{/${T.accentAlt}-fg}`);
          } else {
            reactToMessage(sock, extras.currentRoom ? extras.currentRoom() : '', cmt, '+1');
            asm('Reaction sent.');
          }
          break;
        case 'Copy Text':
          {
            const raw = cmt ? extras.messageText?.(cmt) : undefined;
            if (!raw) {
              asm(`{${T.accentAlt}-fg}Right-click on a message first.{/${T.accentAlt}-fg}`);
            } else {
              (s as any).program.write(osc52Copy(stripBlessedTags(raw)));
              asm('Copied to clipboard.');
            }
          }
          break;
        case 'Pin Message':
          if (!cmt) {
            asm(`{${T.accentAlt}-fg}Right-click on a message first.{/${T.accentAlt}-fg}`);
          } else {
            pinMessage(sock, extras.currentRoom ? extras.currentRoom() : '', cmt);
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
            asm(`{${T.accentAlt}-fg}Right-click on a message first.{/${T.accentAlt}-fg}`);
          } else {
            deleteMessage(sock, extras.currentRoom ? extras.currentRoom() : '', cmt);
          }
          break;
      }
    } else if (cmty === 'channel' && cmt) {
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
          asm(`{${T.accent}-fg}${pinned ? 'Pinned' : 'Unpinned'} ${cmt}{/${T.accent}-fg}`);
          break;
        }
        case 'Clear History':
          if (!extras.isSysop) { asm(`{${T.alert}-fg}Sysop only.{/${T.alert}-fg}`); break; }
          sock.emit('admin:clear-channel-history', { channel: cmt });
          asm(`{${T.alert}-fg}Clear history requested for ${cmt}{/${T.alert}-fg}`);
          break;
        case 'Archive':
          if (!extras.isSysop) { asm(`{${T.alert}-fg}Sysop only.{/${T.alert}-fg}`); break; }
          sock.emit('admin:archive-channel', { channel: cmt });
          asm(`{${T.alert}-fg}Archive requested for ${cmt}{/${T.alert}-fg}`);
          break;
        case 'Delete Channel':
          if (!extras.isSysop) { asm(`{${T.alert}-fg}Sysop only.{/${T.alert}-fg}`); break; }
          sock.emit('admin:delete-channel', { channel: cmt });
          asm(`{${T.alert}-fg}Delete requested for ${cmt}{/${T.alert}-fg}`);
          break;
      }
    } else if (cmty === 'video' && cmt) {
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
  s.on('mouse', (data: any) => {
    if (data.action === 'mousedown' && !cm.hidden) {
      // Get context menu bounds
      const menuLeft = (cm as any).left || 0;
      const menuTop = (cm as any).top || 0;
      const menuWidth = (cm as any).width || 22;
      const menuHeight = (cm as any).height || 6;

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
