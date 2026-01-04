/**
 * Screen Type Configuration Service
 * Handles screen type configuration (ScreenTypes.info / TOOLTYPE_SCREENTYPES)
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';
import type { ScreenType } from '../../database/types';
import { ScreenTypeSchema, type RequestContext } from '../config.schemas';
import { InfoFileParser } from '../info-file-parser';
import { config as appConfig } from '../../config';
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
      const buffer = fs.readFileSync(screenTypesPath);
      const stats = fs.statSync(screenTypesPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        toolTypes.set(key.toUpperCase(), value);
      }

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

  async getScreenType(id: number): Promise<ScreenType | null> {
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

    const newType = await this.getScreenType(id);
    if (!newType) throw new Error('Failed to create screen type');

    this.writeScreenTypesInfoFile();
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

    const success = this.configRepo.updateScreenType(id, validated);
    if (!success) throw new Error(`Failed to update screen type ${id}`);

    const newType = await this.getScreenType(id);
    if (!newType) throw new Error('Failed to retrieve updated screen type');

    this.writeScreenTypesInfoFile();
    this.configRepo.logConfigChange('screen_types', id, 'UPDATE',
      context.userId, context.username, oldType, newType,
      context.ipAddress, context.userAgent);

    return newType;
  }

  async deleteScreenType(id: number, context: RequestContext): Promise<boolean> {
    const oldType = await this.getScreenType(id);
    if (!oldType) return false;

    const deleted = this.configRepo.deleteScreenType(id);
    this.writeScreenTypesInfoFile();

    if (deleted) {
      this.configRepo.logConfigChange('screen_types', id, 'DELETE',
        context.userId, context.username, oldType, undefined,
        context.ipAddress, context.userAgent);
    }

    return deleted;
  }

  private writeScreenTypesInfoFile(): void {
    const bbsRoot = appConfig.get('dataDir');
    const screenTypesPath = path.join(bbsRoot, 'ScreenTypes.info');

    try {
      const screenTypes = this.configRepo.getAllScreenTypes();
      const toolTypes = new Map<string, string>();
      let typeNum = 0;

      for (const screenType of screenTypes) {
        if (screenType.enabled !== false) {
          typeNum++;
          toolTypes.set(`TYPE.${typeNum}`, screenType.screen_type);
          toolTypes.set(`TITLE.${typeNum}`, screenType.screen_title);
        }
      }

      const parser = new InfoFileParser();
      const infoData = parser.write(toolTypes);
      fs.writeFileSync(screenTypesPath, infoData);

console.log(`[ScreenConfigService] Wrote ${screenTypesPath} with ${typeNum} types`);
    } catch (error) {
console.error(`[ScreenConfigService] Failed to write ${screenTypesPath}:`, error);
    }
  }
}
