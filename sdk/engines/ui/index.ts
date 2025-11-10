/**
 * UI Engine - Neo-Blessed Terminal UI Library
 *
 * Export all UI engine components
 */

export { UIEngine } from './ui-engine';
export type { UIEngineOptions, WidgetStyle } from './ui-engine';

export { UIHelpers } from './ui-helpers';
export type {
  MenuItem,
  DialogOptions,
  InputDialogOptions,
  ConfirmDialogOptions,
  ListSelectionOptions,
  StatusBarOptions,
} from './ui-helpers';

// Re-export blessed types for convenience
export type { Widgets } from 'blessed';
