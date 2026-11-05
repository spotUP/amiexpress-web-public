"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileSharing = createFileSharing;
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const theme_1 = require("../ui/theme");
const door_theme_1 = require("../door-theme");
function createFileSharing(s, sock, st, un, asm, acm, aa, aud, sm, hm) {
    const o = blessed_1.default.box({ parent: s, top: 'center', left: 'center', width: '70%', height: '70%', label: ' Share Files [Drag to Move | Resize: Corner | ESC: Close] ', border: { type: 'line' }, shadow: true, hidden: true, mouse: true, draggable: true, ch: ' ', zIndex: 9990, style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground, border: { fg: theme_1.PANEL_BORDER } } });
    o.enableResize();
    const fm = blessed_1.default.filemanager({ parent: o, top: 1, left: 1, width: '100%-4', height: '100%-6', cwd: '/uploads', files: [], directories: [], mouse: true, style: { fg: door_theme_1.T.ink } });
    const sb = blessed_1.default.button({ parent: o, bottom: 1, left: 'center', width: 14, height: 1, content: ' Share File ', mouse: true, style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ok, focus: { bg: door_theme_1.T.accent } } });
    const cb = blessed_1.default.button({ parent: o, bottom: 1, right: 2, width: 10, height: 1, content: ' Close ', mouse: true, style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.bar, focus: { bg: door_theme_1.T.accent } } });
    let sf = null;
    fm.on('file', (f, fp) => { sf = fp; asm(`Selected: ${f}`); });
    sb.on('press', () => {
        if (sf) {
            sock.emit('file:share', { channel: st.currentChannel, path: sf, username: un });
            acm(`{${door_theme_1.T.ok}-fg}[File shared: ${sf}]{/${door_theme_1.T.ok}-fg}`);
            hm(o);
        }
        else {
            asm('Select a file first');
        }
    });
    cb.on('press', () => { hm(o); });
    o.key(['escape'], () => { hm(o); });
    fm.on('refresh', (cwd) => { sock.emit('file:list', { path: cwd }); });
    sock.on('file:list', (d) => { if (d.files && d.directories)
        fm.setListing(d.files, d.directories); });
    sock.on('file:shared', (d) => { acm(`{${door_theme_1.T.ok}-fg}[${d.username} shared a file: ${d.filename}]{/${door_theme_1.T.ok}-fg}`); aa(`File: ${d.filename}`); aud.onNotification(); });
    return {
        fileSharingOverlay: o,
        showFileSharing: () => { sock.emit('file:list', { path: '/uploads' }); sm(o); fm.focus(); s.render(); }
    };
}
