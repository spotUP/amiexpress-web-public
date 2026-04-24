"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupKeyboardShortcuts = setupKeyboardShortcuts;
// Helper to invalidate coordinate cache after direct position modification
function invalidateCache(element) {
    element._coordsCacheValid = false;
    if (element.children) {
        for (const child of element.children) {
            invalidateCache(child);
        }
    }
}
function setupKeyboardShortcuts(s, cl, dc, ib, sbt, chl, ul, ep, sh, ssb, asm, sfs, sso, scon, cu, SW, chatLog, typingBar) {
    let sv = true;
    function ucl() {
        // CRITICAL: Use actual sidebar panel width, not static constant
        // fitToContent can expand sidebar beyond initial SIDEBAR_WIDTH
        const sidebarPanel = chl.parent;
        const actualSidebarWidth = sv ? (sidebarPanel?.width || SW) : 0;
        const lo = actualSidebarWidth;
        const sw = s.width || 80;
        const wd = sw - lo; // Width is full screen minus left offset
        // Update position and width for chat panel and drawing canvas
        cl.position.left = lo;
        cl.position.width = wd;
        dc.position.left = lo;
        dc.position.width = wd;
        // Invalidate coordinate cache for modified elements
        invalidateCache(cl);
        invalidateCache(dc);
        // Update chat log width inside the panel (panel width minus 2 for borders)
        if (chatLog) {
            chatLog.position.width = wd - 2;
            invalidateCache(chatLog);
        }
        // Update typing bar
        if (typingBar) {
            typingBar.position.left = lo;
            typingBar.position.width = wd;
            invalidateCache(typingBar);
        }
        if (sv) {
            // Get current sidebar tab value
            const currentTab = sbt();
            if (currentTab === 'channels') {
                chl.show();
                ul.hide();
            }
            else {
                chl.hide();
                ul.show();
            }
        }
        else {
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
    s.key(['f4', 'C-e'], () => { if (!ep.isVisible())
        ep.show(s, (e) => { const c = ib.getValue(); ib.setValue(c + e.code + ' '); ib.focus(); s.render(); }, () => { ib.focus(); s.render(); }); });
    const fp = () => {
        const ps = [ib];
        if (sv)
            ps.push(sbt() === 'channels' ? chl : ul);
        ps.push(cl);
        return ps;
    };
    const fpi = (ps, f) => ps.findIndex(p => p === f || (p.rows && p.rows === f));
    // Exported focus cycling functions for use by inputBox tab handler
    const cycleFocusForward = () => { const ps = fp(); const cf = s.getFocused(); let ci = fpi(ps, cf); if (ci === -1)
        ci = 0; const ni = (ci + 1) % ps.length; ps[ni].focus(); s.render(); return true; };
    const cycleFocusBackward = () => { const ps = fp(); const cf = s.getFocused(); let ci = fpi(ps, cf); if (ci === -1)
        ci = 0; const pi = (ci - 1 + ps.length) % ps.length; ps[pi].focus(); s.render(); return true; };
    s.key(['tab'], cycleFocusForward);
    s.key(['S-tab'], cycleFocusBackward);
    // Expose on screen for inputBox to call
    s._cycleFocusForward = cycleFocusForward;
    s._cycleFocusBackward = cycleFocusBackward;
    // Emergency Layout Reset (Alt+R)
    s.key(['M-r'], () => {
        // Reset sidebar to left dock
        if (cl.parent && cl.parent.setDockPosition) {
            cl.parent.setDockPosition('float'); // Force undock first
            cl.parent.setDockPosition('left');
        }
        // Reset main chat to float/center
        if (cl.setDockPosition) {
            cl.setDockPosition('float');
            const sw = s.width || 80;
            const sh = s.height || 24;
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
        if (panel && panel.toggleMaximize) {
            panel.toggleMaximize();
            asm(panel.isMaximized() ? 'Fullscreen enabled' : 'Fullscreen disabled');
        }
        else {
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
        const sw = s.width || 80;
        const sh = s.height || 24;
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
    s.key(['C-c', 'C-q'], () => { scon('Are you sure you want to quit LiveChat?', (c) => { if (c)
        cu(); }); });
    return { updateChatLayout: ucl };
}
