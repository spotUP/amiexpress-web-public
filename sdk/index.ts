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
export * from './common';

// Core types (for engines) - re-export AnsiColor from core to override common version
export { AnsiColor } from './core/types';

// Server runtime (Node.js)
export { ServerDoor } from './server';

// Client runtime (Browser)
export { ClientDoor } from './client';

// Backward compatibility: Default Door is ServerDoor
export { ServerDoor as Door } from './server';

// Engines
export { GraphicsEngine } from './engines/graphics/graphics-engine';
export { PhysicsEngine } from './engines/physics/physics-engine';
export { AudioEngine } from './engines/audio/audio-engine';
export { NetworkEngine } from './engines/network/network-engine';
export { AIEngine } from './engines/ai/ai-engine';
export { InputEngine } from './engines/input/input-engine';
export { TacticalCombatEngine } from './engines/tactical/tactical-combat-engine';

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
