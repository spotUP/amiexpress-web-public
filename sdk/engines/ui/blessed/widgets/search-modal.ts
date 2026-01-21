/**
 * SearchModal - Generic search dialog with filters and results
 *
 * Features:
 * - Main search input
 * - Optional additional filter fields
 * - Scrollable results list
 * - Tab navigation between fields
 * - Enter to search, Escape to close
 * - Customizable result rendering
 */

import { Box } from './box';
import { List } from './list';
import { Textbox } from './textbox';
import { Text } from './text';
import type { ElementOptions } from '../core/types';
import type { Screen } from '../core/screen';
import { trapModalInput } from '../utils/modal-helpers';

export interface SearchField {
  /** Field ID */
  id: string;
  /** Field label */
  label: string;
  /** Field width (default: '50%') */
  width?: string | number;
  /** Placeholder text */
  placeholder?: string;
}

export interface SearchResult {
  /** Unique result ID */
  id: string;
  /** Display content (supports tags) */
  content: string;
  /** Original data */
  data?: any;
}

export interface SearchModalOptions extends ElementOptions {
  /** Dialog title */
  title?: string;
  /** Main search field label (default: "Query") */
  searchLabel?: string;
  /** Additional filter fields */
  filters?: SearchField[];
  /** Footer help text */
  helpText?: string;
  /** Callback when search is submitted */
  onSearch?: (query: string, filters: Record<string, string>) => void;
  /** Callback when result is selected */
  onSelect?: (result: SearchResult) => void;
  /** Callback when dialog is closed */
  onClose?: () => void;
  /** Border color (default: "green") */
  borderColor?: string;
}

export class SearchModal extends Box {
  private _searchInput: Textbox;
  private _filterInputs: Map<string, Textbox> = new Map();
  private _resultsList: List;
  private _helpText: Text;
  private _results: SearchResult[] = [];
  private _onSearch?: (query: string, filters: Record<string, string>) => void;
  private _onSelect?: (result: SearchResult) => void;
  private _onClose?: () => void;
  private _focusableFields: Textbox[] = [];
  private _trapCleanup?: () => void;

