/**
 * Search and Replace dialog (Enhanced)
 * Modal dialog for find/replace operations with improved UI
 */

import { box, text, textbox, checkbox, line, type Screen, type Box, type Textbox, type Checkbox, type Element } from '../../blessed';
import type { SearchOptions } from '../types';

export interface SearchDialogOptions {
  parent: Screen;
  mode: 'find' | 'replace';
  initialQuery?: string;
  onSearch?: (query: string, options: SearchOptions) => void;
  onReplace?: (query: string, replacement: string, replaceAll: boolean) => void;
  onClose?: () => void;
}

export class SearchDialog {
  private box: Box;
  private queryInput: Textbox;
  private replaceInput?: Textbox;
  private caseSensitiveCheckbox: Checkbox;
  private regexCheckbox: Checkbox;
  private wholeWordCheckbox: Checkbox;
  private options: SearchDialogOptions;
  private focusableElements: Element[] = [];

  constructor(options: SearchDialogOptions) {
    this.options = options;

    // Create dialog box with improved styling
    this.box = box({
      parent: options.parent,
      top: 'center',
      left: 'center',
      width: 62,
      height: options.mode === 'replace' ? 16 : 12,
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
      label: options.mode === 'replace' ? ' {cyan-fg}Find & Replace{/} ' : ' {cyan-fg}Find{/} ',
      keys: true,
      mouse: true,
    });

    // Query label
    text({
      parent: this.box,
      top: 1,
      left: 2,
      content: '{yellow-fg}Find what:{/}',
      tags: true,
    });

    // Query input with focus styling
    this.queryInput = textbox({
      parent: this.box,
      top: 2,
      left: 2,
      width: 56,
      height: 1,
      inputOnFocus: true,
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        bg: 'blue',
        focus: {
          fg: 'white',
          bg: 'green',
        },
      },
      value: options.initialQuery || '',
    });

    this.focusableElements.push(this.queryInput);

    // Replace input (if replace mode)
    if (options.mode === 'replace') {
      // Replace label
      text({
        parent: this.box,
        top: 4,
        left: 2,
        content: '{yellow-fg}Replace with:{/}',
        tags: true,
      });

      this.replaceInput = textbox({
        parent: this.box,
        top: 5,
        left: 2,
        width: 56,
        height: 1,
        inputOnFocus: true,
        mouse: true,
        keys: true,
        style: {
          fg: 'white',
          bg: 'blue',
          focus: {
            fg: 'white',
            bg: 'green',
          },
        },
      });

      this.focusableElements.push(this.replaceInput);
    }

    const checkboxTop = options.mode === 'replace' ? 7 : 4;

    // Options section label
    text({
      parent: this.box,
      top: checkboxTop,
      left: 2,
      content: '{yellow-fg}Options:{/}',
      tags: true,
    });

