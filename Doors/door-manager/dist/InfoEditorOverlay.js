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
            content: `{center}{yellow-fg}Enter{/yellow-fg}=Edit  {yellow-fg}!{/yellow-fg}=Toggle comment  {yellow-fg}Ctrl+S{/yellow-fg}=Save  {yellow-fg}ESC{/yellow-fg}=Cancel{/center}`,
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
        this.listWidget.key(['enter'], () => { this.editSelected(); });
        this.listWidget.key(['!'], () => { this.toggleComment(); });
        this.overlay.key(['C-s'], async () => { await this.save(); });
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
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const blessed = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
        const currentDisplay = tt.value ? `${tt.key}=${tt.value}` : tt.key;
        const input = blessed.textbox({
            parent: this.overlay,
            top: 3 + idx,
            left: 1,
            width: '100%-2',
            height: 1,
            value: currentDisplay,
            keys: true,
            mouse: true,
            inputOnFocus: true,
            style: { fg: 'white', bg: 'black', focus: { bg: 'blue' } },
        });
        input.focus();
        input.readInput(() => {
            const newRaw = input.value.trim();
            input.destroy();
            this.listWidget.focus();
            if (newRaw !== currentDisplay) {
                const eq = newRaw.indexOf('=');
                const newKey = eq === -1 ? newRaw : newRaw.slice(0, eq).trim();
                const newValue = eq === -1 ? '' : newRaw.slice(eq + 1).trim();
                this.tooltypes[idx] = { key: newKey.toUpperCase(), value: newValue, commented: tt.commented };
                this.dirty = true;
                this.renderList();
                this.listWidget.select(idx);
                this.updateFooter('Unsaved changes -- Ctrl+S to save');
            }
            this.screen.render();
        });
        this.screen.render();
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
        this.updateFooter('Unsaved changes -- Ctrl+S to save');
        this.screen.render();
    }
    async save() {
        const ok = await this.bbs.writeInfoFile(this.infoPath, this.tooltypes);
        if (ok) {
            this.dirty = false;
            this.updateFooter('Saved', 'green');
            setTimeout(() => { this.close(); }, 800);
        }
        else {
            this.updateFooter('Save failed', 'red');
        }
        this.screen.render();
    }
    updateFooter(msg, color = 'yellow') {
        this.footer.setContent(`{center}{${color}-fg}${msg}{/${color}-fg}{/center}`);
    }
    close() {
        this.overlay.destroy();
        this.onClose();
    }
}
exports.InfoEditorOverlay = InfoEditorOverlay;
//# sourceMappingURL=InfoEditorOverlay.js.map