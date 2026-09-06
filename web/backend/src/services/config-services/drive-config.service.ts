/**
 * Drive Configuration Service
 * Handles drive path configuration (Drives.info / TOOLTYPE_DRIVES)
 *
 * Task 11 turned this from a path-only list into the surface that configures
 * and watches the pool: every DRIVE.n sub-key `volume-config.ts` parses (kind,
 * quota, class, egress, retention, key id, request budget), the bytes the
 * catalog actually holds on each drive, whether the live process has marked
 * it degraded or out of requests, and the operator actions - a write-only
 * secret, a connectivity test, a contents listing, and pool-wide status
 * (parked files, eviction shortfall, areas a mis-numbered STORAGEDRIVE has
 * broken).
 */

import type { Database } from '../../database';
import { getSystemTime } from '../../utils/date-time.util';
import type { ConfigRepository } from '../../database/config-repository';
import type { DriveConfig, FileEntry } from '../../database/types';
import { DriveConfigSchema, type RequestContext } from '../config.schemas';
import { applyTooltypes, readTooltypeMap } from '../../utils/info-file.util';
import { mergeForWrite } from './config-merge.util';
import { config as appConfig } from '../../config';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseVolumes,
  readVolumeSecret,
  type EgressPosture,
  type StorageVolume,
  type VolumeClass,
} from '../../storage/volume-config';
import { getStorageContext, getStorageBootError } from '../../storage/storage-context';
import type { StorageBackend } from '../../storage/storage-backend';
import { LocalBackend } from '../../storage/local-backend';
import { createS3Backend } from '../../storage/s3-backend';
import { remoteAreaFromDisk, usableRemoteAreasFor } from '../../storage/remote-areas';
import { loadFileAreasFromDisk } from '../file-areas-loader';
import { loadConfConfig } from '../conf-config.service';
import { VolumeSet } from '../../storage/volume-set';
import { refreshStorageContext } from '../../storage';

/** `GET /api/config/drives` - a drive, decorated with the pool facts the page shows. */
export interface DriveConfigView extends DriveConfig {
  kind: 'local' | 's3';
  quotaBytes?: number;
  /** From the catalog (`SUM(size) WHERE storage_volume = n`), never the in-process counter. */
  usedBytes: number;
  volumeClass: VolumeClass;
  egress: EgressPosture;
  retentionDays?: number;
  keyId?: string;
  requestBudget?: number;
  /**
   * Undefined until the storage subsystem is live in this process (Task 12).
   * Once live: an IN-PROCESS counter, incremented by `FileCache.ensureLocal`
   * / `writeBack` (every download/upload that actually reaches the volume)
   * and by `testVolume`'s connectivity probe - never read from the provider,
   * never persisted. It resets to 0 on every restart and undercounts a month
   * that spans one, and it does NOT yet count `NameIndex.refresh()`'s
   * listing calls (storage/name-index.ts), so treat it as a LOWER BOUND on
   * the real request count, not an exact meter - see CONFIGURATION.md.
   */
  requestsThisMonth?: number;
  /**
   * Whether `Storage/<n>.key` (or `BBS_STORAGE_<n>_SECRET`) resolves to a
   * non-empty secret. False for a `local` drive is meaningless - only an s3
   * drive is ever gated on this - but the field is always populated so a
   * caller never has to special-case `kind` to read it safely.
   */
  secretConfigured: boolean;
  /**
   * Whether this drive is actually IN the running board's VolumeSet, not
   * merely listed in Drives.info. `VolumeSet.fromBoard` (volume-set.ts:59-70)
   * silently drops a volume with no secret, no KEYID, no ENDPOINT, or a
   * malformed target - Drives.info still names it, but no read or write path
   * can reach it. `undefined` means no live context exists to ask (Task 12
   * has not booted one yet) - that is a THIRD state, never collapsed into
   * true or false.
   */
  inPool?: boolean;
  /**
   * Only known when the storage subsystem is live in this process (Task 12).
   * Both default to `false` when there is no live context - NOT because the
   * drive is healthy, but because nothing has looked. A caller that needs to
   * tell "healthy" apart from "unknown" reads `inPool` alongside these, the
   * same way `hasPool()`/`byNumber()` keep VolumeSet's own 0s from being
   * misread (volume-set.ts:174-182).
   */
  degraded: boolean;
  outOfRequests: boolean;
}

