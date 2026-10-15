/**
 * applyConfPresets (express.e:21652-21674): the account editor's 1-8, when
 * the sysop answers yes to "Preset All Conferences with Ratios & RatioType".
 * The edited account's record in every conference and message base
 * (masterLoadPointers) takes the preset's PRESET.RATIO and PRESET.RATIOTYPE,
 * each only when the preset carries it, and every record is written back at
 * once (masterSavePointers, 8661-8669 - saveConfDB for each base), not at the
 * editor's save.
 *
 * Which files: every Conf.DB getConfDbFileName names (delete-conf-access
 * confDbFiles, the same walk deleteConfAccess makes).
 */
import { confDbFiles } from './delete-conf-access';
import { deserializeConfBase, messagePointerFileManager, serializeConfBase } from './MessagePointerFileManager';
import { confPresetValues } from '../utils/new-user-preset';

/** Returns the files written. */
export function applyConfPresets(
  bbsRoot: string,
  slot: number,
  preset: Map<string, string>,
  confDbName: string = 'Conf.DB',
): string[] {
  if (!Number.isInteger(slot) || slot < 1) return [];
  const values = confPresetValues(preset);
  // An INT field: the value as the Amiga's 16 bits hold it.
  const written: string[] = [];
  for (const file of confDbFiles(bbsRoot, confDbName)) {
    const record = deserializeConfBase(messagePointerFileManager.readRawAt(file, slot));
    if (values.ratio !== undefined) record.ratio = (values.ratio << 16) >> 16;
    if (values.ratioType !== undefined) record.ratioType = (values.ratioType << 16) >> 16;
    messagePointerFileManager.writeRawAt(file, slot, serializeConfBase(record));
    written.push(file);
  }
  return written;
}
