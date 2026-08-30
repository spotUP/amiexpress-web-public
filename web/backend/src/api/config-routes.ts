/**
 * Configuration API Routes
 * REST API for BBS configuration management
 *
 * All routes require JWT authentication and sysop-level access
 * Base URL: /api/config
 */

import express, { Request, Response, NextFunction } from 'express';
import * as fsSync from 'fs';
import { parseInfoFile, writeInfoFile } from '../utils/info-file.util';
import { applyDoorFieldsToTooltypes, findDoorInfoFile, doorDisplayName } from '../services/config-services/door-info-file.service';
import { listAcsLevels, acsLevelFilePath, tooltypesToFlags, flagsToTooltypes } from '../services/config-services/acs-level-file.service';
import { ACS_PERMISSION_NAMES } from '../constants/acs-permissions';
// bcryptJS, not bcrypt. The rest of the backend uses bcryptjs and that is
// what package.json declares; this file alone required the NATIVE bcrypt,
// which is not a dependency - so every password written through the admin
// API threw "Cannot find module 'bcrypt'" in the container. The two produce
// interchangeable hashes, so existing passwords still verify.
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '../services/config.service';
import { ConferenceSetupService } from '../services/conference-setup.service';
import { BBSHealthCheckService } from '../services/bbs-health-check.service';
import { SSHKeyUtil } from '../utils/ssh-key.util';
import { userFileManager } from '../services/UserFileManager';
import type { Database } from '../database';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { getSystemTime } from '../utils/date-time.util';
import { isSensitiveField } from '../utils/secrets-encryption.util';

// Standard API response format
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

/**
 * Create configuration router
 */
