import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export function createContextMenus(s: Screen, ib: any, sup: (u: string) => void, sdp: (u: string) => void, asm: (m: string) => void, sock: any) {
  const cm = blessed.list({ parent: s, top: 0, left: 0, width: 22, height: 6, border: { type: 'line' }, shadow: true, hidden: true, mouse: true, vi: true, keys: true, interactive: true, tags: true, style: { fg: 'white', bg: 'black', border: { fg: 'cyan' }, selected: { fg: 'black', bg: 'cyan' } } });

  // Set high z-index to ensure menu appears on top
  (cm as any).zi = 9999;

  let cmt = '';
  let cmty: 'user' | 'chat' | 'channel' = 'chat';

  function scm(x: number, y: number, t: 'user' | 'chat' | 'channel', tgt?: string) {
    cmty = t;
    cmt = tgt || '';
    const its: string[] = [];
    if (t === 'user' && tgt) {
      its.push('View Profile', 'Send Message', 'Whois', '---', 'Mention', 'Add Note', 'View History', '---', 'Mute User', 'Ignore', 'Block');
    } else if (t === 'chat') {
      its.push('Reply', 'Quote', 'React', '---', 'Copy Text', 'Pin Message', '---', 'Mark Unread', 'Edit', 'Delete');
    } else if (t === 'channel' && tgt) {
      its.push('Join', 'Leave', 'Info');
    }
    cm.setItems(its);
    (cm as any).height = its.length + 2;
    // Ensure max positions are non-negative to prevent off-screen rendering
    const mx = Math.max((s.width as number) - 24, 0);
    const my = Math.max((s.height as number) - (its.length + 4), 0);
    (cm as any).top = Math.max(0, Math.min(y, my));
    (cm as any).left = Math.max(0, Math.min(x, mx));
    cm.show();
    cm.setFront();  // Bring to front
    cm.focus();
    s.render();
  }

  function hcm() {
    cm.hide();
    ib.focus();
    s.render();
  }

  cm.on('select', (it: any, idx: number) => {
    const si = typeof it === 'string' ? it : (it as any).content || '';

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
        case 'Mute User':
          asm(`Muted ${cmt} - their messages will be hidden`);
          // TODO: Add to local mute list
          break;
        case 'Ignore':
          asm(`Ignoring ${cmt} - you won't receive DMs from them`);
          // TODO: Add to ignore list
          break;
        case 'Block':
          asm(`{red-fg}Blocked ${cmt} - they cannot contact you{/red-fg}`);
          // TODO: Send block request to server
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
    } else if (cmty === 'channel' && cmt) {
      switch (si) {
        case 'Join':
          sock.emit('room:join', { roomName: cmt });
          break;
        case 'Leave':
          sock.emit('room:leave');
          break;
        case 'Info':
          asm(`Channel: ${cmt}`);
          break;
      }
    }
  });

  cm.key(['escape'], hcm);

  return { contextMenu: cm, showContextMenu: scm, hideContextMenu: hcm };
}
