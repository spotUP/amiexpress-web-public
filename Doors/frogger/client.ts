/**
 * Frogger - Client Entry Point (Browser with Audio)
 * 1981 Konami arcade game port for AmiExpress BBS
 */

// Client bundle for hybrid door mode
// This file is bundled and served to browser clients
// Provides audio support via Tone.js AudioEngine

export { rpcHandlers } from './server';
export { default } from './index';

// Note: In full hybrid mode, this would import AudioEngine
// and provide sound effects. For now, uses the same logic
// as the fallback server door.