/** A quarantined file, for the admin page - see `FileCache.parkedFiles`. */
export interface ParkedFileView {
  driveNumber: number;
  /** A DISPLAY LABEL, not the pool object's key - see FileCache.discardParked. */
  label: string;
  localPath: string;
  sizeBytes: number;
}

export interface PoolStatus {
  /** False before Task 12 wires the subsystem into the board, or on a board with no pool. */
  cacheActive: boolean;
  overBudgetBytes: number;
  evictionDisabled: boolean;
  parkedFiles: ParkedFileView[];
  /**
   * Every complaint `usableRemoteAreasFor` (Task 8) would emit for the live
   * download path - a mis-numbered STORAGEDRIVE or a prefix collision - kept
   * verbatim rather than re-derived into a narrower, structured subset. See
   * `getPoolStatus`.
   */
  brokenAreas: string[];
  /**
   * Task 12 review, finding 5, extended in the Blocker B follow-up.
   * Non-null exactly when the LAST build/refresh attempt threw; cleared on
   * the next successful one. Two shapes, told apart by `cacheActive`:
   *
   *   - `cacheActive: false` and `bootError` set - the pool has never built
   *     successfully in this process. Distinct from "not configured", the
   *     original finding 5 gap.
   *   - `cacheActive: true` and `bootError` set - a LATER refresh (a
   *     conference save, a Drives.info write) failed, but the board is
   *     still serving the pool the last successful build produced. A
   *     Drives.info typo or a read-only disk must not tear down a healthy
   *     pool - see `refreshStorageContext`'s Blocker B handling.
   */
  bootError: string | null;
  /**
   * How many staged uploads `FileCache` still owes the pool right now -
   * `FileCache.pendingCount()`. The non-blocking replay
   * `refreshStorageContext` fires has no return value any caller sees, and
   * its own per-entry failure is silent by design (see `flushPending`), so
   * this is the one place a sysop can tell "uploads are stuck" from the
   * admin page rather than from the log. Undefined with no live context,
   * same third-state convention as `inPool`/`degraded`.
   */
  pendingUploads?: number;
}

export class DriveConfigService {
  private configRepo: ConfigRepository;

  constructor(
    private database: Database,
    /**
     * Testing seam: overrides how `testVolume` builds an s3 backend, so a
     * test can hand it a fake rather than a real AWS client. Defaults to
     * `createS3Backend`, same as `VolumeSet.fromBoard`'s own seam
     * (storage/volume-set.ts) - production never sets this.
     */
    private readonly backendFactory: (volume: StorageVolume, secret: string) => StorageBackend = createS3Backend
  ) {
    this.configRepo = database.getConfigRepository();
  }

  async getAllDrives(): Promise<DriveConfigView[]> {
    // DISK-BASED: Load from Drives.info, the same file the board itself reads.
    const bbsRoot = appConfig.get('dataDir');
    const drivesInfoPath = path.join(bbsRoot, 'Drives.info');

    if (!fs.existsSync(drivesInfoPath)) {
      return [];
    }

    const stats = fs.statSync(drivesInfoPath);
    // parseVolumes throws on a malformed QUOTA/RETENTION/REQUESTS line by
    // design (volume-config.ts) - that is a Drives.info the board itself
    // cannot boot the pool from, and the sysop needs to see exactly which
    // line is wrong, not a page that silently fell back to a stale mirror.
    const volumes = parseVolumes(bbsRoot);
    // Optional on purpose: a Database built without the file repository - the
    // shape several config suites construct, and the shape during early boot -
    // has no usedBytesByVolume. Calling it unguarded turned every Drives.info
    // READ into a TypeError, and every write through it into a swallowed
    // no-op. An unknown used figure is 0, not a crash.
    const usedByVolume = this.database.usedBytesByVolume?.() ?? new Map<number, number>();
    const live = getStorageContext();

    return volumes.map((volume): DriveConfigView => {
      const liveState = live?.volumes.byNumber(volume.driveNumber);
      return {
        id: volume.driveNumber,
        drive_number: volume.driveNumber,
        drive_path: volume.kind === 's3' ? `s3://${volume.path}` : volume.path,
        enabled: true,
        created_at: stats.birthtime,
        updated_at: stats.mtime,
        kind: volume.kind,
        quotaBytes: volume.quotaBytes,
        usedBytes: usedByVolume.get(volume.driveNumber) ?? 0,
        volumeClass: volume.volumeClass,
        egress: volume.egress,
        retentionDays: volume.retentionDays,
        keyId: volume.keyId,
        // Served so Edit Drive can show what the bucket is actually pointed
        // at. Without these the dialog could only offer a path and a
        // description, and every other setting had to be read out of
        // Drives.info by hand.
        endpoint: volume.endpoint,
        region: volume.region,
        requestBudget: volume.requestBudget,
        requestsThisMonth: liveState?.requestsThisMonth,
        // A local drive has no secret concept; reporting true keeps every
        // consumer from having to special-case `kind` before trusting this.
        secretConfigured: volume.kind === 'local' || readVolumeSecret(bbsRoot, volume.driveNumber) !== null,
        inPool: live ? liveState !== undefined : undefined,
        degraded: liveState?.degraded ?? false,
        outOfRequests: live?.volumes.isOutOfRequests(volume.driveNumber) ?? false,
      };
    });
  }

