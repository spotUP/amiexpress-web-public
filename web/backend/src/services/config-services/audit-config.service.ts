/**
 * Audit Configuration Service
 * Handles audit log retrieval
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';

export class AuditConfigService {
  private configRepo: ConfigRepository;

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
  }

  async getAuditLog(
    tableName?: string,
    recordId?: number,
    limit: number = 100
  ) {
    return this.configRepo.getAuditLog(tableName, recordId, limit);
  }
}
