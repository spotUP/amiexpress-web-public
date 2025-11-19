/**
 * Command Handler - Main Entry Point
 * Central command router and menu system
 * This module preserves the original API surface while using a modular architecture
 */

// Import specific functions from core module
import { handleCommand as coreHandleCommand } from "./core";
import { processCommand as coreProcessCommand } from "./core";
import { runSysCommand as coreRunSysCommand } from "./core";
import { runBbsCommand as coreRunBbsCommand } from "./core";
import { setDatabase as coreSetDatabase } from "./core";
import { setConfig as coreSetConfig } from "./core";
import { setConferences as coreSetConferences } from "./core";
import { setMessageBases as coreSetMessageBases } from "./core";
import { setFileAreas as coreSetFileAreas } from "./core";
import { setProcessOlmMessageQueue as coreSetProcessOlmMessageQueue } from "./core";
import { setCheckSecurity as coreSetCheckSecurity } from "./core";
import { setSetEnvStat as coreSetSetEnvStat } from "./core";
import { setGetRecentCallerActivity as coreSetGetRecentCallerActivity } from "./core";
import { setDoors as coreSetDoors } from "./core";
import { setConstants as coreSetConstants } from "./core";

// Import specific functions from menu module
import { displayMainMenu as menuDisplayMainMenu } from "./menu";
import { displayMenuPrompt as menuDisplayMenuPrompt } from "./menu";

// Import specific functions from input handlers module
import { handleSpecializedInput as inputHandleSpecializedInput } from "./input-handlers";
import { handleSysopMenuInput as inputHandleSysopMenuInput } from "./input-handlers";

// Import specific functions from command execution module
import { processBBSCommand as cmdExecProcessBBSCommand } from "./command-execution";

// Re-export types
export {
  BBSSession,
  BBSState,
  LoggedOnSubState,
  ACSCode,
  EnvStat,
  CommandHandler,
  InputHandler,
  MenuDisplayHandler,
  CommandResult,
  MenuConfig,
  UploadBatchItem,
  CommandContext,
  InputBufferState,
  CommandSessionData,
} from "./types";

// Re-export command execution functions (from command-execution.handler)
export {
  loadCommands,
  setCommandExecutionDependencies,
} from "../command-execution.handler";

// Re-export utility functions that are commonly used
export { AnsiUtil } from "../../utils/ansi.util";

// Main exports - these preserve the original API surface
export const handleCommand = coreHandleCommand;
export const processCommand = coreProcessCommand;
export const runSysCommand = coreRunSysCommand;
export const runBbsCommand = coreRunBbsCommand;
export const displayMainMenu = menuDisplayMainMenu;
export const displayMenuPrompt = menuDisplayMenuPrompt;
export const processBBSCommand = cmdExecProcessBBSCommand;
export const handleSpecializedInput = inputHandleSpecializedInput;

// Dependency injection setters
export const setDatabase = coreSetDatabase;
export const setConfig = coreSetConfig;
export const setConferences = coreSetConferences;
export const setMessageBases = coreSetMessageBases;
export const setFileAreas = coreSetFileAreas;
export const setProcessOlmMessageQueue = coreSetProcessOlmMessageQueue;
export const setCheckSecurity = coreSetCheckSecurity;
export const setSetEnvStat = coreSetSetEnvStat;
export const setGetRecentCallerActivity = coreSetGetRecentCallerActivity;
export const setDoors = coreSetDoors;
export const setConstants = coreSetConstants;

// Constants
export const COMMAND_HANDLER_VERSION = "2.0.0";
export const COMMAND_HANDLER_MODULAR = true;
export const DEFAULT_MENU_SCREEN = "MENU";

// Utility function to check if running in modular mode
export function isModularMode(): boolean {
  return true; // Always true now
}

// Handler registration function - maintains compatibility with existing code
export function registerCommandHandlers(doorSystem: any) {
  // Set all dependencies from the door system
  const deps = {
    db: doorSystem.getDatabase(),
    config: doorSystem.getConfig(),
    conferences: doorSystem.getConferences(),
    messageBases: doorSystem.getMessageBases(),
    fileAreas: doorSystem.getFileAreas(),
    processOlmMessageQueue: doorSystem.getProcessOlmMessageQueue(),
    checkSecurity: doorSystem.getCheckSecurity(),
    setEnvStat: doorSystem.getSetEnvStat(),
    getRecentCallerActivity: doorSystem.getGetRecentCallerActivity(),
    doors: doorSystem.getDoors(),
    constants: doorSystem.getConstants(),
  };

  // Set core dependencies
  coreSetDatabase(deps.db);
  coreSetConfig(deps.config);
  coreSetConferences(deps.conferences);
  coreSetMessageBases(deps.messageBases);
  coreSetFileAreas(deps.fileAreas);
  coreSetProcessOlmMessageQueue(deps.processOlmMessageQueue);
  coreSetCheckSecurity(deps.checkSecurity);
  coreSetSetEnvStat(deps.setEnvStat);
  coreSetGetRecentCallerActivity(deps.getRecentCallerActivity);
  coreSetDoors(deps.doors);
  coreSetConstants(deps.constants);

  // Set menu dependencies
  const { setMenuDependencies } = require("./menu");
  setMenuDependencies({
    db: deps.db,
    config: deps.config,
    conferences: deps.conferences,
    messageBases: deps.messageBases,
    processOlmMessageQueue: deps.processOlmMessageQueue,
    SCREEN_MENU: deps.constants.SCREEN_MENU,
  });

  // Set command execution dependencies
  const {
    setCommandExecutionDatabase,
    setCommandExecutionConferences,
    setCommandExecutionFileAreas,
    setCommandExecutionDoors,
  } = require("./command-execution");
  setCommandExecutionDatabase(deps.db);
  setCommandExecutionConferences(deps.conferences);
  setCommandExecutionFileAreas(deps.fileAreas);
  setCommandExecutionDoors(deps.doors);

  // Also set dependencies for other modules
  if (doorSystem.setUserCommandsDependencies) {
    doorSystem.setUserCommandsDependencies({
      db: deps.db,
      config: deps.config,
      conferences: deps.conferences,
      fileAreas: deps.fileAreas,
      checkSecurity: deps.checkSecurity,
    });
  }

  if (doorSystem.setSystemCommandsDependencies) {
    doorSystem.setSystemCommandsDependencies({
      db: deps.db,
      config: deps.config,
      conferences: deps.conferences,
      fileAreas: deps.fileAreas,
      checkSecurity: deps.checkSecurity,
    });
  }

  if (doorSystem.setFileMaintenanceDependencies) {
    doorSystem.setFileMaintenanceDependencies({
      db: deps.db,
      config: deps.config,
      fileAreas: deps.fileAreas,
      checkSecurity: deps.checkSecurity,
    });
  }

  if (doorSystem.setCommandExecutionDependencies) {
    doorSystem.setCommandExecutionDependencies({
      db: deps.db,
      conferences: deps.conferences,
      fileAreas: deps.fileAreas,
      doors: deps.doors,
      checkSecurity: deps.checkSecurity,
    });
  }

  console.log("✅ Command handlers registered successfully");
}

// Migration helper for existing code
export function migrateToModularHandler() {
  console.log("📝 Migrating to modular command handler architecture");

  // This function helps migrate existing code that depends on the old monolithic handler
  return {
    handleCommand: handleCommand,
    processCommand: processCommand,
    displayMainMenu: displayMainMenu,
    displayMenuPrompt: displayMenuPrompt,
    processBBSCommand: processBBSCommand,
    handleSpecializedInput: handleSpecializedInput,
  };
}