    // Case sensitive checkbox with improved styling
    this.caseSensitiveCheckbox = checkbox({
      parent: this.box,
      top: checkboxTop + 1,
      left: 4,
      content: 'Case sensitive',
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        focus: {
          fg: 'yellow',
        },
      },
    });

    this.focusableElements.push(this.caseSensitiveCheckbox);

    // Regex checkbox with improved styling
    this.regexCheckbox = checkbox({
      parent: this.box,
      top: checkboxTop + 2,
      left: 4,
      content: 'Regular expression',
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        focus: {
          fg: 'yellow',
        },
      },
    });

    this.focusableElements.push(this.regexCheckbox);

    // Whole word checkbox with improved styling
    this.wholeWordCheckbox = checkbox({
      parent: this.box,
      top: checkboxTop + 3,
      left: 4,
      content: 'Whole word',
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        focus: {
          fg: 'yellow',
        },
      },
    });

    this.focusableElements.push(this.wholeWordCheckbox);

    // Separator line
    const helpTop = checkboxTop + 5;
    line({
      parent: this.box,
      top: helpTop,
      left: 1,
      right: 1,
      orientation: 'horizontal',
      style: {
        fg: 'gray',
      },
    });

    // Help text with better formatting
    text({
      parent: this.box,
      top: helpTop + 1,
      left: 2,
      content: options.mode === 'replace'
        ? '{green-fg}Enter{/}: Replace  {green-fg}Ctrl+Enter{/}: Replace All  {gray-fg}Tab{/}: Navigate  {red-fg}ESC{/}: Cancel'
        : '{green-fg}Enter{/}: Find  {green-fg}F3{/}: Find Next  {gray-fg}Tab{/}: Navigate  {red-fg}ESC{/}: Cancel',
      tags: true,
      style: {
        fg: 'cyan',
      },
    });

    this.setupKeyHandlers();
    this.queryInput.focus();
  }

  /**
   * Setup keyboard handlers
   */
  private setupKeyHandlers(): void {
    // ESC to close
    this.box.key(['escape'], () => {
      this.close();
    });

    // Tab navigation between fields
    this.box.key(['tab'], () => {
      this.focusNext();
    });

    // Shift+Tab for reverse navigation
    this.box.key(['S-tab'], () => {
      this.focusPrevious();
    });

    // Enter in query input
    this.queryInput.key(['enter'], () => {
      if (this.options.mode === 'find') {
        this.handleSearch();
      } else if (this.replaceInput) {
        // In replace mode, Enter moves to replace field
        this.replaceInput.focus();
      }
    });

    // Tab in query input
    this.queryInput.key(['tab'], () => {
      this.focusNext();
    });

    // Replace input handlers
    if (this.replaceInput) {
      this.replaceInput.key(['enter'], () => {
        this.handleReplace(false);
      });

      this.replaceInput.key(['C-enter'], () => {
        this.handleReplace(true);
      });

      this.replaceInput.key(['tab'], () => {
        this.focusNext();
      });
    }

    // Checkbox handlers - Space to toggle, Enter to confirm and search
    [this.caseSensitiveCheckbox, this.regexCheckbox, this.wholeWordCheckbox].forEach(checkbox => {
      checkbox.key(['enter'], () => {
        if (this.options.mode === 'find') {
          this.handleSearch();
        } else {
          this.handleReplace(false);
        }
      });

      checkbox.key(['tab'], () => {
        this.focusNext();
      });
    });
  }

  /**
   * Focus next element in tab order
   */
  private focusNext(): void {
    const currentIndex = this.getCurrentFocusIndex();
    const nextIndex = (currentIndex + 1) % this.focusableElements.length;
    this.focusableElements[nextIndex].focus();
    this.options.parent.render();
  }

  /**
   * Focus previous element in tab order
   */
  private focusPrevious(): void {
    const currentIndex = this.getCurrentFocusIndex();
    const prevIndex = currentIndex === 0
      ? this.focusableElements.length - 1
      : currentIndex - 1;
    this.focusableElements[prevIndex].focus();
    this.options.parent.render();
  }

  /**
   * Get index of currently focused element
   */
  private getCurrentFocusIndex(): number {
    for (let i = 0; i < this.focusableElements.length; i++) {
      if ((this.focusableElements[i] as any).focused) {
        return i;
      }
    }
    return 0;
  }

  /**
   * Handle search
   */
  private handleSearch(): void {
    const query = this.queryInput.getValue();
    if (!query) {
      return;
    }

    const searchOptions: SearchOptions = {
      query,
      caseSensitive: this.caseSensitiveCheckbox.isChecked(),
      regex: this.regexCheckbox.isChecked(),
      wholeWord: this.wholeWordCheckbox.isChecked(),
    };

    if (this.options.onSearch) {
      this.options.onSearch(query, searchOptions);
    }
  }

  /**
   * Handle replace
   */
  private handleReplace(replaceAll: boolean): void {
    if (!this.replaceInput) {
      return;
    }

    const query = this.queryInput.getValue();
    const replacement = this.replaceInput.getValue();

    if (!query) {
      return;
    }

    if (this.options.onReplace) {
      this.options.onReplace(query, replacement, replaceAll);
    }

    this.close();
  }

  /**
   * Show dialog
   */
  show(): void {
    this.box.show();
    this.queryInput.focus();
    this.options.parent.render();
  }

  /**
   * Close dialog
   */
  close(): void {
    this.box.destroy();
    if (this.options.onClose) {
      this.options.onClose();
    }
    this.options.parent.render();
  }
}
