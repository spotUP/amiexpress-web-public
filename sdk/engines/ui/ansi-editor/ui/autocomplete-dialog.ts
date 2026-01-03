/**
 * Autocomplete Dialog
 * Shows autocomplete suggestions in a popup list
 */

import { box, list, type Screen, type Box, type List } from '../../blessed';
import type { AutocompleteSuggestion } from '../types';

export interface AutocompleteDialogOptions {
  parent: Screen;
  cursorRow: number;  // Visual row where cursor is
  cursorCol: number;  // Visual column where cursor is
  onSelect?: (suggestion: AutocompleteSuggestion) => void;
  onCancel?: () => void;
}

export class AutocompleteDialog {
  private box: Box;
  private list: List;
  private suggestions: AutocompleteSuggestion[] = [];
  private options: AutocompleteDialogOptions;
  private selectedIndex = 0;

  constructor(options: AutocompleteDialogOptions) {
    this.options = options;

    // Position dialog near cursor (below if space, above if not)
    const parent = options.parent;
    const parentHeight = parent.height as number || 24;
    const dialogHeight = 10;
    const spaceBelow = parentHeight - options.cursorRow - 1;
    const positionBelow = spaceBelow >= dialogHeight;

    const top = positionBelow
      ? options.cursorRow + 1
      : Math.max(0, options.cursorRow - dialogHeight);

    // Position horizontally near cursor, but keep within screen bounds
    const left = Math.min(options.cursorCol, 60);

    // Create dialog box
    this.box = box({
      parent: options.parent,
      top,
      left,
      width: 40,
      height: dialogHeight,
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan',
        },
      },
      tags: true,
      label: ' {cyan-fg}Autocomplete{/} ',
      keys: true,
      mouse: true,
      hidden: true,
    });

    // Create suggestion list
    this.list = list({
      parent: this.box,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-2',
      keys: true,
      mouse: true,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
        selected: {
          fg: 'black',
          bg: 'cyan',
        },
      },
      scrollbar: {
        ch: ' ',
        style: {
          bg: 'cyan',
        },
      },
    });

    // Handle selection
    this.list.on('select', () => {
      this.selectCurrent();
    });

    // Handle keyboard navigation
    this.list.key(['up', 'k'], () => {
      this.list.up(1);
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.updateSelection();
    });

    this.list.key(['down', 'j'], () => {
      this.list.down(1);
      this.selectedIndex = Math.min(this.suggestions.length - 1, this.selectedIndex + 1);
      this.updateSelection();
    });

    this.list.key(['pageup'], () => {
      this.list.up(5);
      this.selectedIndex = Math.max(0, this.selectedIndex - 5);
      this.updateSelection();
    });

    this.list.key(['pagedown'], () => {
      this.list.down(5);
      this.selectedIndex = Math.min(this.suggestions.length - 1, this.selectedIndex + 5);
      this.updateSelection();
    });

    this.list.key(['enter', 'tab'], () => {
      this.selectCurrent();
    });

    this.list.key(['escape'], () => {
      this.cancel();
    });

    // Mouse click selection
    this.list.on('click', () => {
      this.selectedIndex = this.list.selected;
      this.selectCurrent();
    });
  }

  /**
   * Update suggestions and show dialog
   */
  show(suggestions: AutocompleteSuggestion[]) {
    this.suggestions = suggestions;
    this.selectedIndex = 0;

    if (suggestions.length === 0) {
      this.hide();
      return;
    }

    // Format suggestions for display
    const items = suggestions.map(s => {
      const kindTag = this.getKindTag(s.kind);
      const detail = s.detail ? ` {gray-fg}(${s.detail}){/}` : '';
      return `${kindTag} ${s.label}${detail}`;
    });

    this.list.setItems(items);
    this.list.select(0);
    this.box.show();
    this.list.focus();
    this.options.parent.render();
  }

  /**
   * Hide dialog
   */
  hide() {
    this.box.hide();
    this.suggestions = [];
    this.selectedIndex = 0;
    this.options.parent.render();
  }

  /**
   * Destroy dialog
   */
  destroy() {
    this.list.destroy();
    this.box.destroy();
  }

  /**
   * Check if dialog is visible
   */
  isVisible(): boolean {
    return !this.box.hidden;
  }

  /**
   * Get selected suggestion
   */
  getSelected(): AutocompleteSuggestion | null {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.suggestions.length) {
      return this.suggestions[this.selectedIndex];
    }
    return null;
  }

  /**
   * Focus the dialog
   */
  focus() {
    this.list.focus();
  }

  private selectCurrent() {
    const selected = this.getSelected();
    if (selected && this.options.onSelect) {
      this.options.onSelect(selected);
    }
    this.hide();
  }

  private cancel() {
    if (this.options.onCancel) {
      this.options.onCancel();
    }
    this.hide();
  }

  private updateSelection() {
    this.list.select(this.selectedIndex);
    this.options.parent.render();
  }

  private getKindTag(kind?: string): string {
    switch (kind) {
      case 'user':
        return '{magenta-fg}@{/}';
      case 'keyword':
        return '{yellow-fg}[]{/}';
      case 'function':
        return '{green-fg}f(){/}';
      case 'variable':
        return '{blue-fg}var{/}';
      case 'text':
      default:
        return '{white-fg}abc{/}';
    }
  }
}
