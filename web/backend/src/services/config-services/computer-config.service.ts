/**
 * Computer Type Configuration Service
 * Handles computer type configuration (ComputerList.info / TOOLTYPE_COMPUTERLIST)
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';
import type { ComputerType } from '../../database/types';
import { ComputerTypeSchema, type RequestContext } from '../config.schemas';
import { InfoFileParser } from '../info-file-parser';
import { config as appConfig } from '../../config';
import { mergeForWrite } from './config-merge.util';
import * as fs from 'fs';
import * as path from 'path';

export class ComputerConfigService {
  private configRepo: ConfigRepository;

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
  }

  async getAllComputerTypes(): Promise<ComputerType[]> {
    const bbsRoot = appConfig.get('dataDir');
    const computerListPath = path.join(bbsRoot, 'ComputerList.info');

    if (!fs.existsSync(computerListPath)) {
console.warn('[ComputerConfigService] ComputerList.info not found');
      return this.configRepo.getAllComputerTypes();
    }

    try {
      const buffer = fs.readFileSync(computerListPath);
      const stats = fs.statSync(computerListPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        toolTypes.set(key.toUpperCase(), value);
      }

      const computers: ComputerType[] = [];
      const computerCount = parseInt(toolTypes.get('COMPUTER.NUM') || '0', 10);

      for (let i = 1; i <= computerCount; i++) {
        const computerName = toolTypes.get(`COMPUTER.${i}`);
        if (computerName) {
          computers.push({
            id: i,
            computer_number: i,
            computer_name: computerName,
            enabled: true,
            created_at: stats.birthtime,
            updated_at: stats.mtime
          });
        }
      }

console.log(`[ComputerConfigService] Loaded ${computers.length} computer types`);
      return computers;
    } catch (error) {
console.error('[ComputerConfigService] Error reading ComputerList.info:', error);
      return this.configRepo.getAllComputerTypes();
    }
  }

  async getComputerType(id: number): Promise<ComputerType | null> {
    return this.configRepo.getComputerTypeById(id);
  }

  async createComputerType(
    computerType: Omit<ComputerType, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<ComputerType> {
    const validated = ComputerTypeSchema.parse(computerType);

    const id = this.configRepo.createComputerType({
      computer_number: validated.computer_number,
      computer_name: validated.computer_name,
      enabled: validated.enabled ?? true
    });

    const newType = await this.getComputerType(id);
    if (!newType) throw new Error('Failed to create computer type');

    await this.writeComputerListInfoFile({ entry: newType });
    this.configRepo.logConfigChange('computer_types', id, 'CREATE',
      context.userId, context.username, undefined, newType, 
      context.ipAddress, context.userAgent);

    return newType;
  }

  async updateComputerType(
    id: number,
    updates: Partial<ComputerType>,
    context: RequestContext
  ): Promise<ComputerType> {
    const validated = ComputerTypeSchema.partial().parse(updates);
    const oldType = await this.getComputerType(id);
    if (!oldType) throw new Error(`Computer type ${id} not found`);

    const success = this.configRepo.updateComputerType(id, validated);
    if (!success) throw new Error(`Failed to update computer type ${id}`);

    const newType = await this.getComputerType(id);
    if (!newType) throw new Error('Failed to retrieve updated computer type');

    // The change itself is what gets merged over disk - not the database's
    // copy of it. A renamed computer is still on disk under its old name, so
    // name the rename or the merge keeps the old entry and appends the new one.
    await this.writeComputerListInfoFile({
      entry: newType,
      ...(newType.computer_name !== oldType.computer_name
        ? { rename: { from: oldType.computer_name, to: newType.computer_name } }
        : {})
    });
    this.configRepo.logConfigChange('computer_types', id, 'UPDATE',
      context.userId, context.username, oldType, newType,
      context.ipAddress, context.userAgent);

    return newType;
  }

  async deleteComputerType(id: number, context: RequestContext): Promise<boolean> {
    const oldType = await this.getComputerType(id);
    if (!oldType) return false;

    const deleted = this.configRepo.deleteComputerType(id);
    await this.writeComputerListInfoFile({ remove: oldType.computer_name });

    if (deleted) {
      this.configRepo.logConfigChange('computer_types', id, 'DELETE',
        context.userId, context.username, oldType, undefined,
        context.ipAddress, context.userAgent);
    }

    return deleted;
  }

  /**
   * Rewrite ComputerList.info.
   *
   * `change` describes what the caller just did: `entry` is the created or
   * edited computer, `remove` a deletion, `rename` an edit that changed the
   * computer name, which is the key this file is merged on. All three are
   * needed because the merge starts from a DISK that still holds the old shape.
   */
  private async writeComputerListInfoFile(
    change: { entry?: ComputerType; remove?: string; rename?: { from: string; to: string } } = {}
  ): Promise<void> {
    const bbsRoot = appConfig.get('dataDir');
    const computerListPath = path.join(bbsRoot, 'ComputerList.info');

    try {
      // Disk first. This used to rebuild the file from
      // configRepo.getAllComputerTypes() alone, while the page reads its list
      // from ComputerList.info - so with a stale or empty computer_types table,
      // saving one computer erased every computer that only existed on disk.
      // The database is a mirror; a mirror that has fallen behind must not
      // truncate what it mirrors.
      const onDisk = await this.getAllComputerTypes();
      const fromDb = this.configRepo.getAllComputerTypes();
      // The caller's entry goes last so it wins over a stale mirror row.
      const changed = change.entry ? [...fromDb, change.entry] : fromDb;
      const computers = mergeForWrite(
        onDisk,
        changed,
        (c: ComputerType) => String(c.computer_name ?? ''),
        {
          remove: change.remove ? [change.remove] : [],
          ...(change.rename ? { rename: change.rename } : {})
        }
      );

      const toolTypes = new Map<string, string>();
      let computerNum = 0;

      for (const computer of computers) {
        if (computer.enabled !== false) {
          computerNum++;
          toolTypes.set(`COMPUTER.${computerNum}`, computer.computer_name);
        }
      }

      toolTypes.set('COMPUTER.NUM', computerNum.toString());

      const parser = new InfoFileParser();
      const infoData = parser.write(toolTypes);
      fs.writeFileSync(computerListPath, infoData);

console.log(`[ComputerConfigService] Wrote ${computerListPath} with ${computerNum} types`);
    } catch (error) {
console.error(`[ComputerConfigService] Failed to write ${computerListPath}:`, error);
    }
  }
}
