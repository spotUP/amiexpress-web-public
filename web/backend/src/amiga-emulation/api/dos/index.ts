/**
 * dos/ - Modular dos.library implementation
 *
 * This module provides a clean, modular implementation of Amiga dos.library
 * functionality split into logical components:
 *
 * - dos-types.ts: Type definitions, interfaces, and constants
 * - dos-path-resolver.ts: Amiga to native path resolution
 *
 * Usage:
 * ```typescript
 * import {
 *   MODE_OLDFILE,
 *   DOS_ERRORS,
 *   DosPathResolver,
 * } from './dos';
 * ```
 *
 * @module dos
 */

// Types and Constants
export * from './dos-types';

// Path Resolution
export { DosPathResolver, dosPathResolver } from './dos-path-resolver';
export type { PathResolverConfig } from './dos-path-resolver';

