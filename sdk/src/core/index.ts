/**
 * AmiExpress BBS Door SDK - Core Module
 *
 * Professional SDK for building BBS doors with TypeScript
 */

// Export core classes
export { Door } from './Door';
export { Output } from './Output';
export { Input } from './Input';
export { Storage } from './Storage';

// Export all types
export type {
  // User
  User,

  // Input
  KeyPress,

  // Storage
  StorageOptions,
  SaveData,

  // Door Configuration
  DoorConfig,

  // Context
  DoorContext,

  // APIs
  OutputAPI,
  InputAPI,
  StorageAPI,
  BBSApi,

  // Lifecycle Hooks
  StartHandler,
  InputHandler,
  CloseHandler,
  ErrorHandler,

  // Internal
  RawDoorSession,
} from './types';

// Export enums (these are values, not types)
export { AnsiColor, AnsiStyle, SpecialKey } from './types';

// Export utilities
export * from '../utils/screen-utils';
