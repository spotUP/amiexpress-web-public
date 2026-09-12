/**
 * The door catalog, on its own.
 *
 * A door importing the catalog must not drag the whole SDK in with it: the
 * package root re-exports the server bundle, which reaches the audio engine
 * and Tone.js. This file is what `@amiexpress/bbs-door-sdk/catalog`
 * resolves to - the package's `exports` map points node at its build, and
 * TypeScript's node resolution finds this source file at the same subpath,
 * so the compiler and the runtime agree on which module that import means.
 */
export {
  parseTooltypes,
  scanRegistry,
  readRegistryEntry,
  joinCatalog,
  loadDoorCatalog,
  nodeCatalogIO,
  PORT_MARKERS,
} from './core/door-catalog';
export type {
  CatalogEntry,
  CatalogIO,
  RawRegistryEntry,
  JoinOptions,
} from './core/door-catalog';
