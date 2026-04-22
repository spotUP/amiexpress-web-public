/**
 * AutocompleteTextbox Widget
 * A textbox with integrated autocomplete suggestions popup
 *
 * Usage:
 * ```typescript
 * const input = blessed.autocompleteTextbox({
 *   parent: screen,
 *   top: 5,
 *   left: 5,
 *   width: 40,
 *   height: 1,
 *   border: { type: 'line' },
 *   suggestions: ['apple', 'banana', 'cherry', 'date'],
 *   // OR use a provider function:
 *   getSuggestions: async (text) => {
 *     return users.filter(u => u.startsWith(text));
 *   },
 *   minLength: 1,  // Start suggesting after 1 character
 * });
 *
 * input.on('select', (suggestion) => {
 *   console.log('Selected:', suggestion);
 * });
 * ```
 */

import { Element } from '../core/element';
import { List } from './list';
import { Box } from './box';
import type { TextboxOptions, KeyEvent } from '../core/types';

export interface AutocompleteTextboxOptions extends TextboxOptions {
  /**
   * Static list of suggestions to filter
   */
  suggestions?: string[];

  /**
   * Dynamic suggestion provider function
   * Called with current text value, returns array of suggestions
   */
  getSuggestions?: (text: string) => Promise<string[]> | string[];

  /**
   * Minimum characters before showing suggestions (default: 1)
   */
  minLength?: number;

  /**
   * Maximum number of suggestions to show (default: 10)
   */
  maxSuggestions?: number;

  /**
   * Case-insensitive matching (default: true)
   */
  caseInsensitive?: boolean;

  /**
   * Match anywhere in string, not just start (default: false)
   */
  matchAnywhere?: boolean;

  /**
   * Debounce delay in ms before fetching suggestions (default: 100)
   */
  debounceMs?: number;

  /**
   * Height of the suggestion popup (default: 8)
   */
  popupHeight?: number;
}

/**
 * AutocompleteTextbox - A textbox with integrated autocomplete popup
 *
 * This is a complete implementation that doesn't extend Textbox to avoid
 * keypress handler conflicts. It implements all textbox functionality plus
 * autocomplete.
 */
export class AutocompleteTextbox extends Element {
  value: string = '';
  private cursorPos: number = 0;
  private viewOffset: number = 0;

  // Autocomplete state
  private popup: Box | null = null;
  private list: List | null = null;
  private allSuggestions: string[] = [];
  private filteredSuggestions: string[] = [];
  private selectedIndex: number = 0;
  private isPopupVisible: boolean = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Autocomplete options
  private minLength: number;
  private maxSuggestions: number;
  private caseInsensitive: boolean;
  private matchAnywhere: boolean;
  private debounceMs: number;
  private popupHeight: number;
  private getSuggestionsFunc?: (text: string) => Promise<string[]> | string[];

  constructor(options: AutocompleteTextboxOptions = {}) {
    super({
      focusable: true,
      clickable: true,
      mouse: true,
      keys: true,
      ...options,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
        ...options.style,
        focus: {
          fg: 'white',
          bg: 'lightblue',
          ...options.style?.focus,
        },
      },
    });

    this.value = options.value || '';
    this.cursorPos = this.value.length;

    // Store autocomplete options
    this.allSuggestions = options.suggestions || [];
    this.getSuggestionsFunc = options.getSuggestions;
    this.minLength = options.minLength ?? 1;
    this.maxSuggestions = options.maxSuggestions ?? 10;
    this.caseInsensitive = options.caseInsensitive ?? true;
    this.matchAnywhere = options.matchAnywhere ?? false;
    this.debounceMs = options.debounceMs ?? 100;
    this.popupHeight = options.popupHeight ?? 8;

    // Update display
    this._updateContent();

    // Key handlers
    if (options.keys !== false) {
      this.on('keypress', this._onKeypress.bind(this));
    }

    // Focus handlers
    this.on('focus', () => {
      this._updateContent();
    });

    this.on('blur', () => {
      this.hidePopup();
      this._updateContent();
    });

