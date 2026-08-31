/**
 * Screen Type Configuration Service
 * Handles screen type configuration (ScreenTypes.info / TOOLTYPE_SCREENTYPES)
 */

import type { Database } from '../../database';
import { getSystemTime } from '../../utils/date-time.util';
import type { ConfigRepository } from '../../database/config-repository';
import type { ScreenType } from '../../database/types';
import { ScreenTypeSchema, type RequestContext } from '../config.schemas';
import { applyTooltypes, readTooltypeMap } from '../../utils/info-file.util';
import { config as appConfig } from '../../config';
import { mergeForWrite } from './config-merge.util';
import * as fs from 'fs';
import * as path from 'path';

export class ScreenConfigService {
  private configRepo: ConfigRepository;

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
  }

  async getAllScreenTypes(): Promise<ScreenType[]> {
    const bbsRoot = appConfig.get('dataDir');
    const screenTypesPath = path.join(bbsRoot, 'ScreenTypes.info');

    if (!fs.existsSync(screenTypesPath)) {
console.warn('[ScreenConfigService] ScreenTypes.info not found');
      return this.configRepo.getAllScreenTypes();
    }

    try {
      const stats = fs.statSync(screenTypesPath);
      const toolTypes = readTooltypeMap(screenTypesPath);

      const screenTypes: ScreenType[] = [];
      let typeNum = 1;

      while (true) {
        const type = toolTypes.get(`TYPE.${typeNum}`);
        const title = toolTypes.get(`TITLE.${typeNum}`);

        if (!type && !title) break;

        if (type && title) {
          screenTypes.push({
            id: typeNum,
            screen_number: typeNum,
            screen_type: type,
            screen_title: title,
            enabled: true,
            created_at: stats.birthtime,
            updated_at: stats.mtime
          });
        }

        typeNum++;
        if (typeNum > 50) break;
      }

console.log(`[ScreenConfigService] Loaded ${screenTypes.length} screen types`);
      return screenTypes;
    } catch (error) {
console.error('[ScreenConfigService] Error reading ScreenTypes.info:', error);
      return this.configRepo.getAllScreenTypes();
    }
  }

  /**
   * Resolve the screen type the admin is pointing at.
   *
   * The list this id came from is the one on DISK, where the id is the entry's
   * position. Looking that number up as a database rowid is a different
   * namespace: with the table empty every edit throws "not found", and with
   * the table partly filled it edits a DIFFERENT record. Disk first, mirror as
   * the fallback - the same resolution ComputerConfigService.getComputerType
   * uses, and the same fault the doors page had.
   */
async getScreenType(id: number): Promise<ScreenType | null> {
    const onDisk = await this.getAllScreenTypes();
    const fromDisk = onDisk.find(t => t.id === id);
    if (fromDisk) return fromDisk;

    return this.configRepo.getScreenTypeById(id);
  }

  async createScreenType(
    screenType: Omit<ScreenType, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<ScreenType> {
    const validated = ScreenTypeSchema.parse(screenType);

    const id = this.configRepo.createScreenType({
      screen_number: validated.screen_number,
      screen_type: validated.screen_type,
      screen_title: validated.screen_title,
      enabled: validated.enabled ?? true
    });

    // Built from what was just validated, not read back through
    // getScreenType - that reads the MIRROR, where this id belongs to some
    // other screen type.
    const now = getSystemTime();
    const newType: ScreenType = {
      id,
      screen_number: validated.screen_number,
      screen_type: validated.screen_type,
      screen_title: validated.screen_title,
      enabled: validated.enabled ?? true,
      created_at: now,
      updated_at: now
    };

    await this.writeScreenTypesInfoFile({ entry: newType });
    this.configRepo.logConfigChange('screen_types', id, 'CREATE',
      context.userId, context.username, undefined, newType,
      context.ipAddress, context.userAgent);

    return newType;
  }

  async updateScreenType(
    id: number,
    updates: Partial<ScreenType>,
    context: RequestContext
  ): Promise<ScreenType> {
    const validated = ScreenTypeSchema.partial().parse(updates);
    const oldType = await this.getScreenType(id);
    if (!oldType) throw new Error(`Screen type ${id} not found`);

    // The mirror is updated best-effort. It holds no row for a screen type
    // that only exists on disk, and that must not stop the edit from reaching
    // ScreenTypes.info, which is what the BBS reads.
    this.configRepo.updateScreenType(id, validated);

    const newType: ScreenType = {
      ...oldType,
      ...validated,
      updated_at: getSystemTime()
    };

    // A renamed screen type is still on disk under its old name, so name the
    // rename or the merge keeps the old entry and appends the new one.
    await this.writeScreenTypesInfoFile({
      entry: newType,
      ...(newType.screen_type !== oldType.screen_type
        ? { rename: { from: oldType.screen_type, to: newType.screen_type } }
        : {})
    });
    this.configRepo.logConfigChange('screen_types', id, 'UPDATE',
      context.userId, context.username, oldType, newType,
      context.ipAddress, context.userAgent);

    return newType;
  }

  async deleteScreenType(id: number, context: RequestContext): Promise<boolean> {
    const oldType = await this.getScreenType(id);
    if (!oldType) return false;

    const deleted = this.configRepo.deleteScreenType(id);
    await this.writeScreenTypesInfoFile({ remove: oldType.screen_type });

    if (deleted) {
      this.configRepo.logConfigChange('screen_types', id, 'DELETE',
        context.userId, context.username, oldType, undefined,
        context.ipAddress, context.userAgent);
    }

    return deleted;
  }

  /**
   * Rewrite ScreenTypes.info.
   *
   * `removeType` names an entry being deleted, because the merge starts from
   * DISK and disk still has it.
   */
  private async writeScreenTypesInfoFile(
    change: { entry?: ScreenType; remove?: string; rename?: { from: string; to: string } } = {}
  ): Promise<void> {
    const bbsRoot = appConfig.get('dataDir');
    const screenTypesPath = path.join(bbsRoot, 'ScreenTypes.info');

    try {
      // Disk first. This used to rebuild the file from
      // configRepo.getAllScreenTypes() alone - and on the live site that table
      // holds ZERO rows against two entries on disk, so saving one screen type
      // erased both. The database is a mirror; a mirror that has fallen behind
      // must not truncate what it mirrors.
      // ONLY the caller's entry. Passing the whole mirror let it overwrite and
      // append as well as protect - and this table holds four rows against two
      // entries on disk, so every save edited the wrong record.
      const onDisk = await this.getAllScreenTypes();
      const screenTypes = mergeForWrite(
        onDisk,
        change.entry ? [change.entry] : [],
        (t: ScreenType) => String(t.screen_type ?? ''),
        {
          remove: change.remove ? [change.remove] : [],
          ...(change.rename ? { rename: change.rename } : {})
        }
      );

      const toolTypes = new Map<string, string>();
      let typeNum = 0;

      for (const screenType of screenTypes) {
        if (screenType.enabled !== false) {
          typeNum++;
          toolTypes.set(`TYPE.${typeNum}`, screenType.screen_type);
          toolTypes.set(`TITLE.${typeNum}`, screenType.screen_title);
        }
      }

      applyTooltypes(screenTypesPath, toolTypes, {
        removeKeys: key => /^(TYPE|TITLE)\.\d+$/.test(key),
      });

console.log(`[ScreenConfigService] Wrote ${screenTypesPath} with ${typeNum} types`);
    } catch (error) {
console.error(`[ScreenConfigService] Failed to write ${screenTypesPath}:`, error);
    }
  }
}
