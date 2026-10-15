/**
 * NodeFileManager - Manages node{n}.user and node{n}.userkeys files
 *
 * AmiExpress writes binary files to disk that doors read to see who's online.
 * This manager provides BOTH read and write access to maintain 1:1 compatibility.
 *
 * File locations:
 * - BBS:node0.user (binary user struct)
 * - BBS:node0.userkeys (binary userKeys struct)
 * - BBS:Node0/CallersLog (text activity log)
 *
 * Reference: AmiExpress-Sources/axobjects.e lines 11-81
 * express.e:2935-2950 (createNodeUserFiles)
 */

import * as fs from 'fs';
import * as path from 'path';
import { userFileManager, type UserFileStruct, type UserKeysFileStruct } from './UserFileManager';
import { User } from '../types';
import { sessionRecords } from './load-account';

/**
 * Manages node status files for door compatibility
 */
export class NodeFileManager {
  private bbsRoot: string;

  constructor(bbsRoot: string = './data/bbs') {
    this.bbsRoot = bbsRoot;
  }

  /**
   * Write node{n}.user binary file
   *
   * Called on login to create/update the node's current user file
   * that WHO and other doors read.
   */
  writeNodeUserFile(nodeId: number, user: User): void {
    const filePath = path.join(this.bbsRoot, `node${nodeId}.user`);

console.log(`[NodeFileManager] Writing ${filePath} for user ${user.username}`);

    // Create binary buffer matching E struct layout
    const buffer = sessionRecords(user, user.slotNumber ?? 0).user;

    // Write atomically (tmp file + rename)
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, filePath);

console.log(`[NodeFileManager] Wrote node${nodeId}.user (${buffer.length} bytes)`);
  }

  /**
   * Write node{n}.userkeys binary file
   */
  writeNodeUserKeysFile(nodeId: number, user: User): void {
    const filePath = path.join(this.bbsRoot, `node${nodeId}.userkeys`);

console.log(`[NodeFileManager] Writing ${filePath} for user ${user.username}`);

    const buffer = sessionRecords(user, user.slotNumber ?? 0).keys;

    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, filePath);

console.log(`[NodeFileManager] Wrote node${nodeId}.userkeys (${buffer.length} bytes)`);
  }

  /**
   * Read node{n}.user binary file
   *
   * Used to check who's online on other nodes
   */
  readNodeUserFile(nodeId: number): UserFileStruct | null {
    const filePath = path.join(this.bbsRoot, `node${nodeId}.user`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const buffer = fs.readFileSync(filePath);
      return userFileManager.deserializeUserStruct(buffer);
    } catch (error) {
console.error(`[NodeFileManager] Error reading ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Read node{n}.userkeys binary file
   */
  readNodeUserKeysFile(nodeId: number): UserKeysFileStruct | null {
    const filePath = path.join(this.bbsRoot, `node${nodeId}.userkeys`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const buffer = fs.readFileSync(filePath);
      return userFileManager.deserializeUserKeysStruct(buffer);
    } catch (error) {
console.error(`[NodeFileManager] Error reading ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Free every node: nobody is online, so no node holds a caller.
   *
   * `node<n>.user` is written at login and deleted at logoff, and it is what
   * the board reads to answer "is this account already on another node?"
   * (services/user-already-online.ts, express.e:29715 `checkUserOnLine`).
   * A clean logoff removes it; a process that DIES - a deploy, a crash, a
   * container restart - cannot, and the record outlives the session it
   * describes.
   *
   * On 2026-09-07 that locked the sysop out of his own board: twenty-one
   * stale records, sysop on nine nodes and spot on four, some from six days
   * earlier, every one of them a caller the board had long since forgotten.
   * A real Amiga has the same rule for the same reason - a node that has just
   * booted has nobody on it - so the sweep belongs at startup, before the
   * first caller can connect.
   *
   * Returns the node ids it freed, for the boot log.
   */
  releaseAllNodes(): number[] {
    let entries: string[];
    try {
      entries = fs.readdirSync(this.bbsRoot);
    } catch {
      return []; // no board directory yet: nothing to free
    }

    const freed: number[] = [];
    for (const entry of entries) {
      const match = /^node(\d+)\.user$/i.exec(entry);
      if (!match) continue;
      const nodeId = parseInt(match[1], 10);
      if (!Number.isFinite(nodeId)) continue;
      try {
        this.deleteNodeFiles(nodeId);
        freed.push(nodeId);
      } catch {
        // An unremovable record must not stop the board from booting; it
        // costs that one node's account a login, not the whole board.
      }
    }
    return freed.sort((a, b) => a - b);
  }

  /**
   * Delete node files on logoff
   */
  deleteNodeFiles(nodeId: number): void {
    const userFile = path.join(this.bbsRoot, `node${nodeId}.user`);
    const keysFile = path.join(this.bbsRoot, `node${nodeId}.userkeys`);

    if (fs.existsSync(userFile)) {
      fs.unlinkSync(userFile);
console.log(`[NodeFileManager] Deleted node${nodeId}.user`);
    }

    if (fs.existsSync(keysFile)) {
      fs.unlinkSync(keysFile);
console.log(`[NodeFileManager] Deleted node${nodeId}.userkeys`);
    }
  }

  /**
   * Check if node user files exist for a given node
   */
  nodeUserFilesExist(nodeId: number): boolean {
    const userFile = path.join(this.bbsRoot, `node${nodeId}.user`);
    const keysFile = path.join(this.bbsRoot, `node${nodeId}.userkeys`);
    return fs.existsSync(userFile) && fs.existsSync(keysFile);
  }

  /**
   * Get all active nodes (nodes with .user files)
   */
  getActiveNodes(): number[] {
    const activeNodes: number[] = [];

    for (let i = 0; i < 255; i++) {  // Max 255 nodes
      if (this.nodeUserFilesExist(i)) {
        activeNodes.push(i);
      }
    }

    return activeNodes;
  }
}

// Export singleton instance - use BBS_DATA_DIR env var for proper path resolution
const bbsDataDir = process.env.BBS_DATA_DIR || './data/bbs';
export const nodeFileManager = new NodeFileManager(bbsDataDir);
