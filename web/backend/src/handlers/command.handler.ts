/**
 * Command Handler - Compatibility Layer
 *
 * This file has been refactored into a modular architecture while preserving 100% API compatibility.
 * The actual implementation has been moved to the command-handler/ directory.
 *
 * All exports are re-exported from the new modular structure to maintain backward compatibility.
 */

export * from "./command-handler/index";

// Legacy re-exports for maximum compatibility
export {
  handleCommand,
  processCommand,
  displayMainMenu,
  displayMenuPrompt,
} from "./command-handler/index";

// Constants
export const COMMAND_HANDLER_VERSION = "2.0.0";
export const COMMAND_HANDLER_MODULAR = true;

/**
 * DEPRECATION NOTICE:
 * This file now serves as a compatibility layer. The actual implementation has been moved to:
 * - web/backend/src/handlers/command-handler/core.ts (main logic)
 * - web/backend/src/handlers/command-handler/menu.ts (menu display)
 * - web/backend/src/handlers/command-handler/input-handlers.ts (input processing)
 * - web/backend/src/handlers/command-handler/command-execution.ts (command execution)
 * - web/backend/src/handlers/command-handler/types.ts (type definitions)
 *
 * For new development, import directly from:
 * import { handleCommand, displayMainMenu } from './command-handler/core';
 * import { displayMenuPrompt } from './command-handler/menu';
 * etc.
 *
 * The migration improves maintainability by breaking the 3,132-line monolithic file into focused modules.
 */
