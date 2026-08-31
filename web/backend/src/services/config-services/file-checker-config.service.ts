/**
 * File Checker Configuration Service
 * Handles file checker/virus scanner configuration (Fcheck/*.info)
 */

import type { Database } from '../../database';
import { getSystemTime } from '../../utils/date-time.util';
import type { ConfigRepository } from '../../database/config-repository';
import type { FileChecker, FileCheckerError } from '../../database/types';
import { FileCheckerSchema, FileCheckerErrorSchema, type RequestContext } from '../config.schemas';
import { applyTooltypes, moveInfoFile, parseInfoBuffer, resolveDirectory, tooltypeMap } from '../../utils/info-file.util';
import { config as appConfig } from '../../config';
import * as fs from 'fs';
import * as path from 'path';
import { fileCache } from '../../utils/file-cache.util';

export class FileCheckerConfigService {
  private configRepo: ConfigRepository;

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
  }

  async getAllFileCheckers(): Promise<FileChecker[]> {
    const bbsRoot = appConfig.get('dataDir');
    const fcheckDir = resolveDirectory(bbsRoot, 'Fcheck');

    if (!fs.existsSync(fcheckDir)) {
console.warn('[FileCheckerConfigService] Fcheck/ directory not found');
      return this.configRepo.getAllFileCheckers();
    }

    try {
      const fileCheckers: FileChecker[] = [];
      const files = fs.readdirSync(fcheckDir);
      const infoFiles = files.filter(f => f.endsWith('.info'));

      let checkerId = 1;
      for (const infoFile of infoFiles) {
        const infoPath = path.join(fcheckDir, infoFile);
        // Use file cache for better performance (70-90% reduction in disk I/O)
        const stats = fs.statSync(infoPath);
        const toolTypes = tooltypeMap(parseInfoBuffer(fileCache.readBuffer(infoPath), infoPath));
        // AmiExpress writes some checker keys with a '&' prefix; the reader has
        // always accepted both spellings.
        for (const [key, value] of [...toolTypes]) {
          if (key.startsWith('&')) toolTypes.set(key.substring(1), value);
        }

        let checkerPath = toolTypes.get('CHECKER') || '';
        if (!checkerPath) {
          continue;
        }

        const checkerName = path.basename(infoFile, '.info');
        const options = toolTypes.get('OPTIONS') || toolTypes.get('SOPTIONS') || '';

        const stackStr = toolTypes.get('STACK');
        let stackSize = 4096;
        if (stackStr && stackStr !== 'SAME') {
          const parsedStack = parseInt(stackStr, 10);
          if (!isNaN(parsedStack)) {
            stackSize = parsedStack;
          }
        }

        const priorityStr = toolTypes.get('PRIORITY');
        let priority = 0;
        if (priorityStr) {
          const parsedPriority = parseInt(priorityStr, 10);
          if (!isNaN(parsedPriority)) {
            priority = parsedPriority;
          }
        }

        const scriptPath = toolTypes.get('SCRIPT') || '';

        fileCheckers.push({
          id: checkerId++,
          checker_name: checkerName,
          checker_path: checkerPath,
          options: options,
          stack_size: stackSize,
          priority: priority,
          script_path: scriptPath,
          enabled: true,
          created_at: stats.birthtime,
          updated_at: stats.mtime
        });
      }

console.log(`[FileCheckerConfigService] Loaded ${fileCheckers.length} file checkers`);
      return fileCheckers;
    } catch (error) {
console.error('[FileCheckerConfigService] Error reading Fcheck/ directory:', error);
      return this.configRepo.getAllFileCheckers();
    }
  }

  /**
   * Resolve the file checker the admin is pointing at.
   *
   * The list this id came from is the one on DISK, where the id is the entry's
   * position. Looking that number up as a database rowid is a different
   * namespace: with the table empty every edit throws "not found", and with
   * the table partly filled it edits a DIFFERENT record. Disk first, mirror as
   * the fallback - the same resolution ComputerConfigService.getComputerType
   * uses, and the same fault the doors page had.
   */
