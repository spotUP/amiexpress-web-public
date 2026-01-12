/**
 * Autocomplete Widget
 * Shows autocomplete suggestions in a popup list
 */

import { Box } from './box';
import { List } from './list';
import { Element } from '../core/element';
import type {
  AutocompleteOptions,
  AutocompleteSuggestion,
  AutocompleteProvider,
  AutocompleteContext
} from '../core/types';
import { AutocompleteManager } from '../utils/AutocompleteManager';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export class Autocomplete extends Box {
  private list: List;
  private suggestions: AutocompleteSuggestion[] = [];
  public manager: AutocompleteManager;
  private selectedIndex = 0;
  private _targetElement: Element | null = null;

  constructor(options: AutocompleteOptions = {}) {
    super({
      width: 40,
      height: 10,
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      },
      tags: true,
      label: ' Autocomplete ',
      hidden: true,
      zIndex: 100,
      ...options,
    });

    this.manager = new AutocompleteManager(options.providers || []);

    // Create suggestion list
    this.list = new List({
      parent: this,
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
    } as any);

    // Handle selection
    this.list.on('select', () => {
      this.selectCurrent();
    });

    // Handle keyboard navigation
    this.list.on('keypress', (ch, key) => {
      if (key.name === 'up' || (key.name === 'k')) {
        this.list.up(1);
        this.selectedIndex = this.list.selected;
        this.screen?.render();
        return true;
      }
      if (key.name === 'down' || (key.name === 'j')) {
        this.list.down(1);
        this.selectedIndex = this.list.selected;
        this.screen?.render();
        return true;
      }
      if (key.name === 'enter' || key.name === 'tab') {
        this.selectCurrent();
        return true;
      }
      if (key.name === 'escape') {
        this.cancel();
        return true;
      }
      return false;
    });

    // Mouse click selection
    this.list.on('click', () => {
      this.selectedIndex = this.list.selected;
      this.selectCurrent();
    });
  }

  /**
   * Attach this autocomplete to a specific element (like a Textbox)
   */
  attachTo(element: Element): void {
    this._targetElement = element;
    
    // Automatically position below target element
    this.top = (element.atop + element.height) as number;
    this.left = element.aleft;
    
    // Ensure it's on top
    this.setFront();
  }

  /**
   * Add a provider to the manager
   */
  addProvider(provider: AutocompleteProvider): void {
    this.manager.addProvider(provider);
  }

  /**
   * Suggest completions for the given context
   */
  async suggest(context: AutocompleteContext): Promise<void> {
    const suggestions = await this.manager.getSuggestions(context);
    this.showSuggestions(suggestions);
  }

  /**
   * Display specific suggestions
   */
  showSuggestions(suggestions: AutocompleteSuggestion[]): void {
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
    
    // Show and focus
    this.show();
    this.list.focus();
    
    // If we have a target element, make sure we're positioned correctly
    if (this._targetElement) {
      this.top = (this._targetElement.atop + (this._targetElement.height as number)) as number;
      this.left = this._targetElement.aleft;
      
      // Keep within screen bounds
      if (this.screen) {
        if ((this.top as number) + (this.height as number) > this.screen.height) {
          // Flip to show above target if no room below
          this.top = (this._targetElement.atop - (this.height as number)) as number;
        }
      }
    }
    
    this.screen?.render();
  }

  private selectCurrent(): void {
    const selected = this.getSelected();
    if (selected) {
      this.emit('select', selected);
    }
    this.hide();
    
    // Return focus to target element if it exists
    if (this._targetElement) {
      this._targetElement.focus();
    }
  }

  private cancel(): void {
    this.emit('cancel');
    this.hide();
    
    // Return focus to target element if it exists
    if (this._targetElement) {
      this._targetElement.focus();
    }
  }

  /**
   * Check if the autocomplete list is currently visible
   */
  isVisible(): boolean {
    return !this.hidden && this.visible;
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

  get type(): string {
    return 'autocomplete';
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
    // Re-position dropdown if visible
    if (!this.hidden && this._targetElement) {
      this.top = (this._targetElement.atop + (this._targetElement.height as number)) as number;
      this.left = this._targetElement.aleft;
    }
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }
}

/**
 * Factory function
 */
export function autocomplete(options: AutocompleteOptions = {}): Autocomplete {
  return new Autocomplete(options);
}