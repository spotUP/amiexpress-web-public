export function setupKeyboardShortcuts(s: any, cl: any, dc: any, ib: any, sbt: () => string, chl: any, ul: any, ep: any, sh: () => void, ssb: (t: string) => void, asm: (m: string) => void, sfs: () => void, sso: () => void, scon: (t: string, cb: (c: boolean) => void) => void, cu: () => void, SW: number, chatLog?: any, typingBar?: any) {
  let sv = true;

  function ucl() {
    const lo = sv ? SW : 0;
    const sw = (s as any).width || 80;
    const wd = sw - lo;  // Width is full screen minus left offset

    // Update position and width for chat panel and drawing canvas
    (cl as any).position.left = lo;
    (cl as any).position.width = wd;
    (dc as any).position.left = lo;
    (dc as any).position.width = wd;

    // Update chat log width inside the panel (panel width minus 2 for borders)
    if (chatLog) {
      (chatLog as any).position.width = wd - 2;
    }

    // Update typing bar
    if (typingBar) {
      (typingBar as any).position.left = lo;
      (typingBar as any).position.width = wd;
    }

    if (sv) {
      // Get current sidebar tab value
      const currentTab = sbt();
      if (currentTab === 'channels') {
        chl.show();
        ul.hide();
      } else {
        chl.hide();
        ul.show();
      }
    } else {
      chl.hide();
      ul.hide();
    }
    s.render();
  }

  s.key(['pageup'], () => { cl.scroll(-10); s.render(); });
  s.key(['pagedown'], () => { cl.scroll(10); s.render(); });
  s.key(['f1'], () => { sh(); });
  s.key(['f2'], () => { sv = !sv; ucl(); asm(sv ? 'Sidebar shown' : 'Sidebar hidden (F2 to show)'); });
  s.key(['f3'], () => { const currentTab = sbt(); ssb(currentTab === 'channels' ? 'users' : 'channels'); asm(`Switched to ${currentTab === 'channels' ? 'users' : 'channels'} view`); });
  s.key(['f4', 'C-e'], () => { if (!ep.isVisible()) ep.show(s, (e: any) => { const c = ib.getValue(); ib.setValue(c + e.code + ' '); ib.focus(); s.render(); }, () => { ib.focus(); s.render(); }); });

  const fp = () => {
    const ps: any[] = [ib];
    if (sv) ps.push(sbt() === 'channels' ? chl : ul);
    ps.push(cl);
    return ps;
  };

  const fpi = (ps: any[], f: any): number => ps.findIndex(p => p === f || ((p as any).rows && (p as any).rows === f));

  s.key(['tab'], () => { const ps = fp(); const cf = s.getFocused(); let ci = fpi(ps, cf); if (ci === -1) ci = 0; const ni = (ci + 1) % ps.length; ps[ni].focus(); s.render(); });
  s.key(['S-tab'], () => { const ps = fp(); const cf = s.getFocused(); let ci = fpi(ps, cf); if (ci === -1) ci = 0; const pi = (ci - 1 + ps.length) % ps.length; ps[pi].focus(); s.render(); });
  s.key(['f6'], () => { sfs(); });
  s.key(['C-s'], () => { sso(); });
  s.key(['C-c', 'C-q'], () => { scon('Are you sure you want to quit LiveChat?', (c) => { if (c) cu(); }); });

  return { updateChatLayout: ucl };
}
