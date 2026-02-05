/**
 * Dependency Injection (DI Container Adapter)
 *
 * This module provides backward-compatible getters/setters that delegate to
 * the tsyringe DI container. This allows gradual migration of handlers to
 * constructor injection without breaking existing code.
 *
 * MIGRATION PATH:
 * 1. Old code: Uses getDatabase(), getConfig(), etc. (works via container)
 * 2. New code: Uses @inject() decorators + constructor injection
 * 3. Future: Remove this file once all handlers use constructor injection
 */

import { ConfigManager } from '../../config';
import { container, DI_TOKENS } from '../../container';

// ============================================================================
// GETTERS - Delegate to DI container
// ============================================================================

export function getDatabase(): any {
  return container.resolve(DI_TOKENS.Database);
}

export function getConfig(): any {
  try {
    return container.resolve(DI_TOKENS.Config);
  } catch {
    // Lazy-create fallback for early initialization
    const config = new ConfigManager();
    container.registerInstance(DI_TOKENS.Config, config);
    return config;
  }
}

export function getConferences(): any[] {
  try {
    return container.resolve(DI_TOKENS.Conferences) as any[];
  } catch {
    // Return empty array if not yet initialized
    return [];
  }
}

export function getMessageBases(): any[] {
  try {
    return container.resolve(DI_TOKENS.MessageBases) as any[];
  } catch {
    // Return empty array if not yet initialized
    return [];
  }
}

export function getFileAreas(): any[] {
  try {
    return container.resolve(DI_TOKENS.FileAreas) as any[];
  } catch {
    // Return empty array if not yet initialized
    return [];
  }
}

export function getDoors(): any[] {
  try {
    return container.resolve(DI_TOKENS.Doors) as any[];
  } catch {
    // Return empty array if not yet initialized
    return [];
  }
}

export function getProcessOlmMessageQueue() {
  try {
    return container.resolve(DI_TOKENS.ProcessOlmMessageQueue);
  } catch {
    return undefined;
  }
}

export function getCheckSecurity() {
  try {
    return container.resolve(DI_TOKENS.CheckSecurity);
  } catch {
    return undefined;
  }
}

export function getSetEnvStat() {
  try {
    return container.resolve(DI_TOKENS.SetEnvStat);
  } catch {
    return undefined;
  }
}

export function getGetRecentCallerActivity() {
  try {
    return container.resolve(DI_TOKENS.GetRecentCallerActivity);
  } catch {
    return undefined;
  }
}

export function getScreenMenu(): string {
  try {
    const constants = container.resolve(DI_TOKENS.Constants) as any;
    return constants?.SCREEN_MENU || 'MENU';
  } catch {
    return 'MENU';
  }
}

// ============================================================================
// SETTERS - Update DI container (backward compatibility)
// ============================================================================

export function setDatabase(database: any) {
  container.registerInstance(DI_TOKENS.Database, database);
}

export function setConfig(cfg: any) {
  container.registerInstance(DI_TOKENS.Config, cfg);
}

export function setConferences(confs: any[]) {
  container.registerInstance(DI_TOKENS.Conferences, confs);
}

export function setMessageBases(bases: any[]) {
  container.registerInstance(DI_TOKENS.MessageBases, bases);
}

export function setFileAreas(areas: any[]) {
  container.registerInstance(DI_TOKENS.FileAreas, areas);
}

export function setDoors(doorsList: any[]) {
  container.registerInstance(DI_TOKENS.Doors, doorsList);
}

export function setProcessOlmMessageQueue(fn: any) {
console.log('[DI] setProcessOlmMessageQueue called, fn type:', typeof fn);
  container.registerInstance(DI_TOKENS.ProcessOlmMessageQueue, fn);
console.log('[DI] processOlmMessageQueue registered in container');
}

export function setCheckSecurity(fn: any) {
  container.registerInstance(DI_TOKENS.CheckSecurity, fn);
}

export function setSetEnvStat(fn: any) {
  container.registerInstance(DI_TOKENS.SetEnvStat, fn);
}

export function setGetRecentCallerActivity(fn: any) {
  container.registerInstance(DI_TOKENS.GetRecentCallerActivity, fn);
}

export function setConstants(constants: any) {
  container.registerInstance(DI_TOKENS.Constants, constants);
}