  /** A view built from the DB mirror alone - a drive `getAllDrives` has not seen on disk yet. */
  private toDefaultView(drive: DriveConfig): DriveConfigView {
    return {
      ...drive,
      kind: 'local',
      quotaBytes: undefined,
      usedBytes: 0,
      volumeClass: 'PAID',
      egress: 'METERED',
      retentionDays: undefined,
      keyId: undefined,
      requestBudget: undefined,
      requestsThisMonth: undefined,
      secretConfigured: true, // 'local' default - see the field's own comment.
      inPool: undefined,
      degraded: false,
      outOfRequests: false,
    };
  }

  /**
   * Resolve the drive the admin is pointing at.
   *
   * The list this id came from is the one on DISK, where the id is the entry's
   * position (== its drive number). Looking that number up as a database
   * rowid is a different namespace: with the table empty every edit throws
   * "not found", and with the table partly filled it edits a DIFFERENT
   * record. Disk first, mirror as the fallback - the same resolution
   * ComputerConfigService.getComputerType uses, and the same fault the doors
   * page had.
   */
  async getDrive(id: number): Promise<DriveConfigView | null> {
    const onDisk = await this.getAllDrives();
    const fromDisk = onDisk.find(d => d.id === id);
    if (fromDisk) return fromDisk;

    const fromDb = await this.configRepo.getDriveById(id);
    return fromDb ? this.toDefaultView(fromDb) : null;
  }

  async getDriveByNumber(driveNumber: number): Promise<DriveConfig | null> {
    return this.configRepo.getDriveByNumber(driveNumber);
  }

