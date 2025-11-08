/**
 * AmiExpress BBS Door SDK - Core Exports
 *
 * Main entry point for the SDK. Import everything you need from here.
 *
 * @example
 * ```typescript
 * import {
 *   Door,
 *   GraphicsEngine,
 *   PhysicsEngine,
 *   AudioEngine,
 *   MenuSystem,
 *   HUDBuilder
 * } from '@amiexpress/sdk';
 * ```
 */

// Core
import { Door } from './door-api';
export { Door };
export * from './types';

// Engines
export { GraphicsEngine } from '../engines/graphics/graphics-engine';
export { PhysicsEngine } from '../engines/physics/physics-engine';
export { AudioEngine } from '../engines/audio/audio-engine';
export { NetworkEngine } from '../engines/network/network-engine';
export { AIEngine } from '../engines/ai/ai-engine';
export { TacticalCombatEngine } from '../engines/tactical/tactical-combat-engine';

// Components
export { MenuSystem } from '../components/menus/menu-system';
export { HUDBuilder } from '../components/hud/hud-builder';
export { LevelManager } from '../components/level/level-manager';
export { SaveManager } from '../components/save/save-manager';
export { InventorySystem } from '../components/inventory/inventory-system';
export { DialogueSystem } from '../components/dialogue/dialogue-system';
export { QuestSystem } from '../components/quest/quest-system';
export { ClassSystem } from '../components/tactical/class-system';

// Tools
export { ReleasePacker } from '../tools/packer';
export { DebugOverlay } from '../tools/debug/debug-overlay';

// Version
export const SDK_VERSION = '1.0.0';

/**
 * Quick start helper - Creates a door with sensible defaults
 *
 * @param name - Door name
 * @param callback - Main door logic
 *
 * @example
 * ```typescript
 * import { quickStart } from '@amiexpress/sdk';
 *
 * quickStart('My Game', async (door, user) => {
 *   door.send(`Welcome ${user.name}!`);
 *   // Your game logic here
 * });
 * ```
 */
export function quickStart(
  name: string,
  callback: (door: Door, user: any) => void | Promise<void>
): void {
  const door = new Door({
    name,
    version: '1.0.0',
    author: 'Unknown',
  });

  door.onConnect(async (user) => {
    await callback(door, user);
  });

  door.start();
}
