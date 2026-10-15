/**
 * Autocomplete Dialog - Proxy to the core widget
 */

import { Autocomplete } from '../../blessed/widgets/autocomplete';
import type { AutocompleteOptions, AutocompleteSuggestion } from '../../blessed/core/types';

/**
 * Compatibility wrapper for AutocompleteDialog
 */
export class AutocompleteDialog extends Autocomplete {
  constructor(options: any) {
    super({
      parent: options.parent,
      left: options.cursorCol || 0,
      top: (options.cursorRow || 0) + 1,
      onSelect: options.onSelect,
      onCancel: options.onCancel
    });
  }
}