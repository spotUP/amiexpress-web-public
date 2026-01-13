/**
 * AmiExpress BBS Door SDK - Main Entry Point
 *
 * This SDK now supports dual runtimes:
 * - Server Runtime (Node.js) - For doors using filesystem, database, etc.
 * - Client Runtime (Browser) - For doors using Web Audio, Canvas, WebGL, etc.
 *
 * @example Server Door
 * ```typescript
 * import { ServerDoor } from '@amiexpress/sdk/server';
 *
 * const door = new ServerDoor({
 *   name: 'File Manager',
 *   version: '1.0.0'
 * });
 * ```
 *
 * @example Client Door
 * ```typescript
 * import { ClientDoor } from '@amiexpress/sdk/client';
 *
 * const door = new ClientDoor({
 *   name: 'Music Tracker',
 *   version: '1.0.0'
 * });
 * ```
 *
 * @example Backward Compatible (Default to Server)
 * ```typescript
 * import { Door } from '@amiexpress/sdk';
 *
 * // This now uses ServerDoor for backward compatibility
 * const door = new Door({
 *   name: 'My Game',
 *   version: '1.0.0'
 * });
 * ```
 */

// Common types (shared by both runtimes)
// Note: We avoid exporting * from here if it conflicts with specific engines
export * from './common';

// Core SDK v2.0 - Professional Door API
export { Door as CoreDoor, Output, Input as CoreInput, Storage } from './core';
export type {
  DoorContext,
  DoorConfig,
  OutputAPI,
  InputAPI,
  StorageAPI,
  User,
  KeyPress
} from './core';

// Core types (for engines) - re-export AnsiColor from core to override common version
export { AnsiColor } from './core/types';

// Core utilities - ANSI string manipulation
export * from './core/ansi-string-utils';

// Screen utilities
export { getTerminalDimensions, BBS_CONSTANTS } from './src/utils/screen-utils';

// Server runtime (Node.js)
export { ServerDoor } from './server';

// Client runtime (Browser)
export { ClientDoor } from './client';

// Backward compatibility: Default Door is ServerDoor
export { ServerDoor as Door } from './server';

// Engines
export { GraphicsEngine } from './engines/graphics/graphics-engine';
export { BrailleCanvas, BrailleVUMeter, BrailleWaveform, BrailleSpectrum } from './engines/graphics/braille-graphics';
export { PhysicsEngine } from './engines/physics/physics-engine';
export { AudioEngine } from './engines/audio/audio-engine';
export { TrackerEngine, InterpolationFilter, PlaybackState } from './engines/audio/tracker-engine';
export type {
  TrackerConfig,
  TrackerFormat,
  ModuleMetadata,
  PlaybackPosition,
  TrackerError,
  TrackerEventType,
  TrackerEvents,
} from './engines/audio/tracker-engine';
export { NetworkEngine } from './engines/network/network-engine';
export { AIEngine } from './engines/ai/ai-engine';
export { InputEngine } from './engines/input/input-engine';

// Media - Network Quality and Adaptive Quality Management
export {
  NetworkQualityMonitor,
  AdaptiveQualityManager,
  VIDEO_QUALITY_PROFILES,
  AUDIO_QUALITY_PROFILES,
} from './media';
export type {
  NetworkMetrics,
  QualityRecommendation,
  NetworkQualityOptions,
  VideoQualityProfile,
  AudioQualityProfile,
  QualityChangeEvent,
} from './media';
export { CardEngine } from './engines/cards/card-engine';
export { PokerEngine } from './engines/poker/poker-engine';
export { TacticalCombatEngine } from './engines/tactical/tactical-combat-engine';
export { UIEngine, UIHelpers } from './engines/ui';
export * as ncurses from './engines/ui/ncurses';
export * from './utils/blessed-helpers';
export type { UIEngineOptions, WidgetStyle, MenuItem, DialogOptions, InputDialogOptions, ConfirmDialogOptions, ListSelectionOptions, StatusBarOptions } from './engines/ui';
export type {
  BackStyle,
  Card,
  CardEngineOptions,
  CardFace,
  CardSize,
  CardStyle,
  ColorMode,
  HandLayout,
  HandRenderOptions,
  RenderOptions,
  StackCard,
  StackRenderOptions,
  UnoCard,
  UnoColor,
  UnoRenderOptions,
  UnoStackCard,
  UnoValue,
} from './engines/cards/card-engine';
export type {
  Action,
  ExportOptions,
  GameState,
  HandHistory,
  Player,
  PublicState,
  Snapshot,
  TableConfig,
} from './engines/poker/poker-engine';
export {
  ActionType,
  auditChipConservation,
  calculateTotalChips,
  createPublicView,
  createSnapshot,
  exportHandHistory,
  exportMultipleHands,
  getHandHistory,
  normalizePokerCardString,
  pokerCardToCard,
  pokerCardsToCards,
  restoreFromSnapshot,
} from './engines/poker/poker-engine';

