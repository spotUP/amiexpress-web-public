import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export function createFileSharing(s: Screen, sock: any, st: any, un: string, asm: (m: string) => void, acm: (m: string) => void, aa: (a: string) => void, aud: any, sm: (w: any) => void, hm: (w: any) => void) {
  const o = blessed.box({ parent: s, top: 'center', left: 'center', width: '70%', height: '70%', label: ' Share Files [Drag to Move | Resize: Corner | ESC: Close] ', border: { type: 'line' }, shadow: true, hidden: true, mouse: true, draggable: true, ch: ' ', zIndex: 9990, style: { fg: 'white', bg: 'black', border: { fg: 'green' } } });
  o.enableResize();

  const fm = blessed.filemanager({ parent: o, top: 1, left: 1, width: '100%-4', height: '100%-6', cwd: '/uploads', files: [], directories: [], mouse: true, style: { fg: 'white' } });
  const sb = blessed.button({ parent: o, bottom: 1, left: 'center', width: 14, height: 1, content: ' Share File ', mouse: true, style: { fg: 'white', bg: 'green', focus: { bg: 'cyan' } } });
  const cb = blessed.button({ parent: o, bottom: 1, right: 2, width: 10, height: 1, content: ' Close ', mouse: true, style: { fg: 'white', bg: 'blue', focus: { bg: 'cyan' } } });

  let sf: string | null = null;

  fm.on('file', (f: string, fp: string) => { sf = fp; asm(`Selected: ${f}`); });

  sb.on('press', () => {
    if (sf) {
      sock.emit('file:share', { channel: st.currentChannel, path: sf, username: un });
      acm(`{green-fg}[File shared: ${sf}]{/green-fg}`);
      hm(o);
    } else {
      asm('Select a file first');
    }
  });

  cb.on('press', () => { hm(o); });

  o.key(['escape'], () => { hm(o); });

  fm.on('refresh', (cwd: string) => { sock.emit('file:list', { path: cwd }); });

  sock.on('file:list', (d: any) => { if (d.files && d.directories) fm.setListing(d.files, d.directories); });

  sock.on('file:shared', (d: any) => { acm(`{green-fg}[${d.username} shared a file: ${d.filename}]{/green-fg}`); aa(`File: ${d.filename}`); aud.onNotification(); });

  return {
    fileSharingOverlay: o,
    showFileSharing: () => { sock.emit('file:list', { path: '/uploads' }); sm(o); fm.focus(); s.render(); }
  };
}
