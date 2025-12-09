/**
 * Dependency Injection Container
 *
 * Centralized container using tsyringe for managing dependencies.
 * Replaces the setter-based dependency injection pattern.
 */

import 'reflect-metadata';
import { container } from 'tsyringe';
import { ConfigManager } from './config';

// Dependency injection tokens
export const DI_TOKENS = {
  Database: Symbol.for('Database'),
  Config: Symbol.for('Config'),
  Conferences: Symbol.for('Conferences'),
  MessageBases: Symbol.for('MessageBases'),
  FileAreas: Symbol.for('FileAreas'),
  Doors: Symbol.for('Doors'),
  ProcessOlmMessageQueue: Symbol.for('ProcessOlmMessageQueue'),
  CheckSecurity: Symbol.for('CheckSecurity'),
  SetEnvStat: Symbol.for('SetEnvStat'),
  GetRecentCallerActivity: Symbol.for('GetRecentCallerActivity'),
  Constants: Symbol.for('Constants'),
} as const;

/**
 * Initialize the DI container with all dependencies
 * Called once at application startup
 */
export function initializeContainer(dependencies: {
  db: any;
  config?: ConfigManager;
  conferences?: any[];
  messageBases?: any[];
  fileAreas?: any[];
  doors?: any[];
  processOlmMessageQueue?: any;
  checkSecurity?: any;
  setEnvStat?: any;
  getRecentCallerActivity?: any;
  constants?: any;
}) {
  // Register singleton dependencies
  container.registerInstance(DI_TOKENS.Database, dependencies.db);

  // Config with lazy creation fallback
  const config = dependencies.config || new ConfigManager();
  container.registerInstance(DI_TOKENS.Config, config);

  // Register optional dependencies with defaults
  container.registerInstance(DI_TOKENS.Conferences, dependencies.conferences || []);
  container.registerInstance(DI_TOKENS.MessageBases, dependencies.messageBases || []);
  container.registerInstance(DI_TOKENS.FileAreas, dependencies.fileAreas || []);
  container.registerInstance(DI_TOKENS.Doors, dependencies.doors || []);

  // Register function dependencies
  if (dependencies.processOlmMessageQueue) {
    container.registerInstance(DI_TOKENS.ProcessOlmMessageQueue, dependencies.processOlmMessageQueue);
  }
  if (dependencies.checkSecurity) {
    container.registerInstance(DI_TOKENS.CheckSecurity, dependencies.checkSecurity);
  }
  if (dependencies.setEnvStat) {
    container.registerInstance(DI_TOKENS.SetEnvStat, dependencies.setEnvStat);
  }
  if (dependencies.getRecentCallerActivity) {
    container.registerInstance(DI_TOKENS.GetRecentCallerActivity, dependencies.getRecentCallerActivity);
  }
  if (dependencies.constants) {
    container.registerInstance(DI_TOKENS.Constants, dependencies.constants);
  }

  console.log('[DI Container] Initialized with all dependencies');
}

/**
 * Update a specific dependency (for hot-reloading scenarios)
 */
export function updateDependency<K extends keyof typeof DI_TOKENS>(
  key: K,
  value: any
) {
  container.registerInstance(DI_TOKENS[key], value);
  console.log(`[DI Container] Updated ${key}`);
}

/**
 * Get a dependency from the container
 */
export function getDependency<T>(token: symbol): T {
  return container.resolve<T>(token);
}

/**
 * Clear the container (for testing)
 */
export function clearContainer() {
  container.clearInstances();
  console.log('[DI Container] Cleared');
}

export { container };
