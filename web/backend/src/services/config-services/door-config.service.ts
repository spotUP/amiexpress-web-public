/**
 * Door Configuration Service
 * Handles BBS door/external program configuration
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';
import type { Door } from '../../database/types';
import { DoorSchema, type RequestContext } from '../config.schemas';
import { config as appConfig } from '../../config';
import * as fs from 'fs';
import * as path from 'path';

export class DoorConfigService {
  private configRepo: ConfigRepository;

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
  }

  async getDoors(): Promise<Door[]> {
    return this.configRepo.getDoors();
  }

  async getDoor(id: number): Promise<Door | null> {
    return this.configRepo.getDoor(id);
  }

  async getDoorByCommand(command: string): Promise<Door | null> {
    return this.configRepo.getDoorByCommand(command);
  }

  async createDoor(
    door: Omit<Door, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<Door> {
    const validated = DoorSchema.parse(door) as Omit<Door, 'id' | 'created_at' | 'updated_at'>;

    const existing = await this.getDoorByCommand(validated.door_command);
    if (existing) {
      throw new Error(`Door command '${validated.door_command}' already exists`);
    }

    const newDoor = this.configRepo.createDoor(validated);
    this.writeDoorInfoFile(validated);

    this.configRepo.logConfigChange('doors', newDoor.id, 'CREATE',
      context.userId, context.username, undefined, newDoor,
      context.ipAddress, context.userAgent);

    return newDoor;
  }

  async updateDoor(
    id: number,
    updates: Partial<Door>,
    context: RequestContext
  ): Promise<Door> {
    const validated = DoorSchema.partial().parse(updates);
    const oldDoor = await this.getDoor(id);
    if (!oldDoor) throw new Error(`Door ${id} not found`);

    if (validated.door_command && validated.door_command !== oldDoor.door_command) {
      const existing = await this.getDoorByCommand(validated.door_command);
      if (existing) {
        throw new Error(`Door command '${validated.door_command}' already exists`);
      }
      this.deleteDoorInfoFile(oldDoor.door_command, oldDoor.door_type);
    }

    const newDoor = this.configRepo.updateDoor(id, validated);
    const mergedDoor = { ...oldDoor, ...validated };
    this.writeDoorInfoFile(mergedDoor);

    this.configRepo.logConfigChange('doors', newDoor.id, 'UPDATE',
      context.userId, context.username, oldDoor, newDoor,
      context.ipAddress, context.userAgent);

    return newDoor;
  }

  async deleteDoor(id: number, context: RequestContext): Promise<boolean> {
    const oldDoor = await this.getDoor(id);
    if (!oldDoor) return false;

    const deleted = this.configRepo.deleteDoor(id);
    this.deleteDoorInfoFile(oldDoor.door_command, oldDoor.door_type);

    if (deleted) {
      this.configRepo.logConfigChange('doors', oldDoor.id, 'DELETE',
        context.userId, context.username, oldDoor, undefined,
        context.ipAddress, context.userAgent);
    }

    return deleted;
  }

  private writeDoorInfoFile(door: Partial<Door>): void {
    if (!door.door_command || !door.door_type) return;

    const bbsRoot = appConfig.get('dataDir');
    const cmdDir = door.door_type === 'SYSCMD' ? 'SysCmd' : 'BBSCmd';
    const infoPath = path.join(bbsRoot, 'Commands', cmdDir, `${door.door_command}.info`);

    try {
      const dirPath = path.dirname(infoPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      const lines: string[] = [];
      lines.push(`${door.door_type}=${door.door_command}`);

      const typeMap: Record<string, string> = {
        'NATIVE_NODE': 'TS',
        'BROWSER': 'TS',
        'AMIGA_68K': 'AMIGA'
      };
      const runtimeType = door.runtime_env ? (typeMap[door.runtime_env] || 'TS') : 'TS';
      lines.push(`TYPE=${runtimeType}`);

      if (door.door_path) lines.push(`LOCATION=${door.door_path}`);
      if (door.door_name) lines.push(`DESCRIPTION=${door.door_name}`);
      lines.push(`ACCESS=${door.min_security_level ?? 0}`);
      lines.push(`MULTINODE=YES`);
      lines.push(`PRIORITY=${door.priority || 'SAME'}`);
      if (door.working_directory) lines.push(`WORKDIR=${door.working_directory}`);
      if (door.door_args) lines.push(`ARGS=${door.door_args}`);

      fs.writeFileSync(infoPath, lines.join('\r\n') + '\r\n');
      console.log(`[DoorConfigService] Wrote ${infoPath}`);
    } catch (error) {
      console.error(`[DoorConfigService] Failed to write ${infoPath}:`, error);
    }
  }

  private deleteDoorInfoFile(doorCommand: string, doorType: string): void {
    const bbsRoot = appConfig.get('dataDir');
    const cmdDir = doorType === 'SYSCMD' ? 'SysCmd' : 'BBSCmd';
    const infoPath = path.join(bbsRoot, 'Commands', cmdDir, `${doorCommand}.info`);

    if (fs.existsSync(infoPath)) {
      try {
        fs.unlinkSync(infoPath);
        console.log(`[DoorConfigService] Deleted ${infoPath}`);
      } catch (error) {
        console.error(`[DoorConfigService] Failed to delete ${infoPath}:`, error);
      }
    }
  }
}