  async createDrive(
    drive: Omit<DriveConfig, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<DriveConfig> {
    // Validate input
    const validated = DriveConfigSchema.parse(drive);

    // Check for duplicate drive number
    const existing = await this.getDriveByNumber(validated.drive_number);
    if (existing) {
      throw new Error(`Drive number ${validated.drive_number} already exists`);
    }

    // Create in database
    const id = this.configRepo.createDrive({
      drive_number: validated.drive_number,
      drive_path: validated.drive_path,
      enabled: validated.enabled ?? true,
      description: validated.description
    });

    // `getDrive(id)` resolves DISK-FIRST BY DRIVE NUMBER (see its own doc) -
    // `id` here is the mirror table's SQLite rowid, a completely different
    // namespace. On a board whose mirror table is emptier than its on-disk
    // drive numbers (the normal case now this page is disk-authoritative),
    // the rowid can coincide with an EXISTING on-disk drive number and
    // resolve THAT drive instead of the one just created - Drives.info
    // would then be rewritten with the existing drive's own entry (a
    // no-op) while the drive_number the sysop actually asked for is never
    // written at all, yet this call reports success. Resolve by the number
    // that was actually validated and inserted, not by the rowid.
    const fromDb = this.configRepo.getDriveByNumber(validated.drive_number);
    const newDrive = fromDb ? this.toDefaultView(fromDb) : null;
    if (!newDrive) {
      throw new Error('Failed to create drive');
    }

    // DISK-BASED: merge the new drive over what Drives.info already holds
    await this.writeDrivesInfoFile({ entry: newDrive });

    // Log change
    this.configRepo.logConfigChange(
      'drives',
      id,
      'CREATE',
      context.userId,
      context.username,
      undefined,
      newDrive,
      context.ipAddress,
      context.userAgent
    );

    return newDrive;
  }

  async updateDrive(
    id: number,
    updates: Partial<DriveConfig>,
    context: RequestContext
  ): Promise<DriveConfig> {
    // Validate input
    const validated = DriveConfigSchema.partial().parse(updates);

    // Get old values
    const oldDrive = await this.getDrive(id);
    if (!oldDrive) {
      throw new Error(`Drive ${id} not found`);
    }

    // Check for duplicate drive number if changing
    if (validated.drive_number && validated.drive_number !== oldDrive.drive_number) {
      const existing = await this.getDriveByNumber(validated.drive_number);
      if (existing) {
        throw new Error(`Drive number ${validated.drive_number} already exists`);
      }

      // `writeDrivesInfoFile` renames only `DRIVE.n` itself - its removeKeys
      // regex `/^DRIVE\.\d+$/` deliberately spares DRIVE.n.QUOTA/KEYID/ENDPOINT
      // so an ordinary path edit does not strand them. A NUMBER change is the
      // one edit that regex cannot make safe: it would write DRIVE.<new> with
      // no credentials while DRIVE.<old>.KEYID/.ENDPOINT/etc sit dead under a
      // number nothing reads any more, and every area whose STORAGEDRIVE
      // named the old number breaks. Moving the sub-keys automatically is the
      // alternative; refusing is the one that cannot silently drop a working
      // bucket's credentials, which is why it wins here.
      if (oldDrive.kind === 's3') {
        throw new Error(
          `Drive ${oldDrive.drive_number} is an s3 volume - renumbering it would strand its ` +
            `QUOTA/KEYID/ENDPOINT/etc sub-keys under the old number and leave the new number with no ` +
            `credentials. Delete this drive and add it again under the new number instead, or renumber ` +
            `DRIVE.${oldDrive.drive_number}.* by hand in Drives.info before changing this.`
        );
      }
    }

    // The edit itself, not a value read back out of a store. getDrive resolves
    // against DISK, which still holds the old path at this point, so reading
    // back would have written the old value over the sysop's change.
    const newDrive: DriveConfig = {
      ...oldDrive,
      ...validated,
      updated_at: getSystemTime()
    };

    // DISK FIRST: Drives.info is what the BBS reads. The mirror holds no row
    // for a drive that only exists on disk, and `if (!success) throw` turned
    // that into "Failed to update drive" before the file was ever touched.
    await this.writeDrivesInfoFile({ entry: newDrive });

    try {
      this.configRepo.updateDrive(id, validated);
    } catch (mirrorError) {
console.error(`[DriveConfigService] Mirror update failed for drive ${id} (disk write succeeded):`, mirrorError);
    }

    // Log change
    this.configRepo.logConfigChange(
      'drives',
      id,
      'UPDATE',
      context.userId,
      context.username,
      oldDrive,
      newDrive,
      context.ipAddress,
      context.userAgent
    );

    return newDrive;
  }

  async deleteDrive(id: number, context: RequestContext): Promise<boolean> {
    // Get old values
    const oldDrive = await this.getDrive(id);
    if (!oldDrive) {
      return false;
    }

    // `parseVolumes` stops at the first gap in DRIVE.n - deliberate express.e
    // parity with freeDiskSpace() (volume-config.ts). Deleting a MIDDLE drive
    // number does not remove the drives numbered above it from Drives.info;
    // it makes the whole pool stop SEEING them, silently, from the very next
    // rebuild - every area whose STORAGEDRIVE names one of them then answers
    // "File not found" for files that are perfectly fine. Refuse rather than
    // create that gap; a sysop who really means to remove a middle drive can
    // still delete top-down.
    const bbsRoot = appConfig.get('dataDir');
    const strandedNumbers = parseVolumes(bbsRoot)
      .map(v => v.driveNumber)
      .filter(n => n > oldDrive.drive_number);
    if (strandedNumbers.length > 0) {
      const plural = strandedNumbers.length > 1;
      throw new Error(
        `Deleting DRIVE.${oldDrive.drive_number} would leave a gap in Drives.info, making ` +
          `DRIVE.${strandedNumbers.join(', DRIVE.')} invisible to the whole pool from the next rebuild ` +
          `on - every area on ${plural ? 'those drives' : 'that drive'} would start reporting its files ` +
          `as missing. Delete DRIVE.${strandedNumbers[strandedNumbers.length - 1]} down to ` +
          `DRIVE.${oldDrive.drive_number} first, highest number to lowest.`
      );
    }

    // Delete from the database MIRROR. Its change count is not the answer -
    // see below.
    this.configRepo.deleteDrive(id);

    // DISK-BASED: remove just this drive from what Drives.info already holds.
    // This comment used to claim the call throws on failure. It did not:
    // `writeDrivesInfoFile` wrapped its whole body in a catch that logged and
    // returned, so a read-only filesystem, a full disk or a `parseVolumes`
    // throw on a hand-edited Drives.info all ended here with `return true` -
    // the mirror row already deleted, a DELETE written to the audit log that
    // never happened, and the sysop told the drive was gone while the file
    // the board and every door read still named it. The writer now
    // propagates; reaching the next line means Drives.info really was
    // rewritten without this drive.
    await this.writeDrivesInfoFile({ removeNumber: oldDrive.drive_number });

    // Gate 2, blocker 5: this used to `return deleted` - the MIRROR ROW's
    // delete count - after Drives.info had already been rewritten. A drive
    // that exists only on disk (`getDrive` resolves it from disk first, and
    // every drive on a board that has never used the admin page is one) has
    // no mirror row, so the count was 0, the route answered
    // "Drive N not found", and the sysop saw an error per step while the
    // deletion had in fact happened. Top-down deletion - the escape hatch the
    // gap guard above tells them to use - is exactly the sequence that hits
    // it repeatedly. Disk is the truth on this board (Drives.info is what
    // `parseVolumes` and every door read); the mirror is a mirror.
    this.configRepo.logConfigChange(
      'drives',
      id,
      'DELETE',
      context.userId,
      context.username,
      oldDrive,
      undefined,
      context.ipAddress,
      context.userAgent
    );

    return true;
  }

  /**
   * Rewrite Drives.info.
   *
   * Disk first. This built the file from configRepo.getAllDrives() alone
   * while the page reads its list from Drives.info, which is the same
   * asymmetry that erased screen types, computer types and transfer
   * protocols: with a stale or empty drives table, saving one drive wiped
   * every drive that existed only on disk. The database is a mirror, and a
   * mirror that has fallen behind must not truncate what it mirrors.
   *
   * It also rebuilt the tooltype map from scratch, so any key in Drives.info
   * that is not a DRIVE.n - anything the sysop or another tool put there -
   * was dropped on every save.
   *
   * `change` describes what the caller just did: the drive they added or
   * edited, and the number they removed.
   *
   * IT THROWS WHEN THE FILE IS NOT WRITTEN. It used to catch everything and
   * return normally, which made all three callers - createDrive, updateDrive
   * and deleteDrive - report success over a Drives.info that had not changed.
   * Disk is the truth on this board, so a caller that cannot write disk has
   * not done the thing it is about to tell the sysop it did. The live
   * storage rebuild below is deliberately NOT part of that contract: the file
   * is already correct by then, and a bucket that cannot be reached must not
   * turn a completed write into a reported failure.
   */
  private async writeDrivesInfoFile(
    change: { entry?: DriveConfig; removeNumber?: number } = {}
  ): Promise<void> {
    const bbsRoot = appConfig.get('dataDir');
    const drivesInfoPath = path.join(bbsRoot, 'Drives.info');

    const onDisk = await this.getAllDrives();
    // ONLY the caller's entry. Handing mergeForWrite the whole mirror let it
    // overwrite and append as well as protect: a stale row rewrote an entry
    // the sysop never touched, and a row disk had never heard of was added
    // to the file. mergeForWrite exists to stop the mirror TRUNCATING disk,
    // not to make it a second source.
    const changed = change.entry ? [change.entry] : [];

    const merged = mergeForWrite(
      onDisk,
      changed,
      (drive: DriveConfig) => String(drive.drive_number),
      { remove: change.removeNumber !== undefined ? [String(change.removeNumber)] : [] }
    );

    // Only the DRIVE.n series is this writer's; applyTooltypes keeps the
    // icon and every other tooltype in the file, so there is nothing to
    // read back and re-assert.
    const toolTypes = new Map<string, string>();
    const managedSubKeys = new Set<string>();
    for (const drive of merged) {
      if (drive.enabled === false) continue;
      toolTypes.set(`DRIVE.${drive.drive_number}`, drive.drive_path);

      // A sub-key is written only when the caller supplied it. An absent one
      // is left exactly as the sysop hand-wrote it: a save that changes a
      // path must not silently clear an ENDPOINT or a QUOTA it never saw.
      const subKeys: Array<[string, string | undefined]> = [
        ['PROVIDER', drive.provider],
        ['ENDPOINT', drive.endpoint],
        ['REGION', drive.region],
        ['KEYID', drive.keyId],
        ['QUOTA', drive.quotaBytes !== undefined ? String(drive.quotaBytes) : undefined],
        ['CLASS', drive.volumeClass],
        ['EGRESS', drive.egress],
        ['RETENTION', drive.retentionDays !== undefined ? String(drive.retentionDays) : undefined],
        ['REQUESTS', drive.requestBudget !== undefined ? String(drive.requestBudget) : undefined],
      ];
      for (const [suffix, value] of subKeys) {
        if (value === undefined || value === '') continue;
        const key = `DRIVE.${drive.drive_number}.${suffix}`;
        toolTypes.set(key, value);
        managedSubKeys.add(key);
      }
    }

    applyTooltypes(drivesInfoPath, toolTypes, {
      // DRIVE.n itself is wholly this writer's, so a removed drive's line
      // goes. A sub-key is removed only when this write is REPLACING it -
      // never merely because this write did not mention it, which would
      // delete a sysop's hand-written ENDPOINT on an unrelated save.
      removeKeys: key => /^DRIVE\.\d+$/.test(key) || managedSubKeys.has(key),
    });

console.log(`[DriveConfigService] Wrote ${drivesInfoPath} with ${merged.length} drives`);

    // Best-effort, and only after the file is on disk: the write is what the
    // caller promised the sysop, and the next restart rebuilds the live pool
    // from the same file regardless.
    try {
      await this.refreshLiveStorage(bbsRoot);
    } catch (error) {
console.error(
        `[DriveConfigService] ${drivesInfoPath} was written, but rebuilding the live storage context failed:`,
        error
      );
    }
  }

  /**
   * Task 12 review, finding 4: a Drives.info write - a new drive, a changed
   * quota, a drive removed - used to reach only the on-disk file. The live
   * process kept running the VolumeSet it booted with until a restart, so
   * the page's own "Test" button could report a bucket reachable from a
   * fresh `buildBackendFor` while the running board still could not see it
   * at all. Rebuilding through the SAME `refreshStorageContext` boot and the
   * conference-change bus both use means a Drives.info write takes effect
   * for every caller at once, not just the next one to read disk.
   *
   * The area list is reloaded from disk here rather than reused from
   * whatever context happens to be live, for the same reason
   * `getPoolStatus` reloads it (below): this call must be correct even on
   * the very first bucket a board ever configures, when no live context
   * exists yet to read a list back from.
   */
  private async refreshLiveStorage(bbsRoot: string): Promise<void> {
    const conferences = this.conferencesForAreaScan(bbsRoot);
    const areas = loadFileAreasFromDisk(bbsRoot, conferences).map(remoteAreaFromDisk);
    await refreshStorageContext(bbsRoot, areas, {
      // Finding 2 of the whole-branch review: usedBytes is re-seeded from
      // the catalog on every build now, not carried across a rebuild - see
      // storage/index.ts#carryLiveState. Every Drives.info write goes
      // through this same rebuild, so it must carry the seam too.
      usedBytesByVolume: () => this.database.usedBytesByVolume(),
    });
  }

  // ------------------------------------------------------------- the secret

  /**
   * Writes `Storage/<n>.key`, exactly the way `door-launch-token.ts:44-52`
   * writes `DoorRepo.token`: 0600 on the write itself and again via
   * `chmodSync`, tolerating a filesystem with no POSIX modes. The secret is
   * NEVER written into Drives.info - that file sits under the board root
   * where every door and every backup can read it, which is why
   * `volume-config.ts` keeps SECRET out of it in the first place.
   *
   * Refreshes the live storage context afterwards for the same reason
   * `writeDrivesInfoFile` does: a volume that was disabled for want of a
   * secret (`VolumeSet.fromBoard` warns and skips it) must not need a
   * restart to join the pool once the sysop supplies one.
   */
  async writeDriveSecret(driveNumber: number, secret: string): Promise<void> {
    const bbsRoot = appConfig.get('dataDir');
    const keyPath = path.join(bbsRoot, 'Storage', `${driveNumber}.key`);
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, `${secret}\n`, { encoding: 'utf8', mode: 0o600 });
    try {
      fs.chmodSync(keyPath, 0o600);
    } catch {
      // A filesystem without POSIX modes (a FAT-mounted volume, some Windows
      // setups) cannot narrow this; the board still runs.
    }
    await this.refreshLiveStorage(bbsRoot);
  }

