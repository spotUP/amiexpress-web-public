/**
 * Security Configuration Service
 * Handles security level access configuration (TOOLTYPE_ACCESS)
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';
import type { SecurityLevelAccess } from '../../database/types';
import { SecurityLevelAccessSchema, type RequestContext } from '../config.schemas';

export class SecurityConfigService {
  private configRepo: ConfigRepository;

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
  }

  async getSecurityAccessForLevel(securityLevel: number): Promise<SecurityLevelAccess[]> {
    if (securityLevel < 1 || securityLevel > 255) {
      throw new Error('Security level must be between 1 and 255');
    }
    return this.configRepo.getAllSecurityAccessForLevel(securityLevel);
  }

  async getSecurityAccessByFlag(
    securityLevel: number,
    acsFlag: string
  ): Promise<SecurityLevelAccess | null> {
    if (securityLevel < 1 || securityLevel > 255) {
      throw new Error('Security level must be between 1 and 255');
    }
    return this.configRepo.getSecurityAccessByFlag(securityLevel, acsFlag);
  }

  async createSecurityAccess(
    data: Omit<SecurityLevelAccess, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<SecurityLevelAccess> {
    // Validate input
    const validated = SecurityLevelAccessSchema.parse(data);

    // Create
    const id = this.configRepo.createSecurityAccess({
      security_level: validated.security_level,
      acs_flag: validated.acs_flag,
      enabled: validated.enabled ?? true,
      description: validated.description
    });

    const newAccess = this.configRepo.getSecurityAccessByFlag(validated.security_level, validated.acs_flag);
    if (!newAccess) {
      throw new Error('Failed to create security access');
    }

    // Log change
    this.configRepo.logConfigChange(
      'security_level_access',
      id,
      'CREATE',
      context.userId,
      context.username,
      undefined,
      newAccess,
      context.ipAddress,
      context.userAgent
    );

    return newAccess;
  }

  async updateSecurityAccess(
    id: number,
    updates: Partial<SecurityLevelAccess>,
    context: RequestContext
  ): Promise<boolean> {
    // Validate input
    const validated = SecurityLevelAccessSchema.partial().parse(updates);

    // Get old values
    // Pull from the specific level first; fall back to all
    const level = updates.security_level ?? undefined;
    const scopedAccess = level !== undefined
      ? await this.configRepo.getAllSecurityAccessForLevel(level)
      : await this.configRepo.getAllSecurityAccessForLevel(0);
    const oldAccess = scopedAccess.find((a: any) => a.id === id);
    if (!oldAccess) {
      throw new Error(`Security access ${id} not found`);
    }

    // Update
    const success = this.configRepo.updateSecurityAccess(id, validated);

    if (success) {
      const refreshed = level !== undefined
        ? await this.configRepo.getAllSecurityAccessForLevel(level)
        : await this.configRepo.getAllSecurityAccessForLevel(0);
      const newAccess = refreshed.find((a: any) => a.id === id);
      // Log change
      this.configRepo.logConfigChange(
        'security_level_access',
        id,
        'UPDATE',
        context.userId,
        context.username,
        oldAccess,
        newAccess,
        context.ipAddress,
        context.userAgent
      );
    }

    return success;
  }

  async deleteSecurityAccess(id: number, context: RequestContext): Promise<boolean> {
    // Get old values
    const allAccess = await this.configRepo.getAllSecurityAccessForLevel(0);
    const oldAccess = allAccess.find(a => a.id === id);
    if (!oldAccess) {
      return false;
    }

    // Delete
    const deleted = this.configRepo.deleteSecurityAccess(id);

    if (deleted) {
      // Log change
      this.configRepo.logConfigChange(
        'security_level_access',
        id,
        'DELETE',
        context.userId,
        context.username,
        oldAccess,
        undefined,
        context.ipAddress,
        context.userAgent
      );
    }

    return deleted;
  }
}
