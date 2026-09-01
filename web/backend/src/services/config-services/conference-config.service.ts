/**
 * Conference Configuration Service
 * Handles conference/message area configuration
 */

import type { Database } from '../../database';
import { readTooltypeMap } from '../../utils/info-file.util';
import type { ConfigRepository } from '../../database/config-repository';
import { readConferenceFields } from './conference-info-file.service';
import type { ConferenceConfig } from '../../database/types';
import { ConferenceConfigSchema, type RequestContext } from '../config.schemas';
import { ConferenceSetupService } from '../conference-setup.service';
import { loadConfConfig } from '../conf-config.service';
import { notifyConferencesChanged } from '../conference-change-bus';
import { ConferenceRemovalService, type ConferenceRemovalOptions } from '../conference-removal.service';
import { config as appConfig } from '../../config';
import * as fs from 'fs';
import * as path from 'path';

export class ConferenceConfigService {
  private configRepo: ConfigRepository;
  private conferenceSetup: ConferenceSetupService;
  /**
   * One conference write at a time. Create, update and delete all
   * read-then-write the same files with awaits in between; two admins (or
   * an admin racing the change-bus refresh) could interleave and each be
   * told "success" about a board neither described. A promise chain is
   * enough - this is one process.
   */
  private writeLock: Promise<unknown> = Promise.resolve();

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const run = this.writeLock.then(work, work);
    this.writeLock = run.catch(() => undefined);
    return run;
  }

  private async createConferenceConfigImpl(
    config: Omit<ConferenceConfig, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<ConferenceConfig> {
    return this.serialize(() => this.createConferenceConfigImpl(config, context));
  }

  private async updateConferenceConfigImpl(
    conferenceId: number,
    updates: Partial<ConferenceConfig>,
    context: RequestContext
  ): Promise<ConferenceConfig> {
    return this.serialize(() => this.updateConferenceConfigImpl(conferenceId, updates, context));
  }

  deleteConferenceConfig(
    conferenceId: number,
    context: RequestContext,
    options: ConferenceRemovalOptions = {}
  ): Promise<{
    deleted: boolean;
    keptOnDisk: string | null;
    filesRemoved: string | null;
    renumbered: boolean;
    usersMigrated: number;
    nconfs: number;
  }> {
    return this.serialize(() => this.deleteConferenceConfigImpl(conferenceId, context, options));
  }

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
    const bbsRoot = appConfig.get('dataDir');
    this.conferenceSetup = new ConferenceSetupService(bbsRoot);
  }

  /**
   * Resolve the conference the admin is pointing at.
   *
   * The list comes from ConfConfig.info and Conf<N>.info, where the id is the
   * conference NUMBER. Looking that up as a conference_config rowid is a
   * different namespace: this board has Conf1..14.info against three rows, so
   * conferences 4-14 could not be edited at all. Disk first, mirror as the
   * fallback - the same resolution the computer, language, file checker,
   * screen type and drive services use.
   */
  async getConferenceConfig(conferenceId: number): Promise<ConferenceConfig | null> {
    const onDisk = await this.getConferenceConfigs();
    const fromDisk = onDisk.find(c => c.conference_id === conferenceId || c.id === conferenceId);
    if (fromDisk) return fromDisk;

    return this.configRepo.getConferenceConfig(conferenceId);
  }

  async getConferenceConfigs(): Promise<ConferenceConfig[]> {
    const bbsRoot = appConfig.get('dataDir');
    const confConfig = loadConfConfig(bbsRoot);

    if (!confConfig || confConfig.confCount === 0) {
console.warn('[ConferenceConfigService] ConfConfig.info not found or empty');
      return this.configRepo.getConferenceConfigs();
    }

    const configs: ConferenceConfig[] = [];

    for (let i = 1; i <= confConfig.confCount; i++) {
      const confInfoPath = path.join(bbsRoot, `Conf${i}.info`);

      if (!fs.existsSync(confInfoPath)) {
console.warn(`[ConferenceConfigService] Conf${i}.info not found, skipping`);
        continue;
      }

      try {
        const stats = fs.statSync(confInfoPath);
        const toolTypes = readTooltypeMap(confInfoPath);

        // Reader and writer share one map of field -> tooltype, so the two
        // cannot drift apart again. They had: six settings were written under
        // one spelling and read back from another.
        const fromDisk = readConferenceFields(toolTypes);

        const config: ConferenceConfig = {
          id: i,
          conference_id: i,
          name: confConfig.entries[i - 1]?.name || `Conference ${i}`,
          // The directory this conference reads. The admin derives its default
          // file-area paths from it, and on a renumbered board it is not
          // `Conf<n>` - conference 1 can live in Conf2/.
          location: confConfig.entries[i - 1]?.location || `BBS:Conf${i}/`,
          ndirs: fromDisk.ndirs,
          dlpath_1: fromDisk.dlpaths[1],
          dlpath_2: fromDisk.dlpaths[2],
          dlpath_3: fromDisk.dlpaths[3],
          dlpath_4: fromDisk.dlpaths[4],
          dlpath_5: fromDisk.dlpaths[5],
          dlpath_6: fromDisk.dlpaths[6],
          dlpath_7: fromDisk.dlpaths[7],
          dlpath_8: fromDisk.dlpaths[8],
          dlpath_9: fromDisk.dlpaths[9],
          dlpath_10: fromDisk.dlpaths[10],
          dlpath_11: fromDisk.dlpaths[11],
          dlpath_12: fromDisk.dlpaths[12],
          dlpath_13: fromDisk.dlpaths[13],
          dlpath_14: fromDisk.dlpaths[14],
          dlpath_15: fromDisk.dlpaths[15],
          dlpath_16: fromDisk.dlpaths[16],
          ulpath_1: fromDisk.ulpaths[1],
          ulpath_2: fromDisk.ulpaths[2],
          ulpath_3: fromDisk.ulpaths[3],
          ulpath_4: fromDisk.ulpaths[4],
          ulpath_5: fromDisk.ulpaths[5],
          ulpath_6: fromDisk.ulpaths[6],
          ulpath_7: fromDisk.ulpaths[7],
          ulpath_8: fromDisk.ulpaths[8],
          ulpath_9: fromDisk.ulpaths[9],
          ulpath_10: fromDisk.ulpaths[10],
          ulpath_11: fromDisk.ulpaths[11],
          ulpath_12: fromDisk.ulpaths[12],
          ulpath_13: fromDisk.ulpaths[13],
          ulpath_14: fromDisk.ulpaths[14],
          ulpath_15: fromDisk.ulpaths[15],
          ulpath_16: fromDisk.ulpaths[16],
          force_newscan: fromDisk.force_newscan,
          no_newscan: fromDisk.no_newscan,
          show_new_files: fromDisk.show_new_files,
          no_new_files: fromDisk.no_new_files,
          // All four DO have a tooltype, and all four are read from the
          // conference's own icon: FREEDOWNLOADS (express.e:5010), USERNAME
          // (:4081), REALNAME (:4083), INTERNETNAME (:5022). Serving fixed
          // values here meant the form could not show what the board does.
          free_downloads: fromDisk.free_downloads,
          exclude_ftp: fromDisk.exclude_ftp,
          private_conf: fromDisk.private_conf,
          read_only: fromDisk.read_only,
          menu_prompt: fromDisk.menu_prompt,
          confdb_shared: fromDisk.confdb_shared,
          use_username: fromDisk.use_username,
          use_realname: fromDisk.use_realname,
          use_internetname: fromDisk.use_internetname,
          min_access_level: fromDisk.min_access_level,
          max_access_level: fromDisk.max_access_level,
          created_at: stats.birthtime,
          updated_at: stats.mtime
        };

        configs.push(config);
      } catch (error) {
console.error(`[ConferenceConfigService] Error reading Conf${i}.info:`, error);
      }
    }

console.log(`[ConferenceConfigService] Loaded ${configs.length} conferences`);
    return configs;
  }

  async createConferenceConfig(
    config: Omit<ConferenceConfig, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<ConferenceConfig> {
    const validated = ConferenceConfigSchema.parse(config) as Omit<ConferenceConfig, 'id' | 'created_at' | 'updated_at'>;
    const conferenceId = validated.conference_id;

    const bbsRoot = appConfig.get('dataDir');
    const confConfig = loadConfConfig(bbsRoot);

    // The id is NOT the client's to choose. NCONFS is a count, so the only
    // id a create can mean is count+1; anything lower is an EXISTING
    // conference - the old code found its entry, reused its directory, and
    // updateConfConfig then overwrote its NAME with the new one. Two admins
    // with stale dialogs did exactly that. Anything higher left a stray
    // Conf<N>.info landmine after the too-high check fired post-mutation.
    const nconfs = confConfig?.entries.length ?? 0;
    if (conferenceId !== nconfs + 1) {
      throw new Error(
        `Conference ${conferenceId} cannot be created: this board has ${nconfs}, so the ` +
        `next conference is ${nconfs + 1}. Reload the page and try again.`
      );
    }

    // The runtime derives message and bulletin paths from the conference
    // NUMBER (MessageFileManager, bbs-paths.util), so the directory must be
    // Conf<id> - anything else posts one conference's messages into
    // another's base. When Conf<id> is already some conference's home (the
    // board renumbered and directories stayed put), creating is refused
    // until the drift is healed rather than armed.
    const wantedDir = `Conf${conferenceId}`;
    const dirOwner = (confConfig?.entries ?? []).findIndex(e =>
      (e.location || '').replace(/^.*:/, '').replace(/\/+$/, '').toLowerCase() === wantedDir.toLowerCase()
    );
    if (dirOwner >= 0) {
      throw new Error(
        `Cannot create conference ${conferenceId}: its directory ${wantedDir} is conference ` +
        `${dirOwner + 1} (${confConfig?.entries[dirOwner]?.name ?? 'unnamed'})'s home. ` +
        `The board's numbers and directories have drifted apart after a removal.`
      );
    }

    const conferenceName = validated.name?.trim() || `Conference ${conferenceId}`;
    const location = `BBS:${wantedDir}/`;

    // DISK FIRST, then the mirror, then the config row - in that order,
    // because the order is what the database enforces.
    //
    // This used to insert the conference_config row first, and
    // conference_config.conference_id REFERENCES conferences(id)
    // (database.ts:1650). It only ever worked because the mirror happened to
    // carry rows for conferences that no longer existed; the moment those
    // were pruned, creating a conference answered "FOREIGN KEY constraint
    // failed". A row describing a conference the mirror has never heard of
    // was always wrong - the constraint was right and the order was not.
    await this.conferenceSetup.setupConference({
      conferenceId,
      conferenceName,
      location,
      ndirs: validated.ndirs || 1,
      minAccessLevel: validated.min_access_level || 0,
      maxAccessLevel: validated.max_access_level || 255,
      forceNewscan: validated.force_newscan || false,
      excludeFTP: validated.exclude_ftp || false,
      privateConf: validated.private_conf || false,
      readOnly: validated.read_only || false
    });
console.log(`[ConferenceConfigService] Created Conf${conferenceId}.info`);

    // Registered only once the files exist: the opposite order leaves a named
    // conference with nothing behind it if the setup fails, which is the ghost
    // state the delete bug used to produce. An unregistered directory is
    // harmless by comparison.
    //
    // And no try/catch around either: a conference that is not on disk does
    // not exist, so swallowing the failure and writing a config row for it
    // would report success for nothing.
    await this.conferenceSetup.updateConfConfig(conferenceId, conferenceName, location, {
      allowGrow: true,
    });
console.log(`[ConferenceConfigService] Registered conference ${conferenceId} in ConfConfig.info`);

    // Rebuilds the board's list and mirrors the new conference into the
    // conferences table, which is what the config row below points at.
    await this.refreshRunningBoard();

    // Explicitly, not as a side effect of the refresh: that reaches the mirror
    // through the change bus, which only carries anything once the server has
    // booted and subscribed. The foreign key does not care why the row is
    // missing.
    this.database.ensureConferenceRow(conferenceId, conferenceName, location);

    const newConfig = this.configRepo.createConferenceConfig(validated);

    this.configRepo.logConfigChange('conference_config', newConfig.id, 'CREATE',
      context.userId, context.username, undefined, newConfig,
      context.ipAddress, context.userAgent);

    return newConfig;
  }

  /**
   * Tell the running board what changed on disk.
   *
   * The conference list every handler holds is built from ConfConfig.info at
   * startup and was never rebuilt, so a rename here reached the file and not
   * the board: "Lamer Zone" stayed "Lamer Zone" on J until the next deploy
   * restarted the container. Disk is the source of truth and those arrays are
   * caches of it; a cache nothing can invalidate is the bug.
   *
   * Through the bus rather than by importing the server's own refresh: that
   * import boots a second copy of the BBS - see conference-change-bus.
   * Best-effort, because a stale name must never fail a write that already
   * succeeded on disk.
   */
  private async refreshRunningBoard(): Promise<void> {
    try {
      await notifyConferencesChanged();
    } catch (error) {
console.error('[ConferenceConfigService] Conference list refresh failed (disk is correct):', error);
    }
  }

  async updateConferenceConfig(
    conferenceId: number,
    updates: Partial<ConferenceConfig>,
    context: RequestContext
  ): Promise<ConferenceConfig> {
    const validated = ConferenceConfigSchema.partial().parse(updates);
    const oldConfig = await this.getConferenceConfig(conferenceId);
    if (!oldConfig) throw new Error(`Conference config ${conferenceId} not found`);

    const confInfoUpdates: any = {};
    if (validated.ndirs !== undefined) confInfoUpdates.ndirs = validated.ndirs;
    if (validated.min_access_level !== undefined) confInfoUpdates.minAccessLevel = validated.min_access_level;
    if (validated.max_access_level !== undefined) confInfoUpdates.maxAccessLevel = validated.max_access_level;
    if (validated.force_newscan !== undefined) confInfoUpdates.forceNewscan = validated.force_newscan;
    if (validated.exclude_ftp !== undefined) confInfoUpdates.excludeFTP = validated.exclude_ftp;
    if (validated.private_conf !== undefined) confInfoUpdates.privateConf = validated.private_conf;
    if (validated.read_only !== undefined) confInfoUpdates.readOnly = validated.read_only;
    const conf = validated as Record<string, unknown>;
    for (const field of ['free_downloads', 'use_username', 'use_realname', 'use_internetname']) {
      if (conf[field] !== undefined) confInfoUpdates[field] = conf[field];
    }

    const dlpaths: { [key: number]: string } = {};
    const ulpaths: { [key: number]: string } = {};
    const validatedAny = validated as any;
    for (let i = 1; i <= 16; i++) {
      const dlKey = `dlpath_${i}`;
      const ulKey = `ulpath_${i}`;
      // An EMPTY path is a change: it clears the file area. Testing the
      // string for truth meant a path could be set and never removed - the
      // sysop cleared the field, the form said saved, the path stayed.
      if (typeof validatedAny[dlKey] === 'string') {
        dlpaths[i] = validatedAny[dlKey];
      }
      if (typeof validatedAny[ulKey] === 'string') {
        ulpaths[i] = validatedAny[ulKey];
      }
    }
    if (Object.keys(dlpaths).length > 0) confInfoUpdates.dlpaths = dlpaths;
    if (Object.keys(ulpaths).length > 0) confInfoUpdates.ulpaths = ulpaths;

    if (Object.keys(confInfoUpdates).length > 0) {
      await this.conferenceSetup.updateConferenceInfoFile(conferenceId, confInfoUpdates);
    }

    // The NAME is not in Conf<N>.info: express.e:31852 reads it as NAME.n out
    // of ConfConfig.info. It was not declared by the schema, so it was
    // stripped before reaching any writer and renaming a conference in the
    // admin did nothing. The LOCATION is carried through unchanged - the same
    // call writes both, and passing an empty one would erase the conference's
    // directory (express.e:31861).
    const renamed = (validated as { name?: string }).name;
    if (renamed !== undefined && renamed !== oldConfig.name) {
      const bbsRoot = appConfig.get('dataDir');
      const entries = loadConfConfig(bbsRoot)?.entries ?? [];
      const entry = entries[conferenceId - 1];
      if (!entry) {
        // A rename can only rename something ConfConfig.info has. Reaching
        // here with a mirror-only row used to GROW the board and write an
        // empty LOCATION - a ghost conference whose directory the next
        // refresh guessed by number.
        throw new Error(
          `Conference ${conferenceId} is not in ConfConfig.info - it cannot be renamed. ` +
          `The mirror row is stale; a restart will prune it.`
        );
      }
      const taken = entries.findIndex(
        (e, i) => i !== conferenceId - 1 && (e.name || '').trim().toLowerCase() === renamed.trim().toLowerCase()
      );
      if (taken >= 0) {
        // Disk would accept the duplicate; the mirror's UNIQUE(name) then
        // fails silently and the two disagree forever. Refuse with the facts.
        throw new Error(`Conference ${taken + 1} is already named "${renamed}".`);
      }
      await this.conferenceSetup.updateConfConfig(conferenceId, renamed, entry.location || `BBS:Conf${conferenceId}/`);
    }

    // The mirror is best-effort and comes AFTER the disk write: a conference
    // that only exists on disk has no row, and that must not turn a
    // successful save into an error.
    let mirrored: ConferenceConfig | null = null;
    try {
      mirrored = this.configRepo.updateConferenceConfig(conferenceId, validated);
    } catch (mirrorError) {
console.error(`[ConferenceConfigService] Mirror update failed for conference ${conferenceId} (disk write succeeded):`, mirrorError);
    }

    const newConfig: ConferenceConfig = mirrored ?? { ...oldConfig, ...validated };

    this.configRepo.logConfigChange('conference_config', newConfig.id, 'UPDATE',
      context.userId, context.username, oldConfig, newConfig,
      context.ipAddress, context.userAgent);

    await this.refreshRunningBoard();

    return newConfig;
  }

  /**
   * Remove a conference, from any position.
   *
   * This used to refuse anything but the last one. The refusal was honest -
   * a conference is a POSITION, and renumbering moves what every account can
   * reach - but it left the sysop stuck: on a fourteen-conference board,
   * removing number three meant removing eleven others first.
   *
   * So the renumbering is done properly instead, by ConferenceRemovalService,
   * which moves EVERYTHING keyed by position together: the conference list,
   * the icons, every account's access string, the per-user read pointers and
   * the Amiga-side Conf.DB. It copies all of that first.
   *
   * The conference's DIRECTORY is still a separate decision, because it holds
   * every message posted there and every file uploaded to it. It is kept
   * unless the caller asks for it, and reported either way.
   */
  private async deleteConferenceConfigImpl(
    conferenceId: number,
    context: RequestContext,
    options: ConferenceRemovalOptions = {}
  ): Promise<{
    deleted: boolean;
    keptOnDisk: string | null;
    filesRemoved: string | null;
    renumbered: boolean;
    usersMigrated: number;
    nconfs: number;
  }> {
    const oldConfig = await this.getConferenceConfig(conferenceId);
    if (!oldConfig) {
      return {
        deleted: false,
        keptOnDisk: null,
        filesRemoved: null,
        renumbered: false,
        usersMigrated: 0,
        nconfs: 0,
      };
    }

    const bbsRoot = appConfig.get('dataDir');

    // Imported here rather than at the top of the file. Both are module-level
    // singletons that construct on import, and pulling them into this
    // module's import graph took tests/api/config-routes.test.ts from twelve
    // passing tests to a suite that could not start at all. A write path runs
    // rarely; an import runs every time anything touches this service.
    const { userFileManager } = await import('../UserFileManager');
    const { conferenceFileManager } = await import('../ConferenceFileManager');

    const removal = new ConferenceRemovalService(bbsRoot, {
      users: userFileManager,
      sqlite: (this.database as unknown as { db?: { prepare(sql: string): { run(...p: unknown[]): unknown } } }).db,
      confDb: conferenceFileManager,
    });

    // Disk first, and it throws before touching anything if the conference
    // does not exist or is the last one standing.
    const result = await removal.remove(conferenceId, options);

    // The mirror is best-effort and comes last: a conference that only ever
    // existed on disk has no row, and that must not turn a completed removal
    // into an error.
    try {
      this.configRepo.deleteConferenceConfig(conferenceId);
    } catch (mirrorError) {
console.error(`[ConferenceConfigService] Mirror delete failed for conference ${conferenceId} (disk already updated):`, mirrorError);
    }

    this.configRepo.logConfigChange('conference_config', oldConfig.id, 'DELETE',
      context.userId, context.username, oldConfig, undefined,
      context.ipAddress, context.userAgent);

    await this.refreshRunningBoard();

    return {
      deleted: true,
      keptOnDisk: result.keptOnDisk,
      filesRemoved: result.filesRemoved,
      renumbered: result.renumbered,
      usersMigrated: result.usersMigrated,
      nconfs: result.nconfs,
    };
  }
}

