/**
 * Protocol Configuration Service
 * Handles file transfer protocol configuration (XprTypes.info)
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';
import type { Protocol } from '../../database/types';
import { ProtocolSchema, type RequestContext } from '../config.schemas';
import { InfoFileParser } from '../info-file-parser';
import { config as appConfig } from '../../config';
import { mergeForWrite } from './config-merge.util';
import * as fs from 'fs';
import * as path from 'path';
import { getSystemTime } from '../../utils/date-time.util';

export class ProtocolConfigService {
  private configRepo: ConfigRepository;

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
  }

  async getProtocols(): Promise<Protocol[]> {
    const bbsRoot = appConfig.get('dataDir');
    const xprTypesPath = path.join(bbsRoot, 'Protocols', 'XprTypes.info');

    if (!fs.existsSync(xprTypesPath)) {
console.warn('[ProtocolConfigService] Protocols/XprTypes.info not found');
      return this.configRepo.getProtocols();
    }

    try {
      const buffer = fs.readFileSync(xprTypesPath);
      const stats = fs.statSync(xprTypesPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        toolTypes.set(key.toUpperCase(), value);
      }

      const protocols: Protocol[] = [];
      let protocolNum = 1;

      while (true) {
        const library = toolTypes.get(`LIBRARY.${protocolNum}`);
        const title = toolTypes.get(`TITLE.${protocolNum}`);

        if (!library && !title) break;

        if (library && title) {
          protocols.push({
            id: protocolNum,
            protocol_name: title,
            protocol_code: library,
            command: library,
            upload_command: '',
            download_command: '',
            batch_upload: library.toLowerCase().includes('zmodem') || library.toLowerCase().includes('ymodem'),
            batch_download: library.toLowerCase().includes('zmodem') || library.toLowerCase().includes('ymodem'),
            bidirectional: library.toLowerCase().includes('hydra'),
            enabled: true,
            is_default: protocolNum === 1,
            created_at: stats.birthtime,
            updated_at: stats.mtime
          });
        }

        protocolNum++;
        if (protocolNum > 50) break;
      }

console.log(`[ProtocolConfigService] Loaded ${protocols.length} protocols`);
      return protocols;
    } catch (error) {
console.error('[ProtocolConfigService] Error reading Protocols/XprTypes.info:', error);
      return this.configRepo.getProtocols();
    }
  }

  async getProtocol(id: number): Promise<Protocol | null> {
    const protocols = await this.getProtocols();
    return protocols.find(p => p.id === id) || null;
  }

  async getProtocolByCode(code: string): Promise<Protocol | null> {
    const protocols = await this.getProtocols();
    return protocols.find(p => p.protocol_code.toUpperCase() === code.toUpperCase()) || null;
  }

  async createProtocol(
    protocol: Omit<Protocol, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<Protocol> {
    const validated = ProtocolSchema.parse(protocol) as Omit<Protocol, 'id' | 'created_at' | 'updated_at'>;

    const existing = await this.getProtocolByCode(validated.protocol_code);
    if (existing) {
      throw new Error(`Protocol code '${validated.protocol_code}' already exists`);
    }

    const newProtocol = this.configRepo.createProtocol(validated);
    if (!newProtocol) throw new Error('Failed to create protocol');

    await this.writeXprTypesInfoFile({ entry: newProtocol });
    this.configRepo.logConfigChange('protocols', newProtocol.id, 'CREATE',
      context.userId, context.username, undefined, newProtocol,
      context.ipAddress, context.userAgent);

    return newProtocol;
  }

  async updateProtocol(
    id: number,
    updates: Partial<Protocol>,
    context: RequestContext
  ): Promise<Protocol> {
    const validated = ProtocolSchema.partial().parse(updates);
    const oldProtocol = await this.getProtocol(id);
    if (!oldProtocol) throw new Error(`Protocol ${id} not found`);

    if (validated.protocol_code && validated.protocol_code !== oldProtocol.protocol_code) {
      const allProtocols = await this.getProtocols();
      const existing = allProtocols.find(p =>
        p.protocol_code.toUpperCase() === validated.protocol_code!.toUpperCase() && p.id !== id
      );
      if (existing) {
        throw new Error(`Protocol code '${validated.protocol_code}' already exists`);
      }
    }

    const dbProtocol = this.configRepo.updateProtocol(id, validated);
    const newProtocol: Protocol = dbProtocol || {
      ...oldProtocol,
      ...validated,
      updated_at: getSystemTime()
    };

    // The change itself is what gets merged over disk - not the database's
    // copy of it, which may not exist. A protocol whose code changed is still
    // on disk under the old code, so name the rename or the merge keeps the
    // old entry and appends the new one.
    await this.writeXprTypesInfoFile({
      entry: newProtocol,
      ...(newProtocol.protocol_code !== oldProtocol.protocol_code
        ? { rename: { from: oldProtocol.protocol_code, to: newProtocol.protocol_code } }
        : {})
    });
    this.configRepo.logConfigChange('protocols', newProtocol.id, 'UPDATE',
      context.userId, context.username, oldProtocol, newProtocol,
      context.ipAddress, context.userAgent);

    return newProtocol;
  }

  async deleteProtocol(id: number, context: RequestContext): Promise<boolean> {
    const oldProtocol = await this.getProtocol(id);
    if (!oldProtocol) return false;

    const deleted = this.configRepo.deleteProtocol(id);
    await this.writeXprTypesInfoFile({ remove: oldProtocol.protocol_code });

    if (deleted) {
      this.configRepo.logConfigChange('protocols', oldProtocol.id, 'DELETE',
        context.userId, context.username, oldProtocol, undefined,
        context.ipAddress, context.userAgent);
    }

    return deleted;
  }

  /**
   * Rewrite Protocols/XprTypes.info.
   *
   * `change` describes what the caller just did: `entry` is the created or
   * edited protocol, `remove` a deletion, `rename` an edit that changed the
   * protocol code, which is the key this file is merged on. All three are
   * needed because the merge starts from a DISK that still holds the old shape.
   */
  private async writeXprTypesInfoFile(
    change: { entry?: Protocol; remove?: string; rename?: { from: string; to: string } } = {}
  ): Promise<void> {
    const bbsRoot = appConfig.get('dataDir');
    const protocolsDir = path.join(bbsRoot, 'Protocols');
    const xprTypesPath = path.join(protocolsDir, 'XprTypes.info');

    try {
      if (!fs.existsSync(protocolsDir)) {
        fs.mkdirSync(protocolsDir, { recursive: true });
      }

      // Disk first. This used to rebuild the file from
      // configRepo.getProtocols() alone, while the page reads its list from
      // XprTypes.info - so with a stale or partial protocols table, saving one
      // protocol erased every protocol that only existed on disk. The database
      // is a mirror; a mirror that has fallen behind must not truncate what it
      // mirrors.
      //
      // XprTypes.info is ordered (LIBRARY.1, LIBRARY.2, ...) and the BBS reads
      // it by index, so entries keep their position and additions go on the end.
      const onDisk = await this.getProtocols();
      const fromDb = this.configRepo.getProtocols();
      // The caller's entry goes last so it wins over a stale mirror row.
      const changed = change.entry ? [...fromDb, change.entry] : fromDb;
      const protocols = mergeForWrite(
        onDisk,
        changed,
        (p: Protocol) => String(p.protocol_code ?? ''),
        {
          remove: change.remove ? [change.remove] : [],
          ...(change.rename ? { rename: change.rename } : {})
        }
      );

      const toolTypes = new Map<string, string>();
      let protocolNum = 1;

      for (const protocol of protocols) {
        if (protocol.enabled !== false) {
          toolTypes.set(`LIBRARY.${protocolNum}`, protocol.protocol_code);
          toolTypes.set(`TITLE.${protocolNum}`, protocol.protocol_name);
          protocolNum++;
        }
      }

      const parser = new InfoFileParser();
      const infoData = parser.write(toolTypes);
      fs.writeFileSync(xprTypesPath, infoData);

console.log(`[ProtocolConfigService] Wrote ${xprTypesPath} with ${protocolNum - 1} protocols`);
    } catch (error) {
console.error(`[ProtocolConfigService] Failed to write ${xprTypesPath}:`, error);
    }
  }
}
