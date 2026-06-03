"use strict";
/**
 * InfoEditorOverlay - edit door registration .info (BBSCmd) files
 * Spot / Up Rough
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InfoEditorOverlay = void 0;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
class InfoEditorOverlay {
    constructor(opts) {
        this.tooltypes = [];
        this.dirty = false;
        this.closed = false;
        this.blockNextSelect = false;
        this.activeEditHandler = null;
        this.screen = opts.screen;
        this.command = opts.command.toUpperCase();
        this.bbs = opts.bbs;
        this.onClose = opts.onClose;
        this.infoPath = `Commands/BBSCmd/${this.command}.info`;
        this.buildUI();
        this.loadInfo().then(() => this.screen.render());
    }
    buildUI() {
        this.overlay = new blessed_1.Box({
            parent: this.screen,
            top: 0, left: 0, width: '100%', height: '100%',
            style: { bg: 'black' },
            tags: true, keys: true, focusable: true,
        });
        this.header = new blessed_1.Panel({
            parent: this.overlay,
            top: 0, left: 0, width: '100%', height: 3,
            tags: true,
            content: `  {cyan-fg}EDIT: ${this.command}.info{/cyan-fg}  `,
            style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
            focusable: false,
        });
        this.footer = new blessed_1.Panel({
            parent: this.overlay,
            bottom: 0, left: 0, width: '100%', height: 3,
            tags: true,
            content: `{center}{yellow-fg}Enter{/yellow-fg}=Edit  {yellow-fg}!{/yellow-fg}=Toggle  {yellow-fg}S{/yellow-fg}=Save+Close  {yellow-fg}ESC{/yellow-fg}=Cancel{/center}`,
            style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
            focusable: false,
        });
        this.listWidget = new blessed_1.List({
            parent: this.overlay,
            top: 3, left: 0, width: '100%', height: '100%-6',
            keys: true, vi: true, mouse: true,
            tags: true,
            style: {
                selected: { bg: 'blue', fg: 'white' },
                item: { fg: 'white' },
            },
        });
        // List vi-mode intercepts Enter and emits 'select' before key() fires
        this.listWidget.on('select', () => {
            if (this.blockNextSelect) {
                this.blockNextSelect = false;
                return;
            }
            this.editSelected();
        });
        this.listWidget.key(['!'], () => { this.toggleComment(); });
        this.listWidget.key(['s', 'S'], async () => { await this.save(); });
        this.overlay.key(['s', 'S'], async () => { await this.save(); });
        this.overlay.key(['escape'], () => { this.close(); });
        this.listWidget.focus();
    }
    async loadInfo() {
        const tooltypes = await this.bbs.readInfoFile(this.infoPath);
        if (!tooltypes) {
            this.tooltypes = [];
            this.listWidget.setItems(['{red-fg}Cannot read .info file{/red-fg}']);
            return;
        }
        this.tooltypes = tooltypes;
        this.renderList();
    }
    renderList() {
        const items = this.tooltypes.map(tt => {
            const prefix = tt.commented ? '{gray-fg}!' : '{yellow-fg}';
            const suffix = tt.commented ? '{/gray-fg}' : '{/yellow-fg}';
            const kv = tt.value ? `${tt.key}=${tt.value}` : tt.key;
            return `${prefix}${kv}${suffix}`;
        });
        if (items.length === 0)
            items.push('{gray-fg}(empty){/gray-fg}');
        this.listWidget.setItems(items);
    }
    editSelected() {
        const idx = this.listWidget.selected ?? 0;
        const tt = this.tooltypes[idx];
        if (!tt)
            return;
        const blessed = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
        const Box = blessed.Box ?? blessed.box ?? blessed.Panel;
        const currentDisplay = tt.value ? `${tt.key}=${tt.value}` : tt.key;
        let buf = currentDisplay;
        let cur = buf.length; // cursor position (0 = before first char)
        function renderEdit() {
            // Show buffer with block cursor: chars before + '[' + char-at + ']' + chars-after
            const pre = buf.slice(0, cur);
            const at = cur < buf.length ? buf[cur] : ' ';
            const post = cur < buf.length ? buf.slice(cur + 1) : '';
            editPanel.setContent(`${pre}\x1b[7m${at}\x1b[0m${post}`);
            editPanel.screen?.render?.();
        }
        // Borderless edit box overlaying the selected row
        const editPanel = new Box({
            parent: this.overlay, top: 3 + idx, left: 1, width: '100%-2', height: 1,
            tags: false, border: false,
            style: { fg: 'yellow', bg: 'blue' },
        });
        renderEdit();
        this.screen.render();
        const handler = (ch, key) => {
            if (skipFirst) {
                skipFirst = false;
                return;
            }
            const kn = key?.name ?? '';
            if (kn === 'enter' || kn === 'return' || ch === '\r' || ch === '\n') {
                commit();
            }
            else if (kn === 'escape' || ch === '\x1b') {
                cancel();
            }
            else if (kn === 'left') {
                if (cur > 0) {
                    cur--;
                    renderEdit();
                }
            }
            else if (kn === 'right') {
                if (cur < buf.length) {
                    cur++;
                    renderEdit();
                }
            }
            else if (kn === 'home') {
                cur = 0;
                renderEdit();
            }
            else if (kn === 'end') {
                cur = buf.length;
                renderEdit();
            }
            else if (kn === 'backspace' || ch === '\x7f' || ch === '\b') {
                if (cur > 0) {
                    buf = buf.slice(0, cur - 1) + buf.slice(cur);
                    cur--;
                    renderEdit();
                }
            }
            else if (kn === 'delete') {
                if (cur < buf.length) {
                    buf = buf.slice(0, cur) + buf.slice(cur + 1);
                    renderEdit();
                }
            }
            else if (ch && ch.length === 1 && ch.charCodeAt(0) >= 32) {
                buf = buf.slice(0, cur) + ch + buf.slice(cur);
                cur++;
                renderEdit();
            }
        };
        // Skip the first keypress event — it's the Enter that opened the edit
        let skipFirst = true;
        this.activeEditHandler = handler;
        const commit = () => {
            this.screen.off('keypress', handler);
            this.activeEditHandler = null;
            this.blockNextSelect = true; // block the 'select' fired by the same Enter
            editPanel.destroy();
            this.listWidget.focus();
            const newRaw = buf.trim();
            if (newRaw !== currentDisplay && newRaw) {
                const eq = newRaw.indexOf('=');
                const newKey = eq === -1 ? newRaw : newRaw.slice(0, eq).trim();
                const newValue = eq === -1 ? '' : newRaw.slice(eq + 1).trim();
                this.tooltypes[idx] = { key: newKey.toUpperCase(), value: newValue, commented: tt.commented };
                this.dirty = true;
                this.renderList();
                this.listWidget.select(idx);
                this.updateFooter('Unsaved changes — press S to save');
            }
            this.screen.render();
        };
        const cancel = () => {
            this.screen.off('keypress', handler);
            this.activeEditHandler = null;
            this.blockNextSelect = true;
            editPanel.destroy();
            this.listWidget.focus();
            this.screen.render();
        };
        this.screen.on('keypress', handler);
    }
    toggleComment() {
        const idx = this.listWidget.selected ?? 0;
        const tt = this.tooltypes[idx];
        if (!tt)
            return;
        this.tooltypes[idx] = { ...tt, commented: !tt.commented };
        this.dirty = true;
        this.renderList();
        this.listWidget.select(idx);
        this.updateFooter('Unsaved changes — press S to save');
        this.screen.render();
    }
    async save() {
        if (this.closed)
            return;
        const ok = await this.bbs.writeInfoFile(this.infoPath, this.tooltypes);
        if (ok) {
            this.dirty = false;
            this.updateFooter('Saved — closing...', 'green');
            this.screen.render();
            setTimeout(() => { this.close(); }, 600);
        }
        else {
            this.updateFooter('Save failed', 'red');
            this.screen.render();
        }
    }
    updateFooter(msg, color = 'yellow') {
        this.footer.setContent(`{center}{${color}-fg}${msg}{/${color}-fg}{/center}`);
    }
    close() {
        if (this.closed)
            return; // prevent double-close from stale key listeners
        this.closed = true;
        // Clean up any active inline edit handler before destroying
        if (this.activeEditHandler) {
            this.screen.off('keypress', this.activeEditHandler);
            this.activeEditHandler = null;
        }
        this.overlay.destroy();
        this.onClose();
    }
}
exports.InfoEditorOverlay = InfoEditorOverlay;
//# sourceMappingURL=InfoEditorOverlay.js.map