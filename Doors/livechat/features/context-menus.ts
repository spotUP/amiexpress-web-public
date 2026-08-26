import { toggleMute, muteMessage, muteMenuLabels, muteLevelForLabel, type MuteList } from '../core/mute-list';
import { PANEL_BORDER } from '../ui/theme';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export interface ContextMenuExtras {
  isSysop?: boolean;
  onFocusTile?: (userId: string) => void;
  onHideTile?: (userId: string) => void;
  onMuteRemote?: (userId: string) => void;
  onToggleChannelExpand?: (channelName: string) => void;
  /** The user's mute list, so Mute/Ignore/Block actually do something. */
  muteList?: MuteList;
}

export function createContextMenus(s: Screen, ib: any, sup: (u: string) => void, sdp: (u: string) => void, asm: (m: string) => void, sock: any, extras: ContextMenuExtras = {}) {
  const cm = blessed.list({ parent: s, top: 0, left: 0, width: 24, height: 6, border: { type: 'line' }, shadow: true, hidden: true, mouse: true, vi: true, keys: true, interactive: true, tags: true, zIndex: 9999, style: { fg: 'white', bg: 'black', border: { fg: PANEL_BORDER }, selected: { fg: 'black', bg: 'cyan' } } } as any);

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
        its.push('---', '{red-fg}Kick User{/red-fg}', '{red-fg}Ban User{/red-fg}');
      }
    } else if (t === 'chat') {
      its.push('Reply', 'Quote', 'React', '---', 'Copy Text', 'Pin Message', '---', 'Mark Unread', 'Edit', 'Delete');
    } else if (t === 'channel' && tgt) {
      its.push('Join', 'Leave', 'Info', 'Expand/Collapse', '---', 'Pin Channel');
      if (extras.isSysop) {
        its.push('---', 'Clear History', '{red-fg}Archive{/red-fg}', '{red-fg}Delete Channel{/red-fg}');
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
        case 'Unmute User':
        case 'Ignore':
        case 'Unignore':
        case 'Block':
        case 'Unblock': {
          if (!extras.muteList) {
            asm('{red-fg}Muting is unavailable.{/red-fg}');
            break;
          }
          const level = muteLevelForLabel(si);
          if (!level) break;
          const now = toggleMute(extras.muteList, cmt, level);
          asm(muteMessage(cmt, now));
          break;
        }
        case 'Kick User':
          if (!extras.isSysop) { asm('{red-fg}Sysop only.{/red-fg}'); break; }
          sock.emit('admin:kick-user', { username: cmt });
          asm(`{red-fg}Kick requested for ${cmt}{/red-fg}`);
          break;
        case 'Ban User':
          if (!extras.isSysop) { asm('{red-fg}Sysop only.{/red-fg}'); break; }
          sock.emit('admin:ban-user', { username: cmt });
          asm(`{red-fg}Ban requested for ${cmt}{/red-fg}`);
          break;
      }
    } else if (cmty === 'chat') {
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
        // The menu NOW knows which message is under the pointer - the
        // right-click resolves the row to a message id (see ui/chat-row-map),
        // which it never did before. What is still missing is the other end:
        // the server has no handler for pinning, deleting or reacting to a
        // message, so these say so rather than emitting into the void and
        // reporting success. Half a feature that claims to be whole is worse
        // than one that admits what it is.
        case 'React':
          asm(cmt
            ? '{yellow-fg}Reactions are not supported by the server yet.{/yellow-fg}'
            : '{yellow-fg}Right-click on a message first.{/yellow-fg}');
          break;
        case 'Copy Text':
          asm('Copy to clipboard (not available in terminal)');
          break;
        case 'Pin Message':
          asm(cmt
            ? '{yellow-fg}Pinning is not supported by the server yet.{/yellow-fg}'
            : '{yellow-fg}Right-click on a message first.{/yellow-fg}');
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
          asm(cmt
            ? '{yellow-fg}Deleting is not supported by the server yet.{/yellow-fg}'
            : '{yellow-fg}Right-click on a message first.{/yellow-fg}');
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
          asm(`{cyan-fg}Pinned ${cmt}{/cyan-fg}`);
          // TODO: persist a local pinned-channels list in prefs
          break;
        case 'Clear History':
          if (!extras.isSysop) { asm('{red-fg}Sysop only.{/red-fg}'); break; }
          sock.emit('admin:clear-channel-history', { channel: cmt });
          asm(`{red-fg}Clear history requested for ${cmt}{/red-fg}`);
          break;
        case 'Archive':
          if (!extras.isSysop) { asm('{red-fg}Sysop only.{/red-fg}'); break; }
          sock.emit('admin:archive-channel', { channel: cmt });
          asm(`{red-fg}Archive requested for ${cmt}{/red-fg}`);
          break;
        case 'Delete Channel':
          if (!extras.isSysop) { asm('{red-fg}Sysop only.{/red-fg}'); break; }
          sock.emit('admin:delete-channel', { channel: cmt });
          asm(`{red-fg}Delete requested for ${cmt}{/red-fg}`);
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
