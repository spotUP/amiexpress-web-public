/**
 * dos/ - Modular dos.library implementation
 *
 * This module provides a clean, modular implementation of Amiga dos.library
 * functionality split into logical components:
 *
 * - dos-types.ts: Type definitions, interfaces, and constants
 * - dos-path-resolver.ts: Amiga to native path resolution
 * - dos-readargs.ts: ReadArgs command-line parsing
 * - dos-env-manager.ts: Environment variable management
 *
 * Usage:
 * ```typescript
 * import {
 *   MODE_OLDFILE,
 *   DOS_ERRORS,
 *   DosPathResolver,
 *   ReadArgsParser,
 *   DosEnvManager,
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

// ReadArgs Parsing
export { ReadArgsParser } from './dos-readargs';

// Environment Variables
export { DosEnvManager } from './dos-env-manager';
