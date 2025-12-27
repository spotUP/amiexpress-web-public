import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export function createContextMenus(s: Screen, ib: any, sup: (u: string) => void, sdp: (u: string) => void, asm: (m: string) => void, sock: any) {
  const cm = blessed.list({ parent: s, top: 0, left: 0, width: 20, height: 6, border: { type: 'line' }, shadow: true, hidden: true, mouse: true, vi: true, style: { fg: 'white', bg: 'black', border: { fg: 'gray' }, selected: { fg: 'black', bg: 'white' } } });

  let cmt = '';
  let cmty: 'user' | 'chat' | 'channel' = 'chat';

  function scm(x: number, y: number, t: 'user' | 'chat' | 'channel', tgt?: string) {
    cmty = t;
    cmt = tgt || '';
    const its: string[] = [];
    if (t === 'user' && tgt) {
      its.push('View Profile', 'Send DM', 'Mention', 'Ignore');
    } else if (t === 'chat') {
      its.push('Copy', 'Reply', 'Quote');
    } else if (t === 'channel' && tgt) {
      its.push('Join', 'Leave', 'Info');
    }
    cm.setItems(its);
    (cm as any).height = its.length + 2;
    const mx = (s.width as number) - 22;
    const my = (s.height as number) - (its.length + 4);
    (cm as any).top = Math.min(y, my);
    (cm as any).left = Math.min(x, mx);
    cm.show();
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
    hcm();
    if (cmty === 'user' && cmt) {
      switch (si) {
        case 'View Profile':
          sup(cmt);
          break;
        case 'Send DM':
          sdp(cmt);
          break;
        case 'Mention':
          ib.setValue(`@${cmt} ` + (ib.getValue() || ''));
          ib.focus();
          s.render();
          break;
        case 'Ignore':
          asm(`Ignoring ${cmt} (not implemented)`);
          break;
      }
    } else if (cmty === 'chat') {
      switch (si) {
        case 'Copy':
          asm('Copy to clipboard (not available in terminal)');
          break;
        case 'Reply':
          ib.setValue('> ');
          ib.focus();
          s.render();
          break;
        case 'Quote':
          ib.setValue('> [quote] ');
          ib.focus();
          s.render();
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