  constructor(options: SearchModalOptions = {}) {
    const borderColor = options.borderColor || 'green';

    super({
      ...options,
      top: options.top || 'center',
      left: options.left || 'center',
      width: options.width || '90%',
      height: options.height || '90%',
      label: options.title ? ` ${options.title} ` : ' Search ',
      border: options.border || { type: 'line', fg: borderColor },
      shadow: true,
      hidden: true,
      mouse: true,
      keys: true,
      trapFocus: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: borderColor },
        ...options.style,
      },
    });

    this._onSearch = options.onSearch;
    this._onSelect = options.onSelect;
    this._onClose = options.onClose;

    // Calculate field layout
    const filters = options.filters || [];
    const totalFields = 1 + filters.length;
    const defaultWidth = totalFields <= 2 ? `${Math.floor(96 / totalFields)}%` : '46%';

    // Main search input
    this._searchInput = new Textbox({
      parent: this,
      top: 1,
      left: 2,
      width: filters.length > 0 ? defaultWidth : '96%',
      height: 3,
      border: { type: 'line', fg: 'cyan' },
      label: ` ${options.searchLabel || 'Query'} `,
      inputOnFocus: true,
      keys: true,
      mouse: true,
      clickable: true,
      focusable: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
        focus: { bg: 'blue' },
      } as any,
    });
    this._focusableFields.push(this._searchInput);

    // Create filter inputs
    let leftPos = 50;
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      const width = filter.width || defaultWidth;

      const input = new Textbox({
        parent: this,
        top: 1,
        left: `${leftPos}%`,
        width,
        height: 3,
        border: { type: 'line', fg: 'cyan' },
        label: ` ${filter.label} `,
        inputOnFocus: true,
        keys: true,
        mouse: true,
        clickable: true,
        focusable: true,
        style: {
          fg: 'white',
          bg: 'black',
          border: { fg: 'cyan' },
          focus: { bg: 'blue' },
        } as any,
      });

      this._filterInputs.set(filter.id, input);
      this._focusableFields.push(input);
      leftPos += 48;
    }

    // Results list
    this._resultsList = new List({
      parent: this,
      top: 5,
      left: 2,
      width: '96%',
      height: '100%-8',
      border: { type: 'line', fg: 'cyan' },
      label: ' Results ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      interactive: true,
      scrollable: true,
      scrollbar: {
        ch: ' ',
        style: { bg: 'gray' }
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'white' },
        item: {
          hover: { bg: 'blue', fg: 'white' },
        },
      } as any,
    });

    // Help text
    this._helpText = new Text({
      parent: this,
      bottom: 0,
      left: 2,
      width: '96%',
      height: 1,
      content: options.helpText || '{cyan-fg}Enter: Search | Tab: Next field | Esc: Close{/cyan-fg}',
      tags: true,
      style: {
        fg: 'cyan',
        bg: 'black',
      },
    });

    this._setupEventHandlers();
  }

  private _setupEventHandlers(): void {
    // Search submit on Enter
    this._searchInput.key(['enter', 'return'], () => {
      this._handleSearch();
      return true;
    });

    // Tab navigation through fields
    for (let i = 0; i < this._focusableFields.length; i++) {
      const field = this._focusableFields[i];
      field.key(['tab'], () => {
        const nextIndex = (i + 1) % this._focusableFields.length;
        this._focusableFields[nextIndex].focus();
        this.screen?.render();
        return true;
      });

      // Click to focus
      field.on('click', () => {
        field.focus();
        this.screen?.render();
      });
    }

    // Result selection
    this._resultsList.on('select', () => {
      const selected = (this._resultsList as any).selected;
      if (selected !== undefined && this._results[selected]) {
        if (this._onSelect) {
          this._onSelect(this._results[selected]);
        }
        this.emit('select', this._results[selected]);
      }
    });

    // Escape to close
    this.key(['escape'], () => {
      this._handleClose();
    });
  }

  private _handleSearch(): void {
    const query = this._searchInput.getValue();
    const filters: Record<string, string> = {};

    for (const [id, input] of this._filterInputs) {
      const value = input.getValue();
      if (value) {
        filters[id] = value;
      }
    }

    if (this._onSearch) {
      this._onSearch(query, filters);
    }
    this.emit('search', query, filters);
  }

  private _handleClose(): void {
    if (this._onClose) {
      this._onClose();
    }
    this.emit('close');
    this.hide();
  }

  /**
   * Show the modal
   */
  display(): void {
    // Trap modal input to prevent keys from leaking to background elements
    if (!this._trapCleanup) {
      this._trapCleanup = trapModalInput(this);
    }

    this.show();
    this.setFront();
    this._searchInput.focus();
    this.screen?.render();
  }

  /**
   * Hide the modal
   */
  hide(): void {
    super.hide();

    // Cleanup trap handlers
    if (this._trapCleanup) {
      this._trapCleanup();
      this._trapCleanup = undefined;
    }

    this.screen?.render();
  }

  /**
   * Set search results
   */
  setResults(results: SearchResult[]): void {
    this._results = results;
    const items = results.length > 0
      ? results.map(r => r.content)
      : ['{gray-fg}No results found{/gray-fg}'];
    this._resultsList.setItems(items);
    this.screen?.render();
  }

  /**
   * Get current search query
   */
  getQuery(): string {
    return this._searchInput.getValue();
  }

  /**
   * Get filter values
   */
  getFilters(): Record<string, string> {
    const filters: Record<string, string> = {};
    for (const [id, input] of this._filterInputs) {
      filters[id] = input.getValue();
    }
    return filters;
  }

  /**
   * Clear all inputs
   */
  clearInputs(): void {
    this._searchInput.clearValue();
    for (const input of this._filterInputs.values()) {
      input.clearValue();
    }
    this._results = [];
    this._resultsList.setItems([]);
    this.screen?.render();
  }

  /**
   * Set callbacks
   */
  onSearch(callback: (query: string, filters: Record<string, string>) => void): void {
    this._onSearch = callback;
  }

  onSelect(callback: (result: SearchResult) => void): void {
    this._onSelect = callback;
  }

  onClose(callback: () => void): void {
    this._onClose = callback;
  }
}

/**
 * Factory function
 */
export function searchModal(options?: SearchModalOptions): SearchModal {
  return new SearchModal(options);
}
