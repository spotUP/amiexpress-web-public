/**
 * The settings reader, on its own.
 *
 * A door importing settings must not drag the whole SDK in with them: the
 * package root re-exports the server bundle, which reaches the audio engine
 * and Tone.js. This file is what `@amiexpress/bbs-door-sdk/settings` resolves
 * to - the package's `exports` map points node at its build, and TypeScript's
 * node resolution finds this source file at the same subpath, so the compiler
 * and the runtime agree on which module that import means.
 */
export {
  readDoorSettings,
  readDoorSettingOverrides,
  readManifest,
  readValues,
  resolveDoorRoot,
  resolveBbsRoot,
  DoorSettingsError,
  MANIFEST_FILE,
  VALUES_FILE,
} from './core/settings';
export type { DoorSetting, DoorSettingsManifest, DoorSettingValues } from './core/types';
