// Helper to invalidate coordinate cache after direct position modification
function invalidateCache(element: any) {
  element._coordsCacheValid = false;
  if (element.children) {
    for (const child of element.children) {
      invalidateCache(child);
    }
  }
}

export function setupKeyboardShortcuts(s: any, cl: any, dc: any, ib: any, sbt: () => string, chl: any, ul: any, ep: any, sh: () => void, ssb: (t: string) => void, asm: (m: string) => void, sfs: () => void, sso: () => void, scon: (t: string, cb: (c: boolean) => void) => void, cu: () => void, SW: number, chatLog?: any, typingBar?: any, menuBar?: any, relayout?: () => void) {
  let sv = true;

  function ucl() {
    // Hide the PANEL, not just the lists inside it.
    //
    // This used to hide the channel and user lists and leave the panel
    // itself standing, so "toggle sidebar" emptied the sidebar rather than
    // removing it, and the chat never got the space back (reported
    // 2026-08-26).
    const sidebarPanel = chl.parent;
    if (sidebarPanel) {
      if (sv) sidebarPanel.show();
      else sidebarPanel.hide();
    }

    if (sv) {
      // Which list belongs on top depends on the current tab.
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

    // The door owns the geometry - see updateLayout / ui/layout-solver. This
    // function used to recompute the chat panel's left and width itself,
    // which was a second source of truth for the same arithmetic and did not
    // know about anything the solver decides.
    relayout?.();
    s.render();
  }

  s.key(['pageup'], () => { cl.scroll(-10); s.render(); });
  s.key(['pagedown'], () => { cl.scroll(10); s.render(); });
  s.key(['f1'], () => { sh(); });
  s.key(['f2'], () => { sv = !sv; ucl(); asm(sv ? 'Sidebar shown' : 'Sidebar hidden (F2 to show)'); });
  s.key(['f3'], () => { const currentTab = sbt(); ssb(currentTab === 'channels' ? 'users' : 'channels'); asm(`Switched to ${currentTab === 'channels' ? 'users' : 'channels'} view`); });
  s.key(['f4', 'C-e'], () => { if (!ep.isVisible()) ep.show(s, (e: any) => { const c = ib.getValue(); ib.setValue(c + (e.display || e.code) + ' '); ib.focus(); s.render(); }, () => { ib.focus(); s.render(); }); });

  /**
   * The Tab cycle: where typing happens, the sidebar list, and the menu bar.
   *
   * This list - not the SDK's focusable flags - is what Tab actually walks,
   * so marking a widget focusable elsewhere has no effect here. Two things
   * were reported live (2026-08-25): the chat PANEL was a stop even though
   * there is nothing to do in it, and the menus could not be reached at all.
   * The menu bar's first button is the way in; Left/Right walk between menus
   * once you are there, and Escape leaves.
   */
  const fp = () => {
    const ps: any[] = [ib];
    if (sv) ps.push(sbt() === 'channels' ? chl : ul);
    const menuButton = menuBar?.getTabStop?.();
    if (menuButton && !menuButton.destroyed) ps.push(menuButton);
    return ps;
  };

  const fpi = (ps: any[], f: any): number => ps.findIndex(p => p === f || ((p as any).rows && (p as any).rows === f));

  // Exported focus cycling functions for use by inputBox tab handler
  /**
   * Landing on the menu bar should SHOW the menus.
   *
   * Tabbing there and seeing nothing until another key was pressed was
   * reported as broken more than once ("the menus don't open until I press
   * arrow down"). The menu bar opens its first menu on request; it cannot do
   * this from a focus event without looping, so the cycle asks.
   */
  const arrivedAt = (target: any) => {
    target.focus();
    if (menuBar?.getTabStop?.() === target) menuBar.openFirst?.();
    s.render();
    return true;
  };

  const cycleFocusForward = () => { const ps = fp(); const cf = s.getFocused(); let ci = fpi(ps, cf); if (ci === -1) ci = 0; const ni = (ci + 1) % ps.length; return arrivedAt(ps[ni]); };
  const cycleFocusBackward = () => { const ps = fp(); const cf = s.getFocused(); let ci = fpi(ps, cf); if (ci === -1) ci = 0; const pi = (ci - 1 + ps.length) % ps.length; return arrivedAt(ps[pi]); };

  s.key(['tab'], cycleFocusForward);
  s.key(['S-tab'], cycleFocusBackward);

  // Tabbing off either end of the menu bar rejoins THIS cycle, in the
  // direction the player was going - rather than the bar looping its own
  // menus for ever, or dumping everyone back at the message box.
  menuBar?.on?.('exit', (direction?: string) => {
    if (direction === 'backward') cycleFocusBackward();
    else cycleFocusForward();
  });

  // Expose on screen for inputBox to call
  (s as any)._cycleFocusForward = cycleFocusForward;
  (s as any)._cycleFocusBackward = cycleFocusBackward;
  
  // Emergency Layout Reset (Alt+R)
  s.key(['M-r'], () => {
    // Reset sidebar to left dock
    if (cl.parent && (cl.parent as any).setDockPosition) {
      (cl.parent as any).setDockPosition('float'); // Force undock first
      (cl.parent as any).setDockPosition('left');
    }
    // Reset main chat to float/center
    if (cl.setDockPosition) {
      cl.setDockPosition('float');
      const sw = (s as any).width || 80;
      const sh = (s as any).height || 24;
      cl.width = sw - SW;
      cl.height = sh - 5;
      cl.aleft = SW;
      cl.atop = 1;
    }
    asm('Layout reset to defaults');
    s.render();
  });

  // Fullscreen Macro (Alt+F)
  s.key(['M-f'], () => {
    const focused = s.getFocused();
    // Walk up to find the containing DockablePanel
    let panel = focused;
    while (panel && !(panel.constructor.name === 'DockablePanel')) {
      panel = panel.parent;
    }

    if (panel && (panel as any).toggleMaximize) {
      (panel as any).toggleMaximize();
      asm((panel as any).isMaximized() ? 'Fullscreen enabled' : 'Fullscreen disabled');
    } else {
      // If no specific panel focused, try the main chat panel
      if (cl.toggleMaximize) {
        cl.toggleMaximize();
        asm(cl.isMaximized() ? 'Chat Fullscreen enabled' : 'Chat Fullscreen disabled');
      }
    }
    s.render();
  });

  // Layout Preset Cycle (Alt+L)
  let currentLayoutIndex = 0;
  s.key(['M-l'], () => {
    currentLayoutIndex = (currentLayoutIndex + 1) % 3;
    const sw = (s as any).width || 80;
    const sh = (s as any).height || 24;
    const MH = 1; // Menu height
    const SH = 1; // Status height
    const IH = 3; // Input height
    const contentH = sh - MH - SH - IH;

    // Sidebar panel
    const sbp = chl.parent;

    switch (currentLayoutIndex) {
      case 0: // Standard
        sbp.setState({ x: 0, y: MH, width: SW, height: contentH, position: 'left' });
        cl.setState({ x: SW, y: MH, width: sw - SW, height: contentH, position: 'float' });
        asm('Layout: Standard');
        break;
      case 1: // Wide Sidebar
        sbp.setState({ x: 0, y: MH, width: Math.floor(sw * 0.4), height: contentH, position: 'left' });
        cl.setState({ x: Math.floor(sw * 0.4), y: MH, width: Math.floor(sw * 0.6), height: contentH, position: 'float' });
        asm('Layout: Wide Sidebar');
        break;
      case 2: // Vertical Split (Top/Bottom)
        sbp.setState({ x: 0, y: MH, width: sw, height: Math.floor(contentH * 0.4), position: 'top' });
        cl.setState({ x: 0, y: MH + Math.floor(contentH * 0.4), width: sw, height: Math.floor(contentH * 0.6), position: 'bottom' });
        asm('Layout: Vertical Split');
        break;
    }
    s.render();
  });

  s.key(['f6'], () => { sfs(); });
  s.key(['C-s'], () => { sso(); });
  s.key(['C-c', 'C-q'], () => { scon('Are you sure you want to quit LiveChat?', (c) => { if (c) cu(); }); });

  return {
    updateChatLayout: ucl,
    /**
     * Show or hide the sidebar. ONE implementation, because the menu item
     * used to toggle the lists on its own and left the panel standing.
     */
    toggleSidebar: () => {
      sv = !sv;
      ucl();
      return sv;
    },
  };
}
