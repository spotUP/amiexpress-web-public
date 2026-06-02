/**
 * InfoEditorOverlay - edit door registration .info (BBSCmd) files
 * Spot / Up Rough
 */

import {
  Box,
  Panel,
  List,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

interface InfoEditorOptions {
  screen: any;
  command: string;         // e.g. "ARKANOID"
  bbs: any;
  onClose: () => void;
}

interface Tooltype {
  key: string;
  value: string;
  commented: boolean;
}

export class InfoEditorOverlay {
  private screen: any;
  private command: string;
  private bbs: any;
  private onClose: () => void;
  private overlay: any;
  private header: any;
  private footer: any;
  private listWidget: any;
  private tooltypes: Tooltype[] = [];
  private dirty = false;
  private infoPath: string;

  constructor(opts: InfoEditorOptions) {
    this.screen = opts.screen;
    this.command = opts.command.toUpperCase();
    this.bbs = opts.bbs;
    this.onClose = opts.onClose;
    this.infoPath = `Commands/BBSCmd/${this.command}.info`;
    this.buildUI();
    this.loadInfo().then(() => this.screen.render());
  }

  private buildUI(): void {
    this.overlay = new Box({
      parent: this.screen,
      top: 0, left: 0, width: '100%', height: '100%',
      style: { bg: 'black' },
      tags: true, keys: true, focusable: true,
    } as any);

    this.header = new Panel({
      parent: this.overlay,
      top: 0, left: 0, width: '100%', height: 3,
      tags: true,
      content: `  {cyan-fg}EDIT: ${this.command}.info{/cyan-fg}  `,
      style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
      focusable: false,
    } as any);

    this.footer = new Panel({
      parent: this.overlay,
      bottom: 0, left: 0, width: '100%', height: 3,
      tags: true,
      content: `{center}{yellow-fg}Enter{/yellow-fg}=Edit  {yellow-fg}!{/yellow-fg}=Toggle  {yellow-fg}S{/yellow-fg}=Save+Close  {yellow-fg}ESC{/yellow-fg}=Cancel{/center}`,
      style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
      focusable: false,
    } as any);

    this.listWidget = new List({
      parent: this.overlay,
      top: 3, left: 0, width: '100%', height: '100%-6',
      keys: true, vi: true, mouse: true,
      tags: true,
      style: {
        selected: { bg: 'blue', fg: 'white' },
        item: { fg: 'white' },
      },
    } as any);

    this.listWidget.key(['enter'], () => { this.editSelected(); });
    this.listWidget.key(['!'], () => { this.toggleComment(); });
    this.listWidget.key(['s', 'S'], async () => { await this.save(); });
    this.overlay.key(['s', 'S'], async () => { await this.save(); });
    this.overlay.key(['escape'], () => { this.close(); });

    this.listWidget.focus();
  }

  private async loadInfo(): Promise<void> {
    const tooltypes = await this.bbs.readInfoFile(this.infoPath);
    if (!tooltypes) {
      this.tooltypes = [];
      (this.listWidget as any).setItems(['{red-fg}Cannot read .info file{/red-fg}']);
      return;
    }
    this.tooltypes = tooltypes;
    this.renderList();
  }

  private renderList(): void {
    const items = this.tooltypes.map(tt => {
      const prefix = tt.commented ? '{gray-fg}!' : '{yellow-fg}';
      const suffix = tt.commented ? '{/gray-fg}' : '{/yellow-fg}';
      const kv = tt.value ? `${tt.key}=${tt.value}` : tt.key;
      return `${prefix}${kv}${suffix}`;
    });
    if (items.length === 0) items.push('{gray-fg}(empty){/gray-fg}');
    (this.listWidget as any).setItems(items);
  }

  private editSelected(): void {
    const idx: number = (this.listWidget as any).selected ?? 0;
    const tt = this.tooltypes[idx];
    if (!tt) return;

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
      const newRaw = (input.value as string).trim();
      input.destroy();
      this.listWidget.focus();
      if (newRaw !== currentDisplay) {
        const eq = newRaw.indexOf('=');
        const newKey = eq === -1 ? newRaw : newRaw.slice(0, eq).trim();
        const newValue = eq === -1 ? '' : newRaw.slice(eq + 1).trim();
        this.tooltypes[idx] = { key: newKey.toUpperCase(), value: newValue, commented: tt.commented };
        this.dirty = true;
        this.renderList();
        (this.listWidget as any).select(idx);
        this.updateFooter('Unsaved changes -- Ctrl+S to save');
      }
      this.screen.render();
    });

    this.screen.render();
  }

  private toggleComment(): void {
    const idx: number = (this.listWidget as any).selected ?? 0;
    const tt = this.tooltypes[idx];
    if (!tt) return;
    this.tooltypes[idx] = { ...tt, commented: !tt.commented };
    this.dirty = true;
    this.renderList();
    (this.listWidget as any).select(idx);
    this.updateFooter('Unsaved changes -- Ctrl+S to save');
    this.screen.render();
  }

  private async save(): Promise<void> {
    const ok = await this.bbs.writeInfoFile(this.infoPath, this.tooltypes);
    if (ok) {
      this.dirty = false;
      this.updateFooter('Saved', 'green');
      setTimeout(() => { this.close(); }, 800);
    } else {
      this.updateFooter('Save failed', 'red');
    }
    this.screen.render();
  }

  private updateFooter(msg: string, color: 'yellow' | 'green' | 'red' = 'yellow'): void {
    (this.footer as any).setContent(
      `{center}{${color}-fg}${msg}{/${color}-fg}{/center}`,
    );
  }

  private close(): void {
    this.overlay.destroy();
    this.onClose();
  }
}
