"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProfileOverlay = createProfileOverlay;
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
function createProfileOverlay(s, ib, users, uname, st, getColor, getChan, showMsg, showDM, show, hide) {
    let target = '';
    const o = blessed_1.default.box({ parent: s, top: 'center', left: 'center', width: 48, height: 15, border: { type: 'line' }, hidden: true, mouse: true, keys: true, closable: true, draggable: true, trapFocus: true, style: { fg: 'white', bg: 'black', border: { fg: 'magenta' } }, zIndex: 9990 });
    o.enableResize();
    const n = blessed_1.default.box({ parent: o, top: 1, left: 2, tags: true });
    const nd = blessed_1.default.box({ parent: o, top: 3, left: 2, tags: true });
    const sts = blessed_1.default.box({ parent: o, top: 5, left: 2, tags: true });
    const ch = blessed_1.default.box({ parent: o, top: 7, left: 2, tags: true });
    const dm = blessed_1.default.button({ parent: o, bottom: 2, left: 5, width: 12, height: 1, content: 'Send DM', mouse: true, style: { fg: 'white', bg: 'green', focus: { bg: 'cyan' } } });
    const cl = blessed_1.default.button({ parent: o, bottom: 2, right: 5, width: 10, height: 1, content: 'Close', mouse: true, style: { fg: 'white', bg: 'blue', focus: { bg: 'cyan' } } });
    function showProfile(u) {
        let f = null;
        for (const [, usr] of users)
            if (usr.username === u) {
                f = usr;
                break;
            }
        if (!f) {
            showMsg(`User ${u} not found.`, () => { ib.focus(); s.render(); });
            return;
        }
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
    dm.on('press', () => { hide(o); if (target && target !== uname)
        showDM(target); });
    cl.on('press', () => hide(o));
    o.on('close', () => hide(o));
    // Add explicit escape key handler to ensure it works even when child elements are focused
    o.key(['escape'], () => hide(o));
    return { overlay: o, showProfile };
}