    // Click to focus
    this.on('click', (event: any) => {
      this.focus();
      if (event && typeof event.x === 'number') {
        const clickPos = this._getCharPosFromClick(event.x);
        this.cursorPos = clickPos;
        this._updateContent();
      }
    });
  }

  private _getCharPosFromClick(clickX: number): number {
    const elementLeft = this.aleft + (this.ileft || 0);
    const relativeX = clickX - elementLeft;
    const pos = this.viewOffset + relativeX;
    return Math.max(0, Math.min(pos, this.value.length));
  }

  private _onKeypress(ch: any, key: KeyEvent): boolean {
    if (!this.focused) return false;

    // Handle autocomplete navigation FIRST when popup is visible
    if (this.isPopupVisible) {
      switch (key.name) {
        case 'up':
          if (this.selectedIndex > 0) {
            this.selectedIndex--;
            this.list?.select(this.selectedIndex);
            this.screen?.render();
          }
          return true;

        case 'down':
          if (this.selectedIndex < this.filteredSuggestions.length - 1) {
            this.selectedIndex++;
            this.list?.select(this.selectedIndex);
            this.screen?.render();
          }
          return true;

        case 'enter':
        case 'tab':
          this.acceptSuggestion();
          return true;

        case 'escape':
          this.hidePopup();
          return true;
      }
    }

    // Ignore Tab when popup not visible - let screen handle focus
    if (key.name === 'tab') return false;

    // Character input
    if (ch && ch.length >= 1 && !key.ctrl && !key.meta) {
      const charCode = ch.charCodeAt(0);
      if (charCode >= 32 && charCode !== 127) {
        this.insertChar(ch);
        return true;
      }
    }

    // Special keys
    switch (key.name) {
      case 'backspace':
        this.deleteChar();
        return true;

      case 'delete':
        this.deleteCharForward();
        return true;

      case 'left':
        this.cursorLeft();
        return true;

      case 'right':
        this.cursorRight();
        return true;

      case 'home':
        this.cursorHome();
        return true;

      case 'end':
        this.cursorEnd();
        return true;

      case 'escape':
        this.blur();
        this.emit('cancel');
        return true;

      case 'enter':
        this.emit('submit', this.value);
        return true;
    }

    return false;
  }

  private _getVisibleWidth(): number {
    const width = this.iwidth;
    return Math.max(1, width > 0 ? width : 80);
  }

  private _ensureCursorVisible(): void {
    const visibleWidth = this._getVisibleWidth();

    if (this.cursorPos < this.viewOffset) {
      this.viewOffset = this.cursorPos;
    }

    if (this.cursorPos >= this.viewOffset + visibleWidth) {
      this.viewOffset = this.cursorPos - visibleWidth + 1;
    }

    this.viewOffset = Math.max(0, this.viewOffset);
  }

  private _escapeForDisplay(text: string): string {
    return text.replace(/\{/g, '{open}').replace(/\}/g, '{close}');
  }

  private _updateContent(): void {
    this._ensureCursorVisible();
    const visibleWidth = this._getVisibleWidth();
    const visibleText = this.value.slice(this.viewOffset, this.viewOffset + visibleWidth);

    let display: string;
    if (this.focused) {
      const cursorPosInView = this.cursorPos - this.viewOffset;
      const beforeCursor = this._escapeForDisplay(visibleText.slice(0, cursorPosInView));
      const atCursor = this._escapeForDisplay(visibleText[cursorPosInView] || ' ');
      const afterCursor = this._escapeForDisplay(visibleText.slice(cursorPosInView + 1));
      display = `${beforeCursor}{inverse}${atCursor}{/inverse}${afterCursor}`;
    } else {
      display = this._escapeForDisplay(visibleText);
    }

    this.setContent(display);
    if (this.screen) this.screen.render();
  }

  insertChar(ch: string): void {
    this.value = this.value.slice(0, this.cursorPos) + ch + this.value.slice(this.cursorPos);
    this.cursorPos++;
    this._updateContent();
    this.emit('change', this.value);
    this.triggerAutocomplete();
  }

  deleteChar(): void {
    if (this.cursorPos > 0) {
      this.value = this.value.slice(0, this.cursorPos - 1) + this.value.slice(this.cursorPos);
      this.cursorPos--;
      this._updateContent();
      this.emit('change', this.value);
      this.triggerAutocomplete();
    }
  }

  deleteCharForward(): void {
    if (this.cursorPos < this.value.length) {
      this.value = this.value.slice(0, this.cursorPos) + this.value.slice(this.cursorPos + 1);
      this._updateContent();
      this.emit('change', this.value);
      this.triggerAutocomplete();
    }
  }

  cursorLeft(): void {
    if (this.cursorPos > 0) {
      this.cursorPos--;
      this._updateContent();
    }
  }

  cursorRight(): void {
    if (this.cursorPos < this.value.length) {
      this.cursorPos++;
      this._updateContent();
    }
  }

  cursorHome(): void {
    this.cursorPos = 0;
    this.viewOffset = 0;
    this._updateContent();
  }

  cursorEnd(): void {
    this.cursorPos = this.value.length;
    this._updateContent();
  }

  setValue(value: string): void {
    this.value = value;
    this.cursorPos = value.length;
    this.viewOffset = 0;
    this._updateContent();
    this.emit('change', this.value);
  }

  getValue(): string {
    return this.value;
  }

  clearValue(): void {
    this.value = '';
    this.cursorPos = 0;
    this.viewOffset = 0;
    this._updateContent();
    this.emit('change', this.value);
  }

  // ============================================================================
  // Autocomplete Methods
  // ============================================================================

  /**
   * Set static suggestions list
   */
  setSuggestions(suggestions: string[]): void {
    this.allSuggestions = suggestions;
  }

  /**
   * Set dynamic suggestion provider
   */
  setSuggestionProvider(provider: (text: string) => Promise<string[]> | string[]): void {
    this.getSuggestionsFunc = provider;
  }

  private triggerAutocomplete(): void {
    // Clear any pending debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Hide if text is too short
    if (this.value.length < this.minLength) {
      this.hidePopup();
      return;
    }

    // Debounce the suggestion fetch
    this.debounceTimer = setTimeout(async () => {
      await this.fetchAndShowSuggestions();
    }, this.debounceMs);
  }

  private async fetchAndShowSuggestions(): Promise<void> {
    const text = this.value;
    let suggestions: string[];

    // Get suggestions from provider or filter static list
    if (this.getSuggestionsFunc) {
      try {
        suggestions = await this.getSuggestionsFunc(text);
      } catch {
        suggestions = [];
      }
    } else {
      suggestions = this.filterSuggestions(text);
    }

    // Limit suggestions
    this.filteredSuggestions = suggestions.slice(0, this.maxSuggestions);
    this.selectedIndex = 0;

    if (this.filteredSuggestions.length > 0) {
      this.showPopup();
    } else {
      this.hidePopup();
    }
  }

  private filterSuggestions(text: string): string[] {
    const searchText = this.caseInsensitive ? text.toLowerCase() : text;

    return this.allSuggestions.filter(suggestion => {
      const compareText = this.caseInsensitive ? suggestion.toLowerCase() : suggestion;

      if (this.matchAnywhere) {
        return compareText.includes(searchText);
      } else {
        return compareText.startsWith(searchText);
      }
    });
  }

  private ensurePopupCreated(): void {
    if (this.popup) return;

    // Create popup container
    this.popup = new Box({
      width: 40,  // Will be updated in showPopup
      height: this.popupHeight,
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      },
      tags: true,
      hidden: true,
      zIndex: 1000,
    });

    // Create suggestion list inside popup
    this.list = new List({
      parent: this.popup,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-2',
      keys: false,
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
    } as any);

    // Handle mouse click on suggestion
    this.list.on('click', () => {
      if (this.list) {
        this.selectedIndex = this.list.selected;
        this.acceptSuggestion();
      }
    });
  }

  private showPopup(): void {
    if (!this.screen) return;

    this.ensurePopupCreated();
    if (!this.popup || !this.list) return;

    // Add popup to screen if not already added
    if (!this.popup.parent) {
      this.screen.append(this.popup);
    }

    // Get textbox dimensions
    const textboxWidth = typeof this.width === 'number' ? this.width : 40;

    // Position popup below textbox
    this.popup.top = this.atop + 1;  // Just below the textbox
    this.popup.left = this.aleft;
    this.popup.width = textboxWidth;

    // Check if popup would go off screen bottom, flip to above if needed
    const screenHeight = this.screen.height as number;
    const popupBottom = (this.popup.top as number) + this.popupHeight;
    if (popupBottom > screenHeight) {
      this.popup.top = this.atop - this.popupHeight;
    }

    // Update list items
    this.list.setItems(this.filteredSuggestions);
    this.list.select(this.selectedIndex);

    // Show and bring to front
    this.popup.show();
    this.popup.setFront();
    this.isPopupVisible = true;

    this.screen.render();
  }

  private hidePopup(): void {
    if (!this.isPopupVisible) return;

    if (this.popup) {
      this.popup.hide();
    }
    this.isPopupVisible = false;
    this.filteredSuggestions = [];
    this.selectedIndex = 0;

    if (this.screen) {
      this.screen.render();
    }
  }

  private acceptSuggestion(): void {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.filteredSuggestions.length) {
      const suggestion = this.filteredSuggestions[this.selectedIndex];

      // Set the value to the suggestion
      this.setValue(suggestion);

      // Emit select event
      this.emit('select', suggestion);
    }

    this.hidePopup();
  }

  /**
   * Check if popup is currently showing
   */
  isShowingSuggestions(): boolean {
    return this.isPopupVisible;
  }

  /**
   * Manually trigger suggestion fetch
   */
  async refreshSuggestions(): Promise<void> {
    if (this.value.length >= this.minLength) {
      await this.fetchAndShowSuggestions();
    }
  }

  /**
   * Get the currently highlighted suggestion
   */
  getHighlightedSuggestion(): string | null {
    if (this.isPopupVisible && this.selectedIndex >= 0 && this.selectedIndex < this.filteredSuggestions.length) {
      return this.filteredSuggestions[this.selectedIndex];
    }
    return null;
  }

  // Override blur to hide popup
  blur(): void {
    this.hidePopup();
    super.blur();
  }

  // Clean up on destroy
  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.popup?.parent) {
      this.popup.detach();
    }
    super.destroy();
  }

  get type(): string {
    return 'autocomplete-textbox';
  }
}

/**
 * Factory function
 */
export function autocompleteTextbox(options: AutocompleteTextboxOptions = {}): AutocompleteTextbox {
  return new AutocompleteTextbox(options);
}
