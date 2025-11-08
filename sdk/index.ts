/**
 * AmiExpress BBS Door SDK
 * Version 1.0.0
 *
 * The ultimate framework for creating next-generation BBS doors.
 *
 * @module @amiexpress/sdk
 * @author AmiExpress Team
 * @license MIT
 */

// Export everything from core
export * from './core';
export * from './core/types';
export * from './core/door-api';

// Export engines
export * from './engines/graphics/graphics-engine';
export * from './engines/physics/physics-engine';
export * from './engines/audio/audio-engine';

// Export components
export * from './components/menus/menu-system';
export * from './components/hud/hud-builder';

// Export tools
export * from './tools/packer';

// SDK info
export const SDK = {
  name: 'AmiExpress BBS Door SDK',
  version: '1.0.0',
  description: 'Revolutionary framework for creating next-generation BBS doors',
  author: 'AmiExpress Team',
  license: 'MIT',
  repository: 'https://github.com/amiexpress/sdk',
  documentation: 'https://docs.amiexpress.com/sdk'
};