// UI Library - Blessed (full neo-blessed port without Node.js dependencies)
export * as blessed from './engines/ui/blessed/index';
export { default as Blessed } from './engines/ui/blessed/index';

// Export blessed classes and types directly for easier access
export {
  Screen,
  Element,
  Box,
  Text,
  List,
  Form,
  Textbox,
  Input,
  Textarea,
  Button,
  ProgressBar,
  Table,
  Log,
  ScrollableBox,
  ScrollableText,
  Checkbox,
  RadioButton,
  RadioSet,
  Message,
  Question,
  Prompt,
  Loading,
  Listbar,
  BigText,
  FileManager,
  Overlay,
  ListTable,
  ANSIImage,
  Terminal,
  Layout,
  PassBox,
  FileBox,
  Image,
  Viewport as BlessedViewport,
  Canvas,
  IFrame,
  Video,
  ContextMenu,
  Panel,
  DockablePanel,
  DropdownMenu,
  dropdownMenu,
  Autocomplete,
  AutocompleteTextbox,
  AutocompleteManager,
  UsernameProvider,
  BBSCodeProvider,
  WordProvider,
  TemplateProvider,
  TabPanel,
  Accordion,
  Collapsible,
  StackedGauge,
  ColorPicker as BlessedColorPicker,
  FileExplorer,
} from './engines/ui/blessed/index';

export type {
  ScreenOptions,
  ElementOptions,
  ListOptions,
  FormOptions,
  TextboxOptions,
  ButtonOptions,
  ProgressBarOptions,
  TableOptions,
  LogOptions,
  AutocompleteOptions,
  AutocompleteContext,
  AutocompleteSuggestion,
  AutocompleteProvider,
  TabPanelOptions,
  AccordionOptions,
  AccordionItem,
  CollapsibleOptions,
  StackedGaugeOptions,
  ColorPickerOptions,
  FileExplorerOptions,
} from './engines/ui/blessed/core/types';

export type { DropdownMenuOptions, DropdownMenuItem } from './engines/ui/blessed/widgets/dropdown-menu';

// Export AutocompleteTextboxOptions separately (defined in widget file, not core/types)
export type { AutocompleteTextboxOptions } from './engines/ui/blessed/widgets/autocomplete-textbox';

// ANSI Editor SDK
export { 
  ANSIUtils, 
  EditorState, 
  CursorManager, 
  Clipboard, 
  SearchManager,
  showANSIEditor,
  Viewport,
  StatusBar,
  SearchDialog,
  ColorPicker,
  Toolbar,
  AutocompleteDialog,
  KeyboardHandler
} from './engines/ui/ansi-editor/index';

export type {
  EditorSession,
  EditorOptions,
  KeyBinding,
  EditorOperation,
  ANSIToken,
  ANSITokenType,
  ANSIColor,
  ViewportInfo,
  SearchResult,
  EditorEventHandler,
  EditorEvents,
  ANSIColorName,
  ANSIColorInfo,
  ToolbarAction
} from './engines/ui/ansi-editor/index';

// Components
export { MenuSystem } from './components/menus/menu-system';
export { HUDBuilder } from './components/hud/hud-builder';
export { LevelManager } from './components/level/level-manager';
export { SaveManager } from './components/save/save-manager';
export { InventorySystem } from './components/inventory/inventory-system';
export { DialogueSystem } from './components/dialogue/dialogue-system';
export { QuestSystem } from './components/quest/quest-system';
export { ClassSystem } from './components/tactical/class-system';

// Tools
export { ReleasePacker } from './tools/packer';
export { DebugOverlay } from './tools/debug/debug-overlay';
export { runDoorWithSession } from './tools/runDoorSession';

// Version
export const SDK_VERSION = '2.0.0';

/**
 * Quick start helper - Creates a server door with sensible defaults
 * (Backward compatible)
 *
 * @param name - Door name
 * @param callback - Main door logic
 */
export function quickStart(
  name: string,
  callback: (door: any, user: any) => void | Promise<void>
): void {
  const { ServerDoor } = require('./server');

  const door = new ServerDoor({
    name,
    version: '1.0.0',
    author: 'Unknown',
  });

  door.onConnect(async (user: any) => {
    await callback(door, user);
  });

  door.start();
}
