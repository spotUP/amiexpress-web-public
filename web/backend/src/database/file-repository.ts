/**
 * File Repository
 * Handles all file area and file entry related database operations
 */

import { fileAreaManager } from '../services/FileAreaManager';
import type { FileArea, FileEntry } from './types';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { BaseRepository } from './BaseRepository';
import { getSystemTime } from '../utils/date-time.util';

export class FileRepository extends BaseRepository<any> {
  constructor(db: any) { super(db); }

  /**
   * Map a raw file_entries row to a FileEntry. storage_volume/object_key are
   * NULL for every row on every board that has not configured a bucket -
   * that NULL becomes undefined, meaning "this file is on local disk".
   */
  private mapFileEntryRow(row: any): FileEntry {
    return {
      id: row.id,
      filename: row.filename,
      description: row.description,
      size: row.size,
      uploader: row.uploader,
      uploadDate: new Date(row.uploaddate * 1000),
      downloads: row.downloads,
      areaId: row.areaid,
      fileIdDiz: row.fileiddiz,
      rating: row.rating,
      votes: row.votes,
      status: row.status as 'active' | 'held' | 'deleted',
      checked: row.checked as 'N' | 'P' | 'F',
      comment: row.comment,
      storageVolume: row.storage_volume ?? undefined,
      objectKey: row.object_key ?? undefined
    };
  }

