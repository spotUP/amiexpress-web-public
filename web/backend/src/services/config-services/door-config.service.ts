/**
 * Door Configuration Service
 * Handles BBS door/external program configuration
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';
import { findDoorInfoFile, applyDoorFieldsToTooltypes, applyEnabledToTooltypes, buildNewDoorTooltypes } from './door-info-file.service';
import { parseInfoFile, writeInfoFile } from '../../utils/info-file.util';
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

    // Uniqueness against DISK, not the database.
    //
    // This asked getDoorByCommand, which reads the `doors` table - but doors
    // live in Commands/BBSCmd/*.info (350 of them on the live site) and that
    // table is largely empty. So creating a door named after an existing one
    // passed the guard, and the write below replaced a real binary .info with
    // a plain-text one: both parse, so nothing complained, and STACK,
    // PRIORITY, NAME, MULTINODE and the door's icon were silently lost.
    const bbsRootForCheck = appConfig.get('dataDir');
    if (findDoorInfoFile(bbsRootForCheck, validated.door_command)) {
      throw new Error(
        `A door with the command '${validated.door_command}' already exists on disk - edit it instead`
      );
    }

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
      const bbsRootForRename = appConfig.get('dataDir');

      // Disk decides whether the new command is taken, for the same reason as
      // createDoor: the doors table is not the authority on what exists.
      if (findDoorInfoFile(bbsRootForRename, validated.door_command)) {
        throw new Error(
          `A door with the command '${validated.door_command}' already exists on disk`
        );
      }
      const existing = await this.getDoorByCommand(validated.door_command);
      if (existing) {
        throw new Error(`Door command '${validated.door_command}' already exists`);
      }

      // MOVE the file rather than deleting it and writing a fresh one. A
      // rename is still the same door, and its STACK, MULTINODE, RESIDENT and
      // icon should survive being renamed.
      const from = findDoorInfoFile(bbsRootForRename, oldDoor.door_command);
      if (from) {
        const to = path.join(path.dirname(from), `${validated.door_command}.info`);
        try {
          fs.renameSync(from, to);
console.log(`[DoorConfigService] Renamed ${from} -> ${to}`);
        } catch (error) {
console.error(`[DoorConfigService] Failed to rename ${from}:`, error);
        }
      }
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

      // An existing .info is EDITED, never replaced: it is a binary Amiga
      // icon carrying tooltypes this form knows nothing about (STACK,
      // MULTINODE, RESIDENT), and rewriting it as text threw all of them away.
      const existingPath = findDoorInfoFile(bbsRoot, door.door_command);
      if (existingPath) {
        const info = parseInfoFile(existingPath);
        info.tooltypes = applyDoorFieldsToTooltypes(info.tooltypes as any, door as any) as any;
        // Fields first, then the switch. Saving a new access level and taking
        // the door offline in one edit has to remember the level the sysop
        // just typed, not the one it is replacing.
        if (typeof door.enabled === 'boolean') {
          info.tooltypes = applyEnabledToTooltypes(info.tooltypes as any, door.enabled) as any;
        }
        writeInfoFile(info);
console.log(`[DoorConfigService] Updated ${existingPath}`);
        return;
      }

      // A door that does not exist yet: write the tooltypes it needs, with
      // TYPE as the door type the loader understands rather than a runtime
      // name, and no invented NAME.
      const tooltypes = buildNewDoorTooltypes({
        door_command: door.door_command,
        door_type: door.door_type as string,
        door_path: door.door_path,
        door_name: door.door_name,
        min_security_level: door.min_security_level,
        priority: door.priority,
        door_args: door.door_args,
      });
      const lines = tooltypes.map(t => (t.value ? `${t.key}=${t.value}` : t.key));
      if (door.working_directory) lines.push(`WORKDIR=${door.working_directory}`);

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
