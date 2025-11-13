/**
 * Configuration API Routes
 * REST API for BBS configuration management
 *
 * All routes require JWT authentication and sysop-level access
 * Base URL: /api/config
 */

import express, { Request, Response, NextFunction } from 'express';
import { ConfigService } from '../services/config.service';
import type { Database } from '../database';

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
      timestamp: new Date().toISOString()
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
      timestamp: new Date().toISOString()
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
      sendResponse(res, config);
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
      const config = await configService.createConferenceConfig(req.body, context);
      sendResponse(res, config, 'Conference configuration created');
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

  // ===== Doors =====

  /**
   * GET /api/config/doors
   * Get all doors
   */
  router.get('/doors', async (req: Request, res: Response) => {
    try {
      const doors = await configService.getDoors();
      sendResponse(res, doors);
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
      const id = parseInt(req.params.id, 10);
      const context = getRequestContext(req);
      const door = await configService.updateDoor(id, req.body, context);
      sendResponse(res, door, 'Door updated');
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
   */
  router.get('/users', async (req: Request, res: Response) => {
    try {
      const users = await database.getUsers({});
      // Remove password hashes from response
      const sanitizedUsers = users.map((u: any) => {
        const { passwordHash, ...userWithoutPassword } = u;
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

      // Hash password
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user with default values
      const newUserData = {
        passwordHash,
        realname: userData.realname || '',
        location: userData.location || '',
        phone: userData.phone || '',
        email: userData.email || '',
        secLevel: userData.secLevel || 10,
        uploads: 0,
        downloads: 0,
        bytesUpload: 0,
        bytesDownload: 0,
        ratio: 0,
        ratioType: 0,
        timeTotal: 0,
        timeLimit: userData.timeLimit || 60,
        timeUsed: 0,
        chatLimit: 0,
        chatUsed: 0,
        firstLogin: new Date(),
        calls: 0,
        callsToday: 0,
        newUser: true,
        expert: userData.expert || false,
        ansi: true,
        linesPerScreen: 23,
        computer: 0,
        screenType: 0,
        protocol: '',
        editor: '',
        zoomType: 0,
        availableForChat: true,
        quietNode: false,
        autoRejoin: 1,
        confAccess: '1',
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
   * Update user
   */
  router.put('/users/:id', async (req: any, res: Response) => {
    try {
      const id = req.params.id;
      const context = getRequestContext(req);
      const { password, ...updates } = req.body;

      // If password is being updated, hash it
      if (password) {
        const bcrypt = require('bcrypt');
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
   * Delete user
   */
  router.delete('/users/:id', async (req: any, res: Response) => {
    try {
      const id = req.params.id;
      const context = getRequestContext(req);

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

  return router;
}