  /**
   * Map a raw file_areas row to a FileArea. storage_volume/volume_class_pref
   * are NULL for every area on every board that has not configured a bucket.
   */
  private mapFileAreaRow(row: any): FileArea {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      path: row.path,
      conferenceId: row.conferenceid,
      maxFiles: row.maxfiles,
      uploadAccess: row.uploadaccess,
      downloadAccess: row.downloadaccess,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000),
      storageVolume: row.storage_volume ?? undefined,
      volumeClassPref: (row.volume_class_pref ?? undefined) as 'FREE' | 'PAID' | undefined
    };
  }

  /**
   * Record that a file now lives on a pooled volume, under the given object
   * key. Later tasks call this after a successful upload to object storage.
   *
   * Throws if no catalog row matched (filename, areaId) - a caller that has
   * just finished uploading to a bucket must not be able to believe the
   * location was recorded when it was not. A repeat call for the same
   * (filename, areaid) is an idempotent update (that pair is UNIQUE), which
   * is intended and does not throw.
   */
  recordLocation(filename: string, areaId: number, driveNumber: number, objectKey: string): void {
    const result = this.run(
      'UPDATE file_entries SET storage_volume = ?, object_key = ? WHERE filename = ? AND areaid = ?',
      [driveNumber, objectKey, filename, areaId]
    );
    if (result.changes === 0) {
      throw new Error(
        `recordLocation: no file_entries row for filename "${filename}" in area ${areaId}`
      );
    }
  }

  /**
   * The admin's "what is on this volume" report. Returns every entry on the
   * drive - not a page of them - since this is the whole mitigation a sysop
   * gets when a provider closes their account.
   */
  entriesOnVolume(driveNumber: number): FileEntry[] {
    const rows = this.all<any>('SELECT * FROM file_entries WHERE storage_volume = ?', [driveNumber]);
    return rows.map(row => this.mapFileEntryRow(row));
  }

  /**
   * Bytes each pooled volume actually holds, from the CATALOG - not
   * `VolumeState.usedBytes`, the in-process counter that starts at 0 on every
   * boot and is only ever incremented by `FileCache.writeBack`. Nothing
   * reconciles that counter against reality, so it under-reports at boot and
   * only ever drifts further from the truth; the catalog is what the pool
   * actually contains, whether this process wrote every byte of it or not.
   * This is the number Task 11's admin page shows as "used".
   */
  usedBytesByVolume(): Map<number, number> {
    const rows = this.all<{ storage_volume: number; total: number | null }>(
      'SELECT storage_volume, SUM(size) as total FROM file_entries WHERE storage_volume IS NOT NULL GROUP BY storage_volume'
    );
    const byVolume = new Map<number, number>();
    for (const row of rows) byVolume.set(row.storage_volume, row.total ?? 0);
    return byVolume;
  }

  async createFileEntry(file: Omit<FileEntry, 'id'>): Promise<number> {

    const stmt = this.prepare(`
      INSERT INTO file_entries (
        filename, description, size, uploader, uploaddate, downloads,
        areaid, fileiddiz, rating, votes, status, checked, comment,
        storage_volume, object_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      file.filename, file.description, file.size, file.uploader,
      Math.floor(file.uploadDate.getTime() / 1000),
      file.downloads, file.areaId, file.fileIdDiz, file.rating, file.votes,
      file.status, file.checked, file.comment,
      file.storageVolume ?? null, file.objectKey ?? null
    );

    const fileId = result.lastInsertRowid as number;

    // CRITICAL: Write to .dir file for Amiga door compatibility
    try {
      // Get file area info
      const area = await this.getFileAreaById(file.areaId);
      if (area) {
        const fullEntry: FileEntry = {
          ...file,
          id: fileId
        };
        fileAreaManager.addFileEntry(fullEntry, area);
console.log(`[Database] Synced file entry "${file.filename}" to ${area.name}.dir`);
      }
    } catch (error) {
console.error(`[Database] Failed to sync file entry to disk:`, error);
      SysopDebugUtil.debug(
        null,
        null,
        'Database',
        `Failed to sync file entry "${file.filename}" to disk (.dir file)`,
        {
          error: error instanceof Error ? error.message : String(error),
          areaId: file.areaId,
          filename: file.filename
        },
        DebugSeverity.WARNING
      );
      // Don't throw - DB insert succeeded
    }

    return fileId;
  }

  async getFileEntries(areaId: number, options?: {
    limit?: number;
    offset?: number;
    search?: string;
    status?: string;
  }): Promise<FileEntry[]> {

    let sql = 'SELECT * FROM file_entries WHERE areaid = ?';
    const params: any[] = [areaId];

    if (options?.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    }

    if (options?.search) {
      sql += ' AND (filename LIKE ? OR description LIKE ? OR fileiddiz LIKE ?)';
      const searchTerm = `%${options.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY uploaddate DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => this.mapFileEntryRow(row));
  }

  async updateFileEntry(id: number, updates: Partial<FileEntry>): Promise<void> {

    const fields = Object.keys(updates).filter(key => key !== 'id');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
      if (f === 'uploadDate') {
        const date = updates.uploadDate;
        return date ? Math.floor(date.getTime() / 1000) : null;
      }
      return updates[f as keyof FileEntry];
    });

    const sql = `UPDATE file_entries SET ${setClause} WHERE id = ?`;
    const stmt = this.prepare(sql);
    stmt.run(...values, id);

    // CRITICAL: Sync to .dir file for Amiga door compatibility
    try {
      const selectStmt = this.prepare('SELECT * FROM file_entries WHERE id = ?');
      const row = selectStmt.get(id) as any;

      if (row) {
        const area = await this.getFileAreaById(row.areaid);
        if (area) {
          const fullEntry: FileEntry = this.mapFileEntryRow(row);
          fileAreaManager.updateFileEntry(fullEntry, area);
console.log(`[Database] Synced updated file entry "${row.filename}" to ${area.name}.dir`);
        }
      }
    } catch (error) {
console.error(`[Database] Failed to sync updated file entry to disk:`, error);
      SysopDebugUtil.debug(
        null,
        null,
        'Database',
        `Failed to sync updated file entry to disk (.dir file)`,
        { error: error instanceof Error ? error.message : String(error), fileId: id },
        DebugSeverity.WARNING
      );
    }
  }

  async getFileEntry(id: number): Promise<FileEntry | null> {

    const stmt = this.prepare(`
      SELECT fe.*, fa.conferenceid as conferenceId
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fe.id = ?
    `);
    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.mapFileEntryRow(row);
  }

  /**
   * The catalog row for a filename inside one conference.
   *
   * It exists so the by-NAME lookup goes through `mapFileEntryRow` like every
   * other one. `server/file-socket-handlers.ts` used to run its own
   * `SELECT fe.*` here, whose row is snake_case: `row.storageVolume` was
   * undefined on it, and undefined is precisely how a file on local disk
   * looks - so every by-name download of a pooled file read as local, took
   * the local route, and was not there.
   *
   * The comparison is case-insensitive because AmigaOS filenames are, and
   * because the caller normalises what the user typed before asking.
   */
  async getFileEntryByName(conferenceId: number, filename: string): Promise<FileEntry | null> {
    const stmt = this.prepare(`
      SELECT fe.*, fa.conferenceid as conferenceId
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fa.conferenceid = ? AND LOWER(fe.filename) = LOWER(?)
      LIMIT 1
    `);
    const row = stmt.get(conferenceId, filename) as any;
    if (!row) return null;

    return this.mapFileEntryRow(row);
  }

  async deleteFileEntry(id: number): Promise<void> {

    // Get file info before deleting for disk cleanup
    const selectStmt = this.prepare('SELECT filename, areaid FROM file_entries WHERE id = ?');
    const row = selectStmt.get(id) as any;

    const stmt = this.prepare('DELETE FROM file_entries WHERE id = ?');
    stmt.run(id);

    // CRITICAL: Delete from .dir file for Amiga door compatibility
    if (row) {
      try {
        const area = await this.getFileAreaById(row.areaid);
        if (area) {
          fileAreaManager.deleteFileEntry(row.filename, area);
console.log(`[Database] Deleted file entry "${row.filename}" from ${area.name}.dir`);
        }
      } catch (error) {
console.error(`[Database] Failed to delete file entry from disk:`, error);
        SysopDebugUtil.debug(
          null,
          null,
          'Database',
          `Failed to delete file entry from disk (.dir file)`,
          {
            error: error instanceof Error ? error.message : String(error),
            fileId: id,
            filename: row.filename,
            areaId: row.areaid
          },
          DebugSeverity.WARNING
        );
      }
    }
  }

  async incrementDownloadCount(id: number): Promise<void> {

    const stmt = this.prepare('UPDATE file_entries SET downloads = downloads + 1 WHERE id = ?');
    stmt.run(id);
  }

  async createFileArea(area: Omit<FileArea, 'id' | 'created' | 'updated'>): Promise<number> {

    const stmt = this.prepare(`
      INSERT INTO file_areas (
        name, description, path, conferenceid, maxfiles, uploadaccess, downloadaccess
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      area.name, area.description, area.path, area.conferenceId,
      area.maxFiles, area.uploadAccess, area.downloadAccess
    );

    const areaId = result.lastInsertRowid as number;

    // CRITICAL: Create .dir file for Amiga door compatibility
    try {
      const fullArea: FileArea = {
        ...area,
        id: areaId,
        created: getSystemTime(),
        updated: getSystemTime()
      };
      fileAreaManager.createAreaDirFile(fullArea);
console.log(`[Database] Created .dir file for area "${area.name}" in conference ${area.conferenceId}`);
    } catch (error) {
console.error(`[Database] Failed to create .dir file:`, error);
      SysopDebugUtil.debug(
        null,
        null,
        'Database',
        `Failed to create .dir file for file area "${area.name}"`,
        {
          error: error instanceof Error ? error.message : String(error),
          areaName: area.name,
          conferenceId: area.conferenceId
        },
        DebugSeverity.WARNING
      );
    }

    return areaId;
  }

  async getFileAreas(conferenceId: number): Promise<FileArea[]> {

    const stmt = this.prepare('SELECT * FROM file_areas WHERE conferenceid = ? ORDER BY id');
    const rows = stmt.all(conferenceId) as any[];

    return rows.map(row => this.mapFileAreaRow(row));
  }

  async getFileAreaById(id: number): Promise<FileArea | null> {

    const stmt = this.prepare('SELECT * FROM file_areas WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.mapFileAreaRow(row);
  }

  async getFilesByArea(areaId: number): Promise<FileEntry[]> {

    const stmt = this.prepare('SELECT * FROM file_entries WHERE areaid = ? ORDER BY uploaddate DESC');
    const rows = stmt.all(areaId) as any[];

    return rows.map(row => this.mapFileEntryRow(row));
  }

  async getFileStatisticsByConference(conferenceId: number): Promise<{
    totalFiles: number;
    totalBytes: number;
    totalUploads: number;
    totalDownloads: number;
  }> {

    const stmt = this.prepare(`
      SELECT
        COUNT(*) as totalfiles,
        COALESCE(SUM(fe.size), 0) as totalbytes,
        COALESCE(SUM(fe.downloads), 0) as totaldownloads
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fa.conferenceid = ?
    `);

    const row = stmt.get(conferenceId) as any;
    return {
      totalFiles: parseInt(row.totalfiles) || 0,
      totalBytes: parseInt(row.totalbytes) || 0,
      totalUploads: 0,
      totalDownloads: parseInt(row.totaldownloads) || 0
    };
  }
}
