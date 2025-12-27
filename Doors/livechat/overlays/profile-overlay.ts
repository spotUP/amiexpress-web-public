import blessed, { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { AppState } from '../core/state';

export function createProfileOverlay(s: Screen, ib: any, users: any, uname: string, st: AppState, getColor: any, getChan: any, showMsg: any, showDM: any, show: any, hide: any) {
  let target = '';
  const o = blessed.box({ parent: s, top: 'center', left: 'center', width: 48, height: 15, border: { type: 'line' }, hidden: true, mouse: true, draggable: true, style: { fg: 'white', bg: 'black', border: { fg: 'magenta' } } });
  o.enableResize();

  const n = blessed.box({ parent: o, top: 1, left: 2, tags: true });
  const nd = blessed.box({ parent: o, top: 3, left: 2, tags: true });
  const sts = blessed.box({ parent: o, top: 5, left: 2, tags: true });
  const ch = blessed.box({ parent: o, top: 7, left: 2, tags: true });

  const dm = blessed.button({ parent: o, bottom: 2, left: 5, width: 12, height: 1, content: 'Send DM', mouse: true, style: { fg: 'white', bg: 'green', focus: { bg: 'cyan' } } });
  const cl = blessed.button({ parent: o, bottom: 2, right: 5, width: 10, height: 1, content: 'Close', mouse: true, style: { fg: 'white', bg: 'blue', focus: { bg: 'cyan' } } });

  function showProfile(u: string) {
    let f: any = null;
    for (const [, usr] of users) if (usr.username === u) { f = usr; break; }
    if (!f) { showMsg(`User ${u} not found.`, () => { ib.focus(); s.render(); }); return; }
    target = u;
    n.setContent(`{${getColor(u)}-fg}${u}{/${getColor(u)}-fg}`);
    nd.setContent(`Node ${f.nodeId || '?'}`);
    sts.setContent(f.status === 'idle' ? '{yellow-fg}idle{/yellow-fg}' : '{green-fg}active{/green-fg}');
    ch.setContent(getChan(st.currentChannel) || 'Lobby');
    o.setLabel(` ${u} `);
    show(o);
    dm.focus();
    s.render();
  }

  dm.on('press', () => { hide(o); if (target && target !== uname) showDM(target); });
  cl.on('press', () => hide(o));
  o.key(['escape'], () => hide(o));

  return { overlay: o, showProfile };
}
