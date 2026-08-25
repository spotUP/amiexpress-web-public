"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDialogs = createDialogs;
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
// Helper to invalidate coordinate cache after direct position modification
function invalidateCache(element) {
    element._coordsCacheValid = false;
    if (element.children) {
        for (const child of element.children) {
            invalidateCache(child);
        }
    }
}
function createDialogs(s, ib) {
    const mo = blessed_1.default.overlay({ parent: s, top: 0, left: 0, width: '100%', height: '100%', opacity: 0.5, hidden: true, style: { bg: 'black' }, zIndex: 9980 });
    function showModal(w) {
        // Update overlay dimensions to current screen size
        mo.position.width = s.width;
        mo.position.height = s.height;
        invalidateCache(mo);
        mo.show();
        mo.setFront(); // Bring overlay to front first
        w.show();
        w.setFront(); // Then bring modal on top of overlay
        s.trapFocus(w); // Jail keyboard focus inside modal
        w.focus();
        s.render();
    }
    function hideModal(w) {
        s.releaseFocusTrap(w); // Ours only - see Screen.releaseFocusTrap
        mo.hide();
        w.hide();
        ib.focus();
        s.render();
    }
    const md = new (require('@amiexpress/bbs-door-sdk').Message)({ parent: s, top: 'center', left: 'center', width: 50, trapFocus: true, overlay: true, style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } } });
    const pd = new (require('@amiexpress/bbs-door-sdk').Prompt)({ parent: s, top: 'center', left: 'center', width: 50, trapFocus: true, overlay: true, style: { fg: 'white', bg: 'black', border: { fg: 'green' } } });
    const qd = new (require('@amiexpress/bbs-door-sdk').Question)({ parent: s, top: 'center', left: 'center', width: 45, title: ' Confirm ', trapFocus: true, overlay: true, style: { fg: 'white', bg: 'black', border: { fg: 'yellow' } } });
    function showMessageDialog(t, cb) {
        md.display(t, () => {
            if (cb)
                cb();
            ib.focus(); // Restore focus to input bar
        });
    }
    function showPromptDialog(t, v, cb) {
        pd.showInput(t, v, (e, val) => {
            cb(e, val);
            ib.focus();
        });
    }
    function showConfirmDialog(t, cb) {
        qd.ask(t, (a) => {
            cb(a);
            ib.focus();
        });
    }
    return { modalOverlay: mo, showModal, hideModal, messageDialog: md, promptDialog: pd, questionDialog: qd, showMessageDialog, showPromptDialog, showConfirmDialog };
}