async getFileChecker(id: number): Promise<FileChecker | null> {
    const onDisk = await this.getAllFileCheckers();
    const fromDisk = onDisk.find(c => c.id === id);
    if (fromDisk) return fromDisk;

    return this.configRepo.getFileCheckerById(id);
  }

  async createFileChecker(
    checker: Omit<FileChecker, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<FileChecker> {
    const validated = FileCheckerSchema.parse(checker);

    const createData: any = {
      checker_name: validated.checker_name,
      checker_path: validated.checker_path,
      enabled: validated.enabled ?? true
    };

    if (validated.options !== undefined) createData.options = validated.options;
    if (validated.stack_size !== undefined) createData.stack_size = validated.stack_size;
    if (validated.priority !== undefined) createData.priority = validated.priority;
    if (validated.script_path !== undefined) createData.script_path = validated.script_path;

    const id = this.configRepo.createFileChecker(createData);

    const newChecker = await this.getFileChecker(id);
    if (!newChecker) throw new Error('Failed to create file checker');

    this.writeFileCheckerInfoFile(newChecker);

    this.configRepo.logConfigChange('file_checkers', id, 'CREATE',
      context.userId, context.username, undefined, newChecker,
      context.ipAddress, context.userAgent);

    return newChecker;
  }

  async updateFileChecker(
    id: number,
    updates: Partial<FileChecker>,
    context: RequestContext
  ): Promise<FileChecker> {
    const validated = FileCheckerSchema.partial().parse(updates);
    const oldChecker = await this.getFileChecker(id);
    if (!oldChecker) throw new Error(`File checker ${id} not found`);

    if (validated.checker_name && validated.checker_name !== oldChecker.checker_name) {
      // MOVE the icon; deleting it and letting writeFileCheckerInfoFile
      // create the new name produced a text stub with no DiskObject, which
      // GetDiskObject reads as NIL - the checker stopped existing on the
      // Amiga side. See moveInfoFile.
      this.renameFileCheckerInfoFile(oldChecker.checker_name, validated.checker_name);
    }

    // The edit itself, not a value read back out of a store. getFileChecker
    // resolves against DISK, which still holds the old value at this point.
    const newChecker: FileChecker = {
      ...oldChecker,
      ...validated,
      updated_at: getSystemTime()
    };

    // DISK FIRST: the checker's own icon is what the BBS reads
    // (express.e:18556). The mirror holds two rows against fifteen files, so
    // `if (!success) throw` failed thirteen of them before writing anything.
    this.writeFileCheckerInfoFile(newChecker);

    try {
      this.configRepo.updateFileChecker(id, validated);
    } catch (mirrorError) {
console.error(`[FileCheckerConfigService] Mirror update failed for checker ${id} (disk write succeeded):`, mirrorError);
    }

    this.configRepo.logConfigChange('file_checkers', id, 'UPDATE',
      context.userId, context.username, oldChecker, newChecker,
      context.ipAddress, context.userAgent);

    return newChecker;
  }

  async deleteFileChecker(id: number, context: RequestContext): Promise<boolean> {
    const oldChecker = await this.getFileChecker(id);
    if (!oldChecker) return false;

    const deleted = this.configRepo.deleteFileChecker(id);
    this.deleteFileCheckerInfoFile(oldChecker.checker_name);

    if (deleted) {
      this.configRepo.logConfigChange('file_checkers', id, 'DELETE',
        context.userId, context.username, oldChecker, undefined,
        context.ipAddress, context.userAgent);
    }

    return deleted;
  }

  private writeFileCheckerInfoFile(checker: FileChecker): void {
    if (!checker.checker_name) return;

    const bbsRoot = appConfig.get('dataDir');
    const fcheckDir = resolveDirectory(bbsRoot, 'Fcheck');
    const infoPath = path.join(fcheckDir, `${checker.checker_name}.info`);

    try {
      if (!fs.existsSync(fcheckDir)) {
        fs.mkdirSync(fcheckDir, { recursive: true });
      }

      // Only the five fields this form owns. Everything else in the icon -
      // SOPTIONS, and any '&'-prefixed entry - is left exactly as it is:
      // express.e:18556 reads 'CHECKER' through FindToolType, which matches
      // the key literally, so rewriting '&CHECKER' as 'CHECKER' would be a
      // guess about a key AmiExpress does not read either way.
      const toolTypes = new Map<string, string>();
      if (checker.checker_path) toolTypes.set('CHECKER', checker.checker_path);
      if (checker.options) toolTypes.set('OPTIONS', checker.options);
      if (checker.stack_size !== undefined) toolTypes.set('STACK', checker.stack_size.toString());
      if (checker.priority !== undefined) toolTypes.set('PRIORITY', checker.priority.toString());
      if (checker.script_path) toolTypes.set('SCRIPT', checker.script_path);

      applyTooltypes(infoPath, toolTypes);

console.log(`[FileCheckerConfigService] Wrote ${infoPath}`);
    } catch (error) {
console.error(`[FileCheckerConfigService] Failed to write ${infoPath}:`, error);
    }
  }

  private renameFileCheckerInfoFile(oldName: string, newName: string): void {
    const fcheckDir = resolveDirectory(appConfig.get('dataDir'), 'Fcheck');
    try {
      moveInfoFile(path.join(fcheckDir, `${oldName}.info`), path.join(fcheckDir, `${newName}.info`));
    } catch (error) {
console.error(`[FileCheckerConfigService] Failed to rename ${oldName}.info to ${newName}.info:`, error);
    }
  }

  private deleteFileCheckerInfoFile(checkerName: string): void {
    const bbsRoot = appConfig.get('dataDir');
    const infoPath = path.join(resolveDirectory(bbsRoot, 'Fcheck'), `${checkerName}.info`);

    if (fs.existsSync(infoPath)) {
      try {
        fs.unlinkSync(infoPath);
console.log(`[FileCheckerConfigService] Deleted ${infoPath}`);
      } catch (error) {
console.error(`[FileCheckerConfigService] Failed to delete ${infoPath}:`, error);
      }
    }
  }

  async getFileCheckerErrors(checkerId: number): Promise<FileCheckerError[]> {
    return this.configRepo.getFileCheckerErrors(checkerId);
  }

  async createFileCheckerError(
    error: Omit<FileCheckerError, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<FileCheckerError> {
    const validated = FileCheckerErrorSchema.parse(error);

    const checker = await this.getFileChecker(validated.file_checker_id);
    if (!checker) {
      throw new Error(`File checker ${validated.file_checker_id} not found`);
    }

    const id = this.configRepo.createFileCheckerError({
      file_checker_id: validated.file_checker_id,
      error_number: validated.error_number,
      error_pattern: validated.error_pattern
    });

    const errors = await this.getFileCheckerErrors(validated.file_checker_id);
    const newError = errors.find(e => e.id === id);
    if (!newError) throw new Error('Failed to create file checker error');

    this.configRepo.logConfigChange('file_checker_errors', id, 'CREATE',
      context.userId, context.username, undefined, newError,
      context.ipAddress, context.userAgent);

    return newError;
  }

  async deleteFileCheckerError(id: number, context: RequestContext): Promise<boolean> {
    const allCheckers = await this.getAllFileCheckers();
    let oldError: FileCheckerError | undefined;

    for (const checker of allCheckers) {
      const errors = await this.getFileCheckerErrors(checker.id);
      oldError = errors.find(e => e.id === id);
      if (oldError) break;
    }

    if (!oldError) return false;

    const deleted = this.configRepo.deleteFileCheckerError(id);

    if (deleted) {
      this.configRepo.logConfigChange('file_checker_errors', id, 'DELETE',
        context.userId, context.username, oldError, undefined,
        context.ipAddress, context.userAgent);
    }

    return deleted;
  }
}
