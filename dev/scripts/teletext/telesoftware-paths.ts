/**
 * Where extracted software goes: the board's own Beeb/software folder, the
 * same one the BEEB door lists and the emulator loads from.
 */
import * as path from 'path';
import { resolveBbsRoot } from '../../../sdk/core/settings';

export function softwareDirFor(startDir: string = __dirname): string {
  return path.join(resolveBbsRoot(startDir), 'Beeb', 'software');
}