export function createConfigRouter(database: Database): ReturnType<typeof express.Router> {
  const router = express.Router();
  const configService = new ConfigService(database);

  // Initialize services
  const bbsRoot = process.env.BBS_ROOT || path.join(process.cwd(), '../../');
  const conferenceSetup = new ConferenceSetupService(bbsRoot);
  const healthCheck = new BBSHealthCheckService(bbsRoot);

  // Extract request context from JWT token
  const getRequestContext = (req: any) => ({
    userId: req.user?.id,
    username: req.user?.username || 'unknown',
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  // Standard response wrapper
  const sendResponse = <T>(res: Response, data: T, message?: string) => {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message,
      timestamp: getSystemTime().toISOString()
    };
    res.json(response);
  };

  // Error handler wrapper
  const handleError = (res: Response, error: unknown) => {
console.error('Config API error:', error);

    const message = error instanceof Error ? error.message : 'An error occurred';
    const statusCode = message.includes('not found') ? 404 :
                       message.includes('already exists') ? 409 :
                       message.includes('must be') ? 400 : 500;

    const response: ApiResponse = {
      success: false,
      message,
      timestamp: getSystemTime().toISOString()
    };

    res.status(statusCode).json(response);
  };

  // ===== System Configuration =====

  /**
   * GET /api/config/system
   * Get system configuration
   */
  router.get('/system', async (req: Request, res: Response) => {
    try {
      const config = await configService.getSystemConfig();
      // Mask sensitive fields (smtp_password, reg_key, etc.) — never expose in GET response
      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(config as any)) {
        sanitized[key] = isSensitiveField(key) && value ? '***' : value;
      }
      sendResponse(res, sanitized);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/system/tooltypes
   *
   * Which tooltype in bbsConfig.info each field is written to, so the admin
   * form can show the key under the field it edits. Read-only, and derived
   * from the writer's own map rather than a copy of it.
   */
  router.get('/system/tooltypes', async (_req: Request, res: Response) => {
    try {
      const { getConfigTooltypeKeys } = require('../services/bbs-config-file.service');
      sendResponse(res, getConfigTooltypeKeys());
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/system
   * Update system configuration
   */
  router.put('/system', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const config = await configService.updateSystemConfig(req.body, context);
      sendResponse(res, config, 'System configuration updated');
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== Node Configuration =====

  /**
   * GET /api/config/nodes
   * Get all node configurations
   */
  router.get('/nodes', async (req: Request, res: Response) => {
    try {
      const configs = await configService.getNodeConfigs();
      sendResponse(res, configs);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/nodes/:nodeNumber
   * Get node configuration by node number
   */
  router.get('/nodes/:nodeNumber', async (req: Request, res: Response) => {
    try {
      const nodeNumber = parseInt(req.params.nodeNumber, 10);
      const config = await configService.getNodeConfig(nodeNumber);

      if (!config) {
        return handleError(res, new Error(`Node ${nodeNumber} not found`));
      }

      sendResponse(res, config);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/nodes
   * Create new node configuration
   */
  router.post('/nodes', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const config = await configService.createNodeConfig(req.body, context);
      sendResponse(res, config, 'Node configuration created');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/nodes/:nodeNumber
   * Update node configuration
   */
  router.put('/nodes/:nodeNumber', async (req: any, res: Response) => {
    try {
      const nodeNumber = parseInt(req.params.nodeNumber, 10);
      const context = getRequestContext(req);
      const config = await configService.updateNodeConfig(nodeNumber, req.body, context);
      sendResponse(res, config, 'Node configuration updated');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/nodes/:nodeNumber
   * Delete node configuration
   */
  router.delete('/nodes/:nodeNumber', async (req: any, res: Response) => {
    try {
      const nodeNumber = parseInt(req.params.nodeNumber, 10);
      const context = getRequestContext(req);
      const deleted = await configService.deleteNodeConfig(nodeNumber, context);

      if (!deleted) {
        return handleError(res, new Error(`Node ${nodeNumber} not found`));
      }

      sendResponse(res, { deleted: true }, 'Node configuration deleted');
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== Conference Configuration =====

  /**
   * GET /api/config/conferences
   * Get all conference configurations
   */
  router.get('/conferences', async (req: Request, res: Response) => {
    try {
      const configs = await configService.getConferenceConfigs();
      sendResponse(res, configs);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/conferences/health
   * Check health of all conferences (files, directories)
   * MUST be registered before /:conferenceId to prevent "health" being parsed as an integer
   */
  router.get('/conferences/health', async (req: Request, res: Response) => {
    try {
      const healthChecks = await conferenceSetup.checkAllConferences();
      sendResponse(res, healthChecks, 'Conference health check complete');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/conferences/:conferenceId
   * Get conference configuration
   */
  router.get('/conferences/:conferenceId', async (req: Request, res: Response) => {
    try {
      const conferenceId = parseInt(req.params.conferenceId, 10);
      const config = await configService.getConferenceConfig(conferenceId);

      if (!config) {
        return handleError(res, new Error(`Conference ${conferenceId} configuration not found`));
      }

      sendResponse(res, config);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/conferences
   * Create conference configuration
   */
  router.post('/conferences', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);

      // Create database config record
      const config = await configService.createConferenceConfig(req.body, context);

      // Auto-create all directories and files (MODERN enhancement!)
      try {
        await conferenceSetup.setupConference({
          conferenceId: config.conference_id,
          conferenceName: `Conference ${config.conference_id}`,
          location: `Conf${config.conference_id}`,
          ndirs: config.ndirs || 1,
          minAccessLevel: config.min_access_level,
          maxAccessLevel: config.max_access_level,
          forceNewscan: config.force_newscan,
          excludeFTP: config.exclude_ftp,
          privateConf: config.private_conf,
          readOnly: config.read_only
        });

        // Update ConfConfig.info with new conference
        await conferenceSetup.updateConfConfig(
          config.conference_id,
          `Conference ${config.conference_id}`,
          `Conf${config.conference_id}/`
        );

console.log(`[ConfigAPI] Auto-created directories and files for Conf${config.conference_id}`);
      } catch (setupError) {
console.error(`[ConfigAPI] Failed to auto-create conference files:`, setupError);
        // Don't fail the entire request - database record was created successfully
      }

      sendResponse(res, config, 'Conference configuration created and auto-configured');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/conferences/:conferenceId
   * Update conference configuration
   */
  router.put('/conferences/:conferenceId', async (req: any, res: Response) => {
    try {
      const conferenceId = parseInt(req.params.conferenceId, 10);
      const context = getRequestContext(req);
      const config = await configService.updateConferenceConfig(conferenceId, req.body, context);
      sendResponse(res, config, 'Conference configuration updated');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/conferences/:conferenceId
   * Delete conference configuration
   */
  router.delete('/conferences/:conferenceId', async (req: any, res: Response) => {
    try {
      const conferenceId = parseInt(req.params.conferenceId, 10);
      const context = getRequestContext(req);
      const deleted = await configService.deleteConferenceConfig(conferenceId, context);

      if (!deleted) {
        return handleError(res, new Error(`Conference ${conferenceId} configuration not found`));
      }

      sendResponse(res, { deleted: true }, 'Conference configuration deleted');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/conferences/:conferenceId/health
   * Check health of a single conference
   */
  router.get('/conferences/:conferenceId/health', async (req: Request, res: Response) => {
    try {
      const conferenceId = parseInt(req.params.conferenceId, 10);
      const healthCheck = await conferenceSetup.checkConferenceHealth(conferenceId);
      sendResponse(res, healthCheck, `Conference ${conferenceId} health check complete`);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/conferences/:conferenceId/auto-fix
   * Auto-fix issues found in conference health check
   */
  router.post('/conferences/:conferenceId/auto-fix', async (req: any, res: Response) => {
    try {
      const conferenceId = parseInt(req.params.conferenceId, 10);

      // Run health check first
      const healthCheck = await conferenceSetup.checkConferenceHealth(conferenceId);

      if (healthCheck.issues.length === 0) {
        return sendResponse(res, healthCheck, `Conference ${conferenceId} has no issues`);
      }

      if (!healthCheck.canAutoFix) {
        return handleError(res, new Error(`Cannot auto-fix Conference ${conferenceId}: ${healthCheck.issues.join(', ')}`));
      }

      // Auto-fix issues
      await conferenceSetup.autoFixConference(conferenceId, healthCheck);

      // Run health check again to verify
      const updatedHealthCheck = await conferenceSetup.checkConferenceHealth(conferenceId);

      sendResponse(res, updatedHealthCheck, `Conference ${conferenceId} auto-fix complete`);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== Doors =====

  /**
   * GET /api/config/doors
   * Get all doors (loaded from .info files on disk, NOT database)
   */
  router.get('/doors', async (req: Request, res: Response) => {
    try {
      // DISK-BASED CONFIG: Load doors from .info files, not database
      // This ensures we get the actual doors available on the system
      const { getDoors } = require('../handlers/door.handler');
      const backendDoors = getDoors();
console.log(`[DoorsAPI] getDoors() returned ${backendDoors.length} doors`);

      // Transform backend Door format to frontend Door format
      // Backend uses: id, name, command, type, path, accessLevel, etc.
      // Frontend expects: id (number), door_name, door_command, door_type, door_path, etc.
      const frontendDoors = backendDoors.map((door: any, index: number) => ({
        id: index + 1,  // Frontend expects numeric ID
        door_name: doorDisplayName(door),
        door_command: door.command,
        description: door.description || '',
        door_type: door.type || 'BBSCMD',
        runtime_env: door.type === 'typescript' ? 'nodejs' : door.type === 'XIM' ? 'vamos' : 'native',
        min_security_level: door.accessLevel || 0,
        time_limit: 30,
        enabled: door.enabled !== false,
        door_path: door.path || '',
        door_args: door.args || '',
        working_directory: '',
        priority: `P${door.priority || 0}`,
        door_options: []
      }));

console.log(`[DoorsAPI] Sending ${frontendDoors.length} doors to frontend`);
      sendResponse(res, frontendDoors);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/doors/:id
   * Get door by ID
   */
  router.get('/doors/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const door = await configService.getDoor(id);

      if (!door) {
        return handleError(res, new Error(`Door ${id} not found`));
      }

      sendResponse(res, door);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/doors
   * Create new door
   */
  router.post('/doors', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const door = await configService.createDoor(req.body, context);
      sendResponse(res, door, 'Door created');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/doors/:id
   * Update door
   */
  router.put('/doors/:id', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);

      // Identify the door by its COMMAND, not by the :id in the URL.
      //
      // The door list is loaded from disk and numbered by position
      // (`id: index + 1` above), so that number is not a `doors` table row and
      // never was - saving reported "Door 349 not found". Worse, had the table
      // held a row with that id, this would have edited a different door.
      //
      // A command is unique and is the name of the file that defines it.
      const command = req.body?.door_command;
      if (!command) {
        return handleError(res, new Error('door_command is required to identify the door'));
      }

      // Disk first: the BBS scans Commands/BBSCmd/*.info, so that is what an
      // edit has to change. The database is a mirror and is updated after.
      const bbsRoot = config.get('dataDir');
      const infoPath = findDoorInfoFile(bbsRoot, command);
      if (!infoPath) {
        return handleError(res, new Error(`No .info file for command "${command}" in Commands/BBSCmd`));
      }

      const backupPath = infoPath + '.backup';
      fsSync.copyFileSync(infoPath, backupPath);

      const info = parseInfoFile(infoPath);
      info.tooltypes = applyDoorFieldsToTooltypes(info.tooltypes as any, req.body) as any;
      writeInfoFile(info);

      // Mirror into the database when a row for this command exists. A missing
      // row is not an error: the door is defined on disk.
      try {
        const existing = await configService.getDoorByCommand(command);
        if (existing) {
          await configService.updateDoor(existing.id, req.body, context);
        }
      } catch (mirrorError) {
        console.error('[config] door DB mirror failed (disk write succeeded):', mirrorError);
      }

      sendResponse(res, { command, infoPath, backupPath }, 'Door updated');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/doors/:id
   * Delete door
   */
  router.delete('/doors/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const deleted = await configService.deleteDoor(id, context);

      if (!deleted) {
        return handleError(res, new Error(`Door ${id} not found`));
      }

      sendResponse(res, { deleted: true }, 'Door deleted');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/doors/install-archive
   * Install a door archive from Doors/archives
   */
  router.post('/doors/install-archive', async (req: any, res: Response) => {
    try {
      const { filename, path: archivePath } = req.body || {};
      const dataDir = config.get('dataDir');
      const archivesDir = path.join(dataDir, 'Doors', 'archives');
      const resolvedPath = archivePath
        ? archivePath
        : filename
          ? path.join(archivesDir, filename)
          : null;

      if (!resolvedPath) {
        return handleError(res, new Error('Missing archive filename or path'));
      }

      const normalizedResolved = path.resolve(resolvedPath);
      const normalizedArchives = path.resolve(archivesDir);
      if (!normalizedResolved.startsWith(normalizedArchives)) {
        return handleError(res, new Error('Archive path must be under Doors/archives'));
      }

      if (!fs.existsSync(normalizedResolved)) {
        return handleError(res, new Error(`Archive not found: ${normalizedResolved}`));
      }

      const { getAmigaDoorManager } = await import('../doors/amigaDoorManager');
      const amigaDoorMgr = getAmigaDoorManager();
      const result = await amigaDoorMgr.installDoor(normalizedResolved);

      if (!result.success) {
        return handleError(res, new Error(result.message));
      }

      const { reloadDoors } = require('../handlers/door.handler');
      await reloadDoors();

      sendResponse(res, result, 'Door archive installed');
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== System Languages =====

  /**
   * GET /api/config/languages/system
   * Get system languages configuration
   */
  router.get('/languages/system', async (req: Request, res: Response) => {
    try {
      const config = await configService.getSystemLanguages();
      sendResponse(res, config);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/languages/system
   * Update system languages configuration
   */
  router.put('/languages/system', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const config = await configService.updateSystemLanguages(req.body, context);
      sendResponse(res, config, 'System languages configuration updated');
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== Languages =====

  /**
   * GET /api/config/languages
   * Get all languages
   */
  router.get('/languages', async (req: Request, res: Response) => {
    try {
      const languages = await configService.getLanguages();
      sendResponse(res, languages);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/languages/:id
   * Get language by ID
   */
  router.get('/languages/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);

      // Skip if this is the /system route
      if (req.params.id === 'system') {
        return;
      }

      const language = await configService.getLanguage(id);

      if (!language) {
        return handleError(res, new Error(`Language ${id} not found`));
      }

      sendResponse(res, language);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/languages
   * Create new language
   */
  router.post('/languages', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const language = await configService.createLanguage(req.body, context);
      sendResponse(res, language, 'Language created');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/languages/:id
   * Update language
   */
  router.put('/languages/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);

      // Skip if this is the /system route
      if (req.params.id === 'system') {
        return;
      }

      const context = getRequestContext(req);
      const language = await configService.updateLanguage(id, req.body, context);
      sendResponse(res, language, 'Language updated');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/languages/:id
   * Delete language
   */
  router.delete('/languages/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const deleted = await configService.deleteLanguage(id, context);

      if (!deleted) {
        return handleError(res, new Error(`Language ${id} not found`));
      }

      sendResponse(res, { deleted: true }, 'Language deleted');
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== Protocols =====

  /**
   * GET /api/config/protocols
   * Get all protocols
   */
  router.get('/protocols', async (req: Request, res: Response) => {
    try {
      const protocols = await configService.getProtocols();
      sendResponse(res, protocols);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/protocols/:id
   * Get protocol by ID
   */
  router.get('/protocols/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const protocol = await configService.getProtocol(id);

      if (!protocol) {
        return handleError(res, new Error(`Protocol ${id} not found`));
      }

      sendResponse(res, protocol);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/protocols
   * Create new protocol
   */
  router.post('/protocols', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const protocol = await configService.createProtocol(req.body, context);
      sendResponse(res, protocol, 'Protocol created');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/protocols/:id
   * Update protocol
   */
  router.put('/protocols/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const protocol = await configService.updateProtocol(id, req.body, context);
      sendResponse(res, protocol, 'Protocol updated');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/protocols/:id
   * Delete protocol
   */
  router.delete('/protocols/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const deleted = await configService.deleteProtocol(id, context);

      if (!deleted) {
        return handleError(res, new Error(`Protocol ${id} not found`));
      }

      sendResponse(res, { deleted: true }, 'Protocol deleted');
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== Security Level Access (TOOLTYPE_ACCESS) =====

  /**
   * GET /api/config/security/levels
   *
   * The levels that EXIST, read from Access/ACS.<level>.info - the files the
   * BBS itself reads. The page used to offer a hardcoded
   * [10, 20, 50, 100, 200, 255], which matched neither the files nor the
   * users, so a level in use (30) could not be chosen at all.
   */
  router.get('/security/levels', async (_req: Request, res: Response) => {
    try {
      const bbsRoot = config.get('dataDir');
      sendResponse(res, {
        levels: listAcsLevels(bbsRoot),
        permissions: ACS_PERMISSION_NAMES,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/security/levels/:level
   * The flags a level grants, from its file on disk.
   */
  router.get('/security/levels/:level', async (req: Request, res: Response) => {
    try {
      const level = parseInt(req.params.level, 10);
      const bbsRoot = config.get('dataDir');
      const file = acsLevelFilePath(bbsRoot, level);

      if (!fsSync.existsSync(file)) {
        return handleError(res, new Error(`No ACS file for level ${level}`));
      }

      const info = parseInfoFile(file);
      sendResponse(res, { level, file, flags: tooltypesToFlags(info.tooltypes as any) });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/security/levels/:level
   * Save a level's flags to disk. Body: { flags: { "ACS.DOWNLOAD": true } }
   */
  router.put('/security/levels/:level', async (req: any, res: Response) => {
    try {
      const level = parseInt(req.params.level, 10);
      const flags = req.body?.flags;
      if (!flags || typeof flags !== 'object') {
        return handleError(res, new Error('flags object is required'));
      }

      const bbsRoot = config.get('dataDir');
      const file = acsLevelFilePath(bbsRoot, level);
      if (!fsSync.existsSync(file)) {
        return handleError(res, new Error(`No ACS file for level ${level} - create it first`));
      }

      const backupPath = file + '.backup';
      fsSync.copyFileSync(file, backupPath);

      const info = parseInfoFile(file);
      info.tooltypes = flagsToTooltypes(info.tooltypes as any, flags) as any;
      writeInfoFile(info);

      sendResponse(res, { level, file, backupPath }, `Security level ${level} saved`);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/security/levels/:level
   *
   * Create a level that does not exist yet - the thing "add one for users at
   * 30" was asking for. Copies an existing level's file as the starting
   * point, because a .info is a binary Amiga icon and cannot be conjured from
   * nothing; by default the nearest LOWER level, which is what findAcsLevel
   * would have fallen back to anyway.
   */
  router.post('/security/levels/:level', async (req: any, res: Response) => {
    try {
      const level = parseInt(req.params.level, 10);
      if (!Number.isFinite(level) || level < 1 || level > 255) {
        return handleError(res, new Error('Security level must be between 1 and 255'));
      }

      const bbsRoot = config.get('dataDir');
      const target = acsLevelFilePath(bbsRoot, level);
      if (fsSync.existsSync(target)) {
        return handleError(res, new Error(`Level ${level} already exists`));
      }

      const existing = listAcsLevels(bbsRoot);
      const requested = req.body?.copyFrom !== undefined ? parseInt(req.body.copyFrom, 10) : undefined;
      const source = requested !== undefined
        ? requested
        : [...existing].reverse().find(l => l < level) ?? existing[0];

      if (source === undefined || !fsSync.existsSync(acsLevelFilePath(bbsRoot, source))) {
        return handleError(res, new Error('No existing level to copy from'));
      }

      fsSync.copyFileSync(acsLevelFilePath(bbsRoot, source), target);
      sendResponse(res, { level, file: target, copiedFrom: source }, `Security level ${level} created from ${source}`);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/security/:level
   * Get all ACS flags for a security level
   */
  router.get('/security/:level', async (req: Request, res: Response) => {
    try {
      const level = parseInt(req.params.level, 10);
      const access = await configService.getSecurityAccessForLevel(level);
      sendResponse(res, access);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/security
   * Create new security access entry
   */
  router.post('/security', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const access = await configService.createSecurityAccess(req.body, context);
      sendResponse(res, access, 'Security access created');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/security/:id
   * Update security access entry
   */
  router.put('/security/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const success = await configService.updateSecurityAccess(id, req.body, context);

      if (!success) {
        return handleError(res, new Error(`Security access ${id} not found`));
      }

      sendResponse(res, { updated: true }, 'Security access updated');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/security/:id
   * Delete security access entry
   */
  router.delete('/security/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const deleted = await configService.deleteSecurityAccess(id, context);

      if (!deleted) {
        return handleError(res, new Error(`Security access ${id} not found`));
      }

      sendResponse(res, { deleted: true }, 'Security access deleted');
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== Drives (TOOLTYPE_DRIVES) =====

  /**
   * GET /api/config/drives
   * Get all drives
   */
  router.get('/drives', async (req: Request, res: Response) => {
    try {
      const drives = await configService.getAllDrives();
      sendResponse(res, drives);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/drives/:id
   * Get drive by ID
   */
  router.get('/drives/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const drive = await configService.getDrive(id);

      if (!drive) {
        return handleError(res, new Error(`Drive ${id} not found`));
      }

      sendResponse(res, drive);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/drives
   * Create new drive
   */
  router.post('/drives', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const drive = await configService.createDrive(req.body, context);
      sendResponse(res, drive, 'Drive created');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/drives/:id
   * Update drive
   */
  router.put('/drives/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const drive = await configService.updateDrive(id, req.body, context);
      sendResponse(res, drive, 'Drive updated');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/drives/:id
   * Delete drive
   */
  router.delete('/drives/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const deleted = await configService.deleteDrive(id, context);

      if (!deleted) {
        return handleError(res, new Error(`Drive ${id} not found`));
      }

      sendResponse(res, { deleted: true }, 'Drive deleted');
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== Computer Types (TOOLTYPE_COMPUTERLIST) =====

  /**
   * GET /api/config/computers
   * Get all computer types
   */
  router.get('/computers', async (req: Request, res: Response) => {
    try {
      const types = await configService.getAllComputerTypes();
      sendResponse(res, types);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/computers/:id
   * Get computer type by ID
   */
  router.get('/computers/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const type = await configService.getComputerType(id);

      if (!type) {
        return handleError(res, new Error(`Computer type ${id} not found`));
      }

      sendResponse(res, type);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/computers
   * Create new computer type
   */
  router.post('/computers', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const type = await configService.createComputerType(req.body, context);
      sendResponse(res, type, 'Computer type created');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/computers/:id
   * Update computer type
   */
  router.put('/computers/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const type = await configService.updateComputerType(id, req.body, context);
      sendResponse(res, type, 'Computer type updated');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/computers/:id
   * Delete computer type
   */
  router.delete('/computers/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const deleted = await configService.deleteComputerType(id, context);

      if (!deleted) {
        return handleError(res, new Error(`Computer type ${id} not found`));
      }

      sendResponse(res, { deleted: true }, 'Computer type deleted');
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== Screen Types (TOOLTYPE_SCREENTYPES) =====

  /**
   * GET /api/config/screen-types
   * Get all screen types
   */
  router.get('/screen-types', async (req: Request, res: Response) => {
    try {
      const types = await configService.getAllScreenTypes();
      sendResponse(res, types);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/screen-types/:id
   * Get screen type by ID
   */
  router.get('/screen-types/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const type = await configService.getScreenType(id);

      if (!type) {
        return handleError(res, new Error(`Screen type ${id} not found`));
      }

      sendResponse(res, type);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/screen-types
   * Create new screen type
   */
  router.post('/screen-types', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const type = await configService.createScreenType(req.body, context);
      sendResponse(res, type, 'Screen type created');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/screen-types/:id
   * Update screen type
   */
  router.put('/screen-types/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const type = await configService.updateScreenType(id, req.body, context);
      sendResponse(res, type, 'Screen type updated');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/screen-types/:id
   * Delete screen type
   */
  router.delete('/screen-types/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const deleted = await configService.deleteScreenType(id, context);

      if (!deleted) {
        return handleError(res, new Error(`Screen type ${id} not found`));
      }

      sendResponse(res, { deleted: true }, 'Screen type deleted');
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== File Checkers (TOOLTYPE_FCHECK) =====

  /**
   * GET /api/config/file-checkers
   * Get all file checkers
   */
  router.get('/file-checkers', async (req: Request, res: Response) => {
    try {
      const checkers = await configService.getAllFileCheckers();
      sendResponse(res, checkers);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/file-checkers/:id
   * Get file checker by ID
   */
  router.get('/file-checkers/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const checker = await configService.getFileChecker(id);

      if (!checker) {
        return handleError(res, new Error(`File checker ${id} not found`));
      }

      sendResponse(res, checker);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/file-checkers
   * Create new file checker
   */
  router.post('/file-checkers', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const checker = await configService.createFileChecker(req.body, context);
      sendResponse(res, checker, 'File checker created');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/file-checkers/:id
   * Update file checker
   */
  router.put('/file-checkers/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const checker = await configService.updateFileChecker(id, req.body, context);
      sendResponse(res, checker, 'File checker updated');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/file-checkers/:id
   * Delete file checker (cascades to errors)
   */
  router.delete('/file-checkers/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const deleted = await configService.deleteFileChecker(id, context);

      if (!deleted) {
        return handleError(res, new Error(`File checker ${id} not found`));
      }

      sendResponse(res, { deleted: true }, 'File checker deleted');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/file-checkers/:checkerId/errors
   * Get all error patterns for a file checker
   */
  router.get('/file-checkers/:checkerId/errors', async (req: Request, res: Response) => {
    try {
      const checkerId = parseInt(req.params.checkerId, 10);
      const errors = await configService.getFileCheckerErrors(checkerId);
      sendResponse(res, errors);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/file-checkers/:checkerId/errors
   * Create new error pattern for a file checker
   */
  router.post('/file-checkers/:checkerId/errors', async (req: any, res: Response) => {
    try {
      const checkerId = parseInt(req.params.checkerId, 10);
      const context = getRequestContext(req);
      const errorData = { ...req.body, file_checker_id: checkerId };
      const error = await configService.createFileCheckerError(errorData, context);
      sendResponse(res, error, 'File checker error created');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/file-checker-errors/:id
   * Delete file checker error pattern
   */
  router.delete('/file-checker-errors/:id', async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const deleted = await configService.deleteFileCheckerError(id, context);

      if (!deleted) {
        return handleError(res, new Error(`File checker error ${id} not found`));
      }

      sendResponse(res, { deleted: true }, 'File checker error deleted');
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== User Management =====

  /**
   * GET /api/config/users
   * Get all users
   * DISK-BASED: Loads from user.data/keys/misc files, NOT database
   */
  router.get('/users', async (req: Request, res: Response) => {
    try {
      // DISK-BASED: Load from user.data, user.keys, user.misc
      let users = userFileManager.readAllUsers();

      // Fallback to database if disk files missing or empty
      if (!users || users.length === 0) {
console.warn('[API] user.data files not found or empty, falling back to database');
        users = await database.getUsers({});
      } else {
console.log(`[API] Loaded ${users.length} users from disk files`);

        // Filter out web guest accounts (created transiently, not real BBS users)
        users = users.filter((u: any) => !u.username?.startsWith('_gu_'));

        // CRITICAL: Deduplicate users by username (keep most recent by calls)
        // Disk files can have duplicate records from multiple logins/updates
        const userMap = new Map<string, any>();
        for (const user of users) {
          const existing = userMap.get(user.username);
          if (!existing || user.calls > existing.calls) {
            userMap.set(user.username, user);
          }
        }
        users = Array.from(userMap.values());
console.log(`[API] Deduplicated to ${users.length} unique users`);
      }

      // Remove password hashes from response
      const sanitizedUsers = users.map((u: any) => {
        const { passwordHash, passwordhash, ...userWithoutPassword } = u;
        return userWithoutPassword;
      });
      sendResponse(res, sanitizedUsers);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/users/:id
   * Get user by ID
   */
  router.get('/users/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const user = await database.getUserById(id);

      if (!user) {
        return handleError(res, new Error(`User ${id} not found`));
      }

      // Remove password hash from response
      const { passwordHash, ...userWithoutPassword } = user;
      sendResponse(res, userWithoutPassword);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/users
   * Create new user
   */
  router.post('/users', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const { password, ...userData } = req.body;
      const systemConfig = await configService.getSystemConfig();
      const defaults = {
        secLevel: systemConfig.new_user_sec_level,
        timeLimit: systemConfig.new_user_time_limit,
        chatLimit: systemConfig.new_user_chat_limit,
        linesPerScreen: systemConfig.new_user_lines_per_screen,
        expert: systemConfig.new_user_expert,
        ansi: systemConfig.new_user_ansi,
        protocol: systemConfig.new_user_protocol,
        screenType: systemConfig.new_user_screen_type,
        editor: systemConfig.new_user_editor,
        confAccess: systemConfig.new_user_conf_access,
        availableForChat: systemConfig.new_user_available_chat,
        quietNode: systemConfig.new_user_quiet_node,
        autoRejoin: systemConfig.new_user_auto_rejoin
      };

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user with default values
      const newUserData = {
        passwordHash,
        realname: userData.realname || '',
        location: userData.location || '',
        phone: userData.phone || '',
        email: userData.email || '',
        secLevel: userData.secLevel ?? defaults.secLevel ?? 10,
        uploads: 0,
        downloads: 0,
        bytesUpload: 0,
        bytesDownload: 0,
        ratio: 0,
        ratioType: 0,
        timeTotal: 0,
        // new_user_time_limit is stored in MINUTES (schema CHECK 1..1440) but
        // users.timelimit is read everywhere as SECONDS - see
        // utils/time-tracking.util.ts. Writing the config value straight
        // through gave a "60 minute" default that expired after 60 SECONDS.
        timeLimit: userData.timeLimit ?? ((defaults.timeLimit ?? 1440) * 60),
        timeUsed: 0,
        chatLimit: userData.chatLimit ?? defaults.chatLimit ?? 0,
        chatUsed: 0,
        firstLogin: getSystemTime(),
        calls: 0,
        callsToday: 0,
        newUser: true,
        expert: userData.expert === 'X' ? 'X' : (defaults.expert ? 'X' : 'N'),
        ansi: userData.ansi ?? defaults.ansi ?? true,
        linesPerScreen: userData.linesPerScreen ?? defaults.linesPerScreen ?? 23,
        computer: userData.computer ?? 0,
        screenType: userData.screenType ?? defaults.screenType ?? '',
        protocol: userData.protocol ?? defaults.protocol ?? '',
        editor: userData.editor ?? defaults.editor ?? '',
        zoomType: 0,
        availableForChat: userData.availableForChat ?? defaults.availableForChat ?? true,
        quietNode: userData.quietNode ?? defaults.quietNode ?? false,
        autoRejoin: userData.autoRejoin ?? (defaults.autoRejoin ? 1 : 0),
        confAccess: userData.confAccess || defaults.confAccess || '1',
        areaName: '',
        uuCP: false,
        topUploadCPS: 0,
        topDownloadCPS: 0,
        byteLimit: 0,
        userFlags: 0,
        ...userData,
      };

      const id = await database.createUser(newUserData);
      const createdUser = await database.getUserById(id);

      // Remove password hash from response
      if (createdUser) {
        const { passwordHash: _, ...userWithoutPassword } = createdUser;
        sendResponse(res, userWithoutPassword, 'User created successfully');
      } else {
        handleError(res, new Error('Failed to retrieve created user'));
      }
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/users/:id
   * Update user - handles both disk-based (user-N) and database (UUID) IDs
   */
  router.put('/users/:id', async (req: any, res: Response) => {
    try {
      const id = req.params.id;
      const { password, ...updates } = req.body;

      // Check if this is a disk-based user ID (format: user-N)
      const diskUserMatch = id.match(/^user-(\d+)$/);
      if (diskUserMatch) {
        const slotNumber = parseInt(diskUserMatch[1], 10);

        // Read current user from slot
        const currentUser = userFileManager.readUserBySlot(slotNumber);
        if (!currentUser) {
          return handleError(res, new Error(`User at slot ${slotNumber} not found`));
        }

        // Merge updates into current user
        const updatedUser = { ...currentUser };

        // Map frontend field names to User object fields
        if (updates.realname !== undefined) updatedUser.realname = updates.realname;
        if (updates.location !== undefined) updatedUser.location = updates.location;
        if (updates.phone !== undefined) updatedUser.phone = updates.phone;
        if (updates.email !== undefined) updatedUser.email = updates.email;
        if (updates.secLevel !== undefined) updatedUser.secLevel = updates.secLevel;
        if (updates.timeLimit !== undefined) updatedUser.timeLimit = updates.timeLimit;
        if (updates.expert !== undefined) updatedUser.expert = updates.expert;
        if (updates.ansi !== undefined) updatedUser.ansi = updates.ansi;

        // Handle password update
        if (password) {
              updatedUser.passwordHash = await bcrypt.hash(password, 10);
        }

        // Write back to disk
        userFileManager.updateUserDataFile(updatedUser, slotNumber);

        // Remove password hash from response
        const { passwordHash: _, ...userWithoutPassword } = updatedUser;
        sendResponse(res, userWithoutPassword, 'User updated successfully');
        return;
      }

      // Otherwise, it's a database UUID - use database operations
      // If password is being updated, hash it
      if (password) {
          updates.passwordHash = await bcrypt.hash(password, 10);
      }

      await database.updateUser(id, updates);
      const updatedUser = await database.getUserById(id);

      if (!updatedUser) {
        return handleError(res, new Error(`User ${id} not found after update`));
      }

      // Remove password hash from response
      const { passwordHash: _, ...userWithoutPassword } = updatedUser;
      sendResponse(res, userWithoutPassword, 'User updated successfully');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/users/:id
   * Delete user - handles both disk-based (user-N) and database (UUID) IDs
   */
  router.delete('/users/:id', async (req: any, res: Response) => {
    try {
      const id = req.params.id;

      // Check if this is a disk-based user ID (format: user-N)
      const diskUserMatch = id.match(/^user-(\d+)$/);
      if (diskUserMatch) {
        const slotNumber = parseInt(diskUserMatch[1], 10);
        userFileManager.deleteUserSlot(slotNumber);
        sendResponse(res, { deleted: true }, 'User deleted successfully');
        return;
      }

      // Otherwise, it's a database UUID - delete from database
      await database.deleteUser(id);
      sendResponse(res, { deleted: true }, 'User deleted successfully');
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== Audit Log =====

  /**
   * GET /api/config/audit
   * Get audit log
   * Query params: table, recordId, limit
   */
  router.get('/audit', async (req: Request, res: Response) => {
    try {
      const tableName = req.query.table as string | undefined;
      const recordId = req.query.recordId ? parseInt(req.query.recordId as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

      const entries = await configService.getAuditLog(tableName, recordId, limit);
      sendResponse(res, entries);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== SSH Key Management =====

  /**
   * GET /api/config/ssh-key
   * Get SSH key information
   */
  router.get('/ssh-key', async (req: Request, res: Response) => {
    try {
      const keyInfo = await SSHKeyUtil.getKeyInfo();
      sendResponse(res, keyInfo);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/ssh-key/generate
   * Generate new SSH host key
   * Body: { keySize?: number, overwrite?: boolean }
   */
  router.post('/ssh-key/generate', async (req: any, res: Response) => {
    try {
      const { keySize = 4096, overwrite = false } = req.body;
      const result = await SSHKeyUtil.generateKey(keySize, overwrite);

      if (!result.success) {
        return handleError(res, new Error(result.error || 'Failed to generate SSH key'));
      }

      sendResponse(res, result, 'SSH key generated successfully. Restart the BBS server to use the new key.');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/ssh-key
   * Delete SSH host key
   */
  router.delete('/ssh-key', async (req: any, res: Response) => {
    try {
      const result = await SSHKeyUtil.deleteKey();

      if (!result.success) {
        return handleError(res, new Error(result.error || 'Failed to delete SSH key'));
      }

      sendResponse(res, { deleted: true }, 'SSH key deleted successfully. SSH server will not be available until a new key is generated.');
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== SMTP Testing =====

  /**
   * POST /api/config/smtp/test
   * Test SMTP connection by sending a test email to sysop
   */
  router.post('/smtp/test', async (req: any, res: Response) => {
    try {
      const { testSmtpConnection } = await import('../services/mail-notification.service');
      const result = await testSmtpConnection();
      sendResponse(res, result, result.success ? 'SMTP test email sent successfully' : `SMTP test failed: ${result.error}`);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== Log Viewer =====

  /**
   * GET /api/config/logs/door-68k
   * List available 68K door log files
   */
  router.get('/logs/door-68k', async (req: Request, res: Response) => {
    try {
      const fsModule = await import('fs');
      const fs = fsModule.promises;
      const path = await import('path');

      const projectRoot = path.resolve(__dirname, '../../../..');
      const logsDir = path.join(projectRoot, 'logs');

      let entries: string[] = [];
      try {
        entries = await fs.readdir(logsDir);
      } catch {
        return sendResponse(res, { files: [] });
      }

      const isDoorLog = (name: string) =>
        name === 'door-68k.log' || /^door-68k-[A-Za-z0-9_.-]+\.log$/.test(name);

      const files = await Promise.all(
        entries.filter(isDoorLog).map(async (file) => {
          const fullPath = path.join(logsDir, file);
          let stats: import('fs').Stats | null = null;
          try {
            stats = await fs.stat(fullPath);
          } catch {
            stats = null;
          }

          const label = file === 'door-68k.log'
            ? 'door-68k.log (legacy)'
            : file.replace(/^door-68k-/, '').replace(/\.log$/, '');

          return {
            file,
            label,
            size: stats?.size ?? 0,
            modifiedAt: stats?.mtime?.toISOString() ?? null
          };
        })
      );

      files.sort((a, b) => {
        if (!a.modifiedAt && !b.modifiedAt) return 0;
        if (!a.modifiedAt) return 1;
        if (!b.modifiedAt) return -1;
        return b.modifiedAt.localeCompare(a.modifiedAt);
      });

      sendResponse(res, { files });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/logs
   * Get system logs
   */
  router.get('/logs', async (req: Request, res: Response) => {
    try {
      const { type = 'backend', lines = '500', search = '', doorLog = '' } = req.query;
      const fsModule = await import('fs');
      const fs = fsModule.promises;
      const path = await import('path');
      const readline = await import('readline');

      const maxLines = Math.min(parseInt(lines as string, 10) || 500, 5000);
      const logType = type as string;

      // Determine log file path
      const projectRoot = path.resolve(__dirname, '../../../..');
      let logFile: string;

      switch (logType) {
        case 'backend':
          logFile = path.join(projectRoot, 'logs', 'backend.log');
          break;
        case 'door68k':
          if (typeof doorLog === 'string' && doorLog) {
            const safeName = path.basename(doorLog);
            const isDoorLog = safeName === 'door-68k.log' || /^door-68k-[A-Za-z0-9_.-]+\.log$/.test(safeName);
            if (!isDoorLog) {
              throw new Error(`Invalid door log name: ${safeName}`);
            }
            logFile = path.join(projectRoot, 'logs', safeName);
          } else {
            logFile = path.join(projectRoot, 'logs', 'door-68k.log');
          }
          break;
        case 'frontend':
          logFile = path.join(projectRoot, 'logs', 'frontend.log');
          break;
        case 'error':
          logFile = path.join(projectRoot, 'logs', 'error.log');
          break;
        case 'access':
          logFile = path.join(projectRoot, 'logs', 'access.log');
          break;
        default:
          throw new Error(`Invalid log type: ${logType}`);
      }

      // Ensure the log file exists so the UI doesn’t error on first view
      try {
        await fs.access(logFile);
      } catch {
        await fs.writeFile(logFile, '', 'utf-8');
      }

      // Detect hosting environment
      const detectEnvironment = () => {
        if (process.env.RENDER) return 'render';
        if (process.env.RAILWAY_ENVIRONMENT) return 'railway';
        if (process.env.FLY_APP_NAME) return 'fly';
        if (process.env.HEROKU_APP_NAME) return 'heroku';
        if (process.env.VERCEL) return 'vercel';
        return 'local';
      };

      const environment = detectEnvironment();

      // Platform-specific log viewing instructions
      const getPlatformMessage = () => {
        switch (environment) {
          case 'render':
            return 'Log files not available on Render.com. View logs in your Render dashboard:\n\n1. Go to your Render dashboard\n2. Select your service\n3. Click the "Logs" tab\n4. Logs update in real-time';
          case 'railway':
            return 'Log files not available on Railway. View logs in your Railway dashboard:\n\n1. Go to railway.app\n2. Select your project\n3. Click "Deployments" → Select active deployment\n4. View real-time logs in the deployment view';
          case 'fly':
            return 'Log files not available on Fly.io. View logs using the Fly CLI or dashboard:\n\n1. CLI: fly logs (in your project directory)\n2. Dashboard: Go to fly.io/dashboard → Select app → Monitoring';
          case 'heroku':
            return 'Log files not available on Heroku. View logs using Heroku CLI or dashboard:\n\n1. CLI: heroku logs --tail --app your-app-name\n2. Dashboard: Go to dashboard.heroku.com → Select app → More → View logs';
          case 'vercel':
            return 'Log files not available on Vercel. View logs in your Vercel dashboard:\n\n1. Go to vercel.com\n2. Select your project\n3. Click "Deployments" → Select deployment\n4. View logs in the deployment detail view';
          default:
            return `No ${logType} log file found. Start the BBS server to generate logs:\n\n./dev/scripts/start-servers.sh`;
        }
      };

      // Check if file exists
      try {
        await fs.access(logFile);
      } catch {
        return sendResponse(res, {
          lines: [],
          totalLines: 0,
          logType,
          environment,
          message: getPlatformMessage()
        });
      }

      const searchTerm = (search as string).toLowerCase();

      // Stream the file to avoid loading multi-GB logs into memory
      const loadLogLines = async () => {
        const matched: string[] = [];
        let totalLines = 0;

        const stream = fsModule.createReadStream(logFile, { encoding: 'utf-8' });
        const rl = readline.createInterface({
          input: stream,
          crlfDelay: Infinity
        });

        try {
          for await (const line of rl) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (searchTerm && !trimmed.toLowerCase().includes(searchTerm)) {
              continue;
            }
            totalLines++;
            matched.push(trimmed);
            if (matched.length > maxLines) {
              matched.shift();
            }
          }
        } finally {
          rl.close();
          stream.close();
        }

        return {
          lines: matched.reverse(),
          totalLines,
          displayedLines: matched.length
        };
      };

      const { lines: logLines, totalLines, displayedLines } = await loadLogLines();

      sendResponse(res, {
        lines: logLines,
        totalLines,
        displayedLines,
        logType,
        searchTerm: searchTerm || undefined
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/logs
   * Clear a specific log file
   */
  router.delete('/logs', async (req: any, res: Response) => {
    try {
      const { type = 'backend', doorLog = '' } = req.query;
      const fs = await import('fs').then(m => m.promises);
      const path = await import('path');

      const logType = type as string;
      const projectRoot = path.resolve(__dirname, '../../../..');
      let logFile: string;

      switch (logType) {
        case 'backend':
          logFile = path.join(projectRoot, 'logs', 'backend.log');
          break;
        case 'door68k':
          if (typeof doorLog === 'string' && doorLog) {
            const safeName = path.basename(doorLog);
            const isDoorLog = safeName === 'door-68k.log' || /^door-68k-[A-Za-z0-9_.-]+\.log$/.test(safeName);
            if (!isDoorLog) {
              throw new Error(`Invalid door log name: ${safeName}`);
            }
            logFile = path.join(projectRoot, 'logs', safeName);
          } else {
            logFile = path.join(projectRoot, 'logs', 'door-68k.log');
          }
          break;
        case 'frontend':
          logFile = path.join(projectRoot, 'logs', 'frontend.log');
          break;
        case 'error':
          logFile = path.join(projectRoot, 'logs', 'error.log');
          break;
        case 'access':
          logFile = path.join(projectRoot, 'logs', 'access.log');
          break;
        default:
          throw new Error(`Invalid log type: ${logType}`);
      }

      // Clear log file (write empty string)
      await fs.writeFile(logFile, '', 'utf-8');

      sendResponse(res, { cleared: true, logType }, `${logType} log cleared`);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== BBS Health Check =====

  /**
   * GET /api/config/health
   * Run full BBS health check (all categories)
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      const report = await healthCheck.runFullHealthCheck();
      sendResponse(res, report, 'BBS health check complete');
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/health/auto-fix
   * Auto-fix all fixable issues found in health check
   */
  router.post('/health/auto-fix', async (req: any, res: Response) => {
    try {
      // Run health check first
      const report = await healthCheck.runFullHealthCheck();

      if (report.autoFixableIssues === 0) {
        return sendResponse(res, { fixed: 0, failed: 0, report }, 'No fixable issues found');
      }

      // Auto-fix all issues
      const result = await healthCheck.autoFixAll(report);

      // Run health check again to verify
      const updatedReport = await healthCheck.runFullHealthCheck();

      sendResponse(
        res,
        { ...result, report: updatedReport },
        `Auto-fix complete: ${result.fixed} fixed, ${result.failed} failed`
      );
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== Doors Cache Management =====

  /**
   * POST /api/config/doors/reload
   * Reload doors cache after adding/modifying/deleting doors
   */
  router.post('/doors/reload', async (req: Request, res: Response) => {
    try {
      const { reloadDoors } = require('../handlers/door.handler');
      const doors = await reloadDoors();

      sendResponse(
        res,
        { doorsCount: doors.length, doors },
        `Doors cache reloaded: ${doors.length} doors`
      );
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===== Operator Chat Configuration =====

  /**
   * GET /api/config/operator-chat
   * Get operator chat configuration
   */
  router.get('/operator-chat', async (req: Request, res: Response) => {
    try {
      const operatorChatRepo = database.getOperatorChatRepository();
      const config = operatorChatRepo.getConfig();
      sendResponse(res, config);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/operator-chat
   * Update operator chat configuration
   */
  router.put('/operator-chat', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const operatorChatRepo = database.getOperatorChatRepository();

      // Update configuration
      operatorChatRepo.updateConfig(req.body);

      // Get updated config
      const updatedConfig = operatorChatRepo.getConfig();

console.log(`[Config API] Operator chat config updated by ${context.username}`);
      sendResponse(res, updatedConfig, 'Operator chat configuration updated');
    } catch (error) {
      handleError(res, error);
    }
  });

  // ============================================
  // Push Notification Routes
  // ============================================

  /**
   * GET /api/config/push/vapid-key
   * Get VAPID public key for push subscription (public endpoint)
   */
  router.get('/push/vapid-key', (req: Request, res: Response) => {
    const { getVapidPublicKey, isWebPushEnabled } = require('../utils/web-push.util');
    const publicKey = getVapidPublicKey();

    if (!publicKey || !isWebPushEnabled()) {
      res.json({
        enabled: false,
        publicKey: null
      });
      return;
    }

    res.json({
      enabled: true,
      publicKey
    });
  });

  /**
   * POST /api/config/push/subscribe
   * Save push subscription for current user
   */
  router.post('/push/subscribe', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const { subscription } = req.body;

      if (!subscription || !subscription.endpoint || !subscription.keys) {
        res.status(400).json({ error: 'Invalid subscription data' });
        return;
      }

      const operatorChatRepo = database.getOperatorChatRepository();
      operatorChatRepo.savePushSubscription(
        context.userId || 'anonymous',
        subscription,
        req.headers['user-agent']
      );

console.log(`[Push] Saved subscription for user ${context.userId}`);
      sendResponse(res, { success: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * DELETE /api/config/push/unsubscribe
   * Remove push subscription
   */
  router.delete('/push/unsubscribe', async (req: any, res: Response) => {
    try {
      const { endpoint } = req.body;

      if (!endpoint) {
        res.status(400).json({ error: 'Endpoint required' });
        return;
      }

      const operatorChatRepo = database.getOperatorChatRepository();
      operatorChatRepo.removePushSubscription(endpoint);

console.log('[Push] Removed subscription');
      sendResponse(res, { success: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/push/status
   * Check if current user has push subscriptions
   */
  router.get('/push/status', async (req: any, res: Response) => {
    try {
      const context = getRequestContext(req);
      const operatorChatRepo = database.getOperatorChatRepository();

      const hasSubscription = operatorChatRepo.hasPushSubscriptions(context.userId || 'anonymous');
      const subscriptions = operatorChatRepo.getPushSubscriptionsForSysop(context.userId || 'anonymous');

      sendResponse(res, {
        hasSubscription,
        subscriptionCount: subscriptions.length
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/config/push/generate-vapid
   * Generate new VAPID keys (admin only)
   */
  router.post('/push/generate-vapid', async (req: Request, res: Response) => {
    try {
      const { generateVapidKeys } = require('../utils/web-push.util');
      const keys = generateVapidKeys();

      sendResponse(res, {
        publicKey: keys.publicKey,
        privateKey: keys.privateKey
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/config/push/vapid-config
   * Get current VAPID configuration (admin only - includes private key)
   */
  router.get('/push/vapid-config', async (req: Request, res: Response) => {
    try {
      const configRepo = database.getConfigRepository();
      const systemConfig = configRepo.getSystemConfig();

      if (!systemConfig) {
        res.status(404).json({ error: 'System configuration not found' });
        return;
      }

      const { isWebPushEnabled } = require('../utils/web-push.util');

      sendResponse(res, {
        vapid_public_key: systemConfig.vapid_public_key || '',
        vapid_private_key: systemConfig.vapid_private_key || '',
        vapid_contact_email: systemConfig.vapid_contact_email || '',
        enabled: isWebPushEnabled()
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/config/push/vapid-config
   * Update VAPID configuration and reinitialize web push (admin only)
   */
  router.put('/push/vapid-config', async (req: Request, res: Response) => {
    try {
      const { vapid_public_key, vapid_private_key, vapid_contact_email } = req.body;
      const context = getRequestContext(req);

      // Validate the keys are present together or both empty
      if ((vapid_public_key && !vapid_private_key) || (!vapid_public_key && vapid_private_key)) {
        res.status(400).json({ error: 'Both public and private VAPID keys must be provided together' });
        return;
      }

      const configRepo = database.getConfigRepository();
      const oldConfig = configRepo.getSystemConfig();

      // Update config
      const updatedConfig = configRepo.updateSystemConfig({
        vapid_public_key: vapid_public_key || '',
        vapid_private_key: vapid_private_key || '',
        vapid_contact_email: vapid_contact_email || ''
      });

      // Log the change
      configRepo.logConfigChange(
        'system_config',
        1,
        'UPDATE',
        context.userId,
        context.username,
        {
          vapid_public_key: oldConfig?.vapid_public_key || '',
          vapid_private_key: '***REDACTED***',
          vapid_contact_email: oldConfig?.vapid_contact_email || ''
        },
        {
          vapid_public_key: vapid_public_key || '',
          vapid_private_key: '***REDACTED***',
          vapid_contact_email: vapid_contact_email || ''
        },
        context.ipAddress,
        context.userAgent
      );

      // Reinitialize web push with new config
      const { reinitWebPush, isWebPushEnabled } = require('../utils/web-push.util');
      reinitWebPush(updatedConfig);

      sendResponse(res, {
        success: true,
        enabled: isWebPushEnabled(),
        message: isWebPushEnabled()
          ? 'VAPID configuration updated and web push enabled'
          : 'VAPID configuration updated but web push is disabled (keys may be missing or invalid)'
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}