  // --------------------------------------------------------------- testing

  private buildBackendFor(bbsRoot: string, driveNumber: number): StorageBackend {
    const volumes = parseVolumes(bbsRoot);
    const volume = volumes.find(v => v.driveNumber === driveNumber);
    if (!volume) throw new Error(`Drive ${driveNumber} not found`);
    if (volume.kind === 'local') return new LocalBackend(volume.driveNumber, volume.path);

    const secret = readVolumeSecret(bbsRoot, volume.driveNumber);
    if (!secret) throw new Error(`DRIVE.${driveNumber} has no secret configured`);
    return this.backendFactory(volume, secret);
  }

  /**
   * Proves a bucket is reachable with one round trip, not a promise of one.
   *
   * A local drive is a plain disk path with no network involved, so there is
   * nothing this test meaningfully exercises for `kind: 'local'` - it reports
   * reachable without touching the filesystem.
   *
   * For an s3 volume this calls `list()`, per the design this page was
   * planned against - but against a prefix a real area will not have used
   * (`__connectivity_probe__/`), not `''`. `StorageBackend.list` is
   * deliberately one of only five calls an adapter has to implement
   * (storage-backend.ts), so reusing it here rather than adding a sixth,
   * ping-only method is the right call; walking the WHOLE bucket on every
   * click of a "Test" button is not - that is real request-budget spend
   * against Oracle's 50,000-a-month ceiling for a button a sysop might click
   * repeatedly while debugging a bad key.
   */
  async testVolume(driveNumber: number): Promise<{ reachable: boolean; error?: string }> {
    const bbsRoot = appConfig.get('dataDir');
    let backend: StorageBackend;
    try {
      backend = this.buildBackendFor(bbsRoot, driveNumber);
    } catch (error) {
      return { reachable: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (backend instanceof LocalBackend) return { reachable: true };

    // `list()` below is one real request against the provider - the same
    // meter `FileCache.ensureLocal`/`writeBack` already count on every
    // download and upload (file-cache.ts:795, :961). Counted against the
    // LIVE pool's state when this process has booted one (Task 12), win or
    // lose: a failed call still spent the request, exactly as
    // `FakeBackend.charge()` models it in the test suite. A board that has
    // not booted a pool yet (or is testing a drive number Drives.info does
    // not have live) has nothing to count against, and that is fine - the
    // admin page shows no figure for a volume with no live state either.
    const countRequest = (): void => {
      const state = getStorageContext()?.volumes.byNumber(driveNumber);
      if (state) state.requestsThisMonth++;
    };

    try {
      await backend.list('__connectivity_probe__/');
      countRequest();
      return { reachable: true };
    } catch (error) {
      countRequest();
      return { reachable: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // -------------------------------------------------------------- contents

  /** The catalog rows on one drive - "what would be lost if this volume disappeared". */
  async contentsOf(driveNumber: number): Promise<FileEntry[]> {
    return this.database.entriesOnVolume(driveNumber);
  }

  // ----------------------------------------------------------- pool status

  /**
   * Conferences for a file-area scan, straight off disk.
   *
   * The same two-tier fallback `server/initialization.ts#refreshConferencesFromDisk`
   * uses ahead of its Conf.DB-header and database tiers: ConfConfig.info
   * first, then whichever `Conf<N>.info` files exist. Calling that function
   * directly would pull in its side effects - syncing the conferences table,
   * rebinding module-level arrays other handlers hold live references to -
   * for what is here a read-only admin listing; the last-resort Conf.DB
   * header tier is a boot-time concern for a legacy import and is left out,
   * so a board relying on it alone will under-report broken areas here until
   * it also has a ConfConfig.info or Conf*.info files, which every board this
   * feature targets already does.
   */
  private conferencesForAreaScan(bbsRoot: string): Array<{ id: number; name: string }> {
    const confConfig = loadConfConfig(bbsRoot);
    if (confConfig && confConfig.confCount > 0) {
      return Array.from({ length: confConfig.confCount }, (_, i) => ({
        id: i + 1,
        name: confConfig.entries[i]?.name || `Conference ${i + 1}`,
      }));
    }
    let confFiles: string[];
    try {
      confFiles = fs.readdirSync(bbsRoot).filter(f => /^Conf\d+\.info$/.test(f));
    } catch {
      return [];
    }
    const numbers = confFiles
      .map(f => parseInt(f.match(/\d+/)?.[0] ?? '0', 10))
      .filter(n => n > 0);
    const max = numbers.length > 0 ? Math.max(...numbers) : 0;
    return Array.from({ length: max }, (_, i) => ({ id: i + 1, name: `Conference ${i + 1}` }));
  }

  private statSizeOf(localPath: string): number {
    try {
      return fs.statSync(localPath).size;
    } catch {
      return 0; // vanished under us; nothing to report
    }
  }

  /**
   * Pool-wide facts nothing else surfaces: quarantined files with their
   * sizes, bytes the cache could not evict, whether eviction itself has
   * stopped because it cannot read its pin record, and pooled areas
   * `usableRemoteAreasFor` (Task 8) has silently dropped.
   *
   * `brokenAreas` runs the REAL rule, not a second approximation of it -
   * every complaint `usableRemoteAreasFor` would emit for the live download
   * path, verbatim, for every conference. Re-deriving "is this drive
   * configured" from Drives.info alone was wrong: `VolumeSet.fromBoard`
   * (volume-set.ts:51-74) silently drops a volume with no secret, no KEYID,
   * no ENDPOINT or a malformed target, so a drive can be LISTED in
   * Drives.info and still be absent from the pool the board actually reads
   * through - the missing-secret case being the likeliest one in practice.
   * Answering "configured" for that drive made this page report
   * `brokenAreas: []` for an area the board had already silently fallen back
   * to local disk for.
   *
   * With a live context, the predicate is the SAME `byNumber(...) !==
   * undefined` `usable-areas.ts#usableAreasFor` uses, so page and board
   * cannot disagree. With no live context yet (Task 12 has not booted one),
   * a throwaway `VolumeSet.fromBoard` stands in - the actual construction
   * rule, not a partial copy of it, at the cost of repeating its
   * `console.warn` on every poll of this page, same tradeoff already
   * accepted for the per-request Conf-info re-read below.
   *
   * This answers even before Task 12 wires the subsystem into the running
   * board - a broken area is a fact about Drives.info and Conf*.info, not
   * about the live process. The rest needs a live `FileCache`, which does
   * not exist until Task 12 boots one; `cacheActive: false` says so rather
   * than reporting zeroes that would read as "nothing parked" when the true
   * answer is "nobody has looked yet".
   */
  async getPoolStatus(): Promise<PoolStatus> {
    const bbsRoot = appConfig.get('dataDir');
    const live = getStorageContext();
    const isConfiguredDrive: (driveNumber: number) => boolean = live
      ? (driveNumber) => live.volumes.byNumber(driveNumber) !== undefined
      : ((): ((driveNumber: number) => boolean) => {
          const standalone = VolumeSet.fromBoard(bbsRoot);
          return (driveNumber) => standalone.byNumber(driveNumber) !== undefined;
        })();

    const conferences = this.conferencesForAreaScan(bbsRoot);
    const areas = loadFileAreasFromDisk(bbsRoot, conferences).map(remoteAreaFromDisk);

    const brokenAreas: string[] = [];
    const collect = (message: string): void => {
      brokenAreas.push(message);
    };
    for (const conferenceId of new Set(areas.map((a) => a.conferenceId))) {
      usableRemoteAreasFor(conferenceId, areas, isConfiguredDrive, collect);
    }

    if (!live) {
      return {
        cacheActive: false,
        overBudgetBytes: 0,
        evictionDisabled: false,
        parkedFiles: [],
        brokenAreas,
        bootError: getStorageBootError(),
      };
    }

    const parkedFiles: ParkedFileView[] = live.cache.parkedFiles().map(f => ({
      driveNumber: f.driveNumber,
      label: f.key,
      localPath: f.localPath,
      sizeBytes: this.statSizeOf(f.localPath),
    }));

    return {
      cacheActive: true,
      overBudgetBytes: live.cache.overBudgetBytes(),
      evictionDisabled: live.cache.isEvictionDisabled(),
      parkedFiles,
      brokenAreas,
      // Blocker B: a LIVE context can still carry a boot error - a later
      // refresh failed and `refreshStorageContext` kept this (older, still
      // healthy) context running rather than tearing it down. Non-null here
      // means "the last refresh failed", not "the pool never built".
      bootError: getStorageBootError(),
      pendingUploads: live.cache.pendingCount(),
    };
  }

  /**
   * Permanently discards one quarantined file. See `FileCache.discardParked`:
   * `localPath` is the parked file's real identity, and the only one that is
   * safe to act on - never the display label `parkedFiles()` also carries.
   */
  async discardParkedFile(localPath: string): Promise<void> {
    const live = getStorageContext();
    if (!live) throw new Error('the storage cache is not active on this process');
    live.cache.discardParked(localPath);
  }
}
