"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileSharing = createFileSharing;
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
function createFileSharing(s, sock, st, un, asm, acm, aa, aud, sm, hm) {
    const o = blessed_1.default.box({ parent: s, top: 'center', left: 'center', width: '70%', height: '70%', label: ' Share Files [Drag to Move | Resize: Corner | ESC: Close] ', border: { type: 'line' }, shadow: true, hidden: true, mouse: true, draggable: true, ch: ' ', zIndex: 9990, style: { fg: 'white', bg: 'black', border: { fg: 'green' } } });
    o.enableResize();
    const fm = blessed_1.default.filemanager({ parent: o, top: 1, left: 1, width: '100%-4', height: '100%-6', cwd: '/uploads', files: [], directories: [], mouse: true, style: { fg: 'white' } });
    const sb = blessed_1.default.button({ parent: o, bottom: 1, left: 'center', width: 14, height: 1, content: ' Share File ', mouse: true, style: { fg: 'white', bg: 'green', focus: { bg: 'cyan' } } });
    const cb = blessed_1.default.button({ parent: o, bottom: 1, right: 2, width: 10, height: 1, content: ' Close ', mouse: true, style: { fg: 'white', bg: 'blue', focus: { bg: 'cyan' } } });
    let sf = null;
    fm.on('file', (f, fp) => { sf = fp; asm(`Selected: ${f}`); });
    sb.on('press', () => {
        if (sf) {
            sock.emit('file:share', { channel: st.currentChannel, path: sf, username: un });
            acm(`{green-fg}[File shared: ${sf}]{/green-fg}`);
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
    sock.on('file:shared', (d) => { acm(`{green-fg}[${d.username} shared a file: ${d.filename}]{/green-fg}`); aa(`File: ${d.filename}`); aud.onNotification(); });
    return {
        fileSharingOverlay: o,
        showFileSharing: () => { sock.emit('file:list', { path: '/uploads' }); sm(o); fm.focus(); s.render(); }
    };
}
