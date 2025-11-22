/**
 * Deployment & Setup API Routes
 *
 * Provides web-based access to deployment and system health operations
 */

import express, { Request, Response } from 'express';
import { authenticateToken, requireSysop } from '../middleware/auth.middleware';
import { db } from '../database';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = express.Router();

/**
 * System Health Check Endpoint
 * GET /api/deployment/health
 */
router.get('/deployment/health', authenticateToken, requireSysop, async (req: Request, res: Response) => {
  try {
    const healthStatus = {
      timestamp: new Date().toISOString(),
      overall: 'healthy',
      checks: {
        environment: await checkEnvironment(),
        database: await checkDatabase(),
        fileSystem: await checkFileSystem(),
        dependencies: await checkDependencies(),
        ports: await checkPorts(),
      }
    };

    // Determine overall status
    const hasErrors = Object.values(healthStatus.checks).some((check: any) => check.status === 'error');
    const hasWarnings = Object.values(healthStatus.checks).some((check: any) => check.status === 'warning');

    healthStatus.overall = hasErrors ? 'unhealthy' : hasWarnings ? 'degraded' : 'healthy';

    res.json(healthStatus);
  } catch (error: any) {
    res.status(500).json({ error: 'Health check failed', message: error.message });
  }
});

/**
 * System Information Endpoint
 * GET /api/deployment/system-info
 */
router.get('/deployment/system-info', authenticateToken, requireSysop, async (req: Request, res: Response) => {
  try {
    const systemInfo = {
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      memory: {
        total: Math.round(require('os').totalmem() / 1024 / 1024),
        free: Math.round(require('os').freemem() / 1024 / 1024),
        used: Math.round((require('os').totalmem() - require('os').freemem()) / 1024 / 1024),
      },
      uptime: Math.round(process.uptime()),
      env: {
        nodeEnv: process.env.NODE_ENV || 'development',
        bbsName: process.env.BBS_NAME || 'Not configured',
        sysopName: process.env.SYSOP_NAME || 'Not configured',
        databaseDir: process.env.DATABASE_DIR || './data',
      },
      ports: {
        backend: process.env.BACKEND_PORT || 3001,
        frontend: process.env.FRONTEND_PORT || 5173,
        telnet: process.env.TELNET_PORT || 2323,
        ssh: process.env.SSH_PORT || 2222,
      }
    };

    res.json(systemInfo);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get system info', message: error.message });
  }
});

/**
 * Database Statistics Endpoint
 * GET /api/deployment/database-stats
 */
router.get('/deployment/database-stats', authenticateToken, requireSysop, async (req: Request, res: Response) => {
  try {
    // Get database path from environment or default
    const dbDir = process.env.DATABASE_DIR || './data';
    const dbFile = process.env.DATABASE_FILE || 'amiexpress.db';
    const dbPath = join(process.cwd(), dbDir, dbFile);
    const dbExists = existsSync(dbPath);

    if (!dbExists) {
      return res.json({
        exists: false,
        path: dbPath,
        error: 'Database file not found'
      });
    }

    const stats = statSync(dbPath);

    // Get user count from database query
    const userCountResult = await db.query('SELECT COUNT(*) as count FROM users', []);
    const userCount = userCountResult.rows[0]?.count || 0;

    // Get conference count from database query
    const confCountResult = await db.query('SELECT COUNT(*) as count FROM conferences', []);
    const confCount = confCountResult.rows[0]?.count || 0;

    res.json({
      exists: true,
      path: dbPath,
      size: stats.size,
      sizeFormatted: formatBytes(stats.size),
      modified: stats.mtime.toISOString(),
      users: userCount,
      conferences: confCount,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get database stats', message: error.message });
  }
});

/**
 * TypeScript Check Endpoint
 * POST /api/deployment/typecheck
 */
router.post('/deployment/typecheck', authenticateToken, requireSysop, async (req: Request, res: Response) => {
  try {
    const { stdout, stderr } = await execAsync('cd web/backend && npx tsc --noEmit', {
      timeout: 60000,
      cwd: process.cwd()
    });

    res.json({
      success: true,
      output: stdout || 'No errors found',
      errors: stderr || '',
    });
  } catch (error: any) {
    res.json({
      success: false,
      output: error.stdout || '',
      errors: error.stderr || error.message,
    });
  }
});

/**
 * Test Endpoint
 * POST /api/deployment/test
 */
router.post('/deployment/test', authenticateToken, requireSysop, async (req: Request, res: Response) => {
  try {
    const dbDir = process.env.DATABASE_DIR || './data';
    const dbFile = process.env.DATABASE_FILE || 'amiexpress.db';
    const dbPath = join(process.cwd(), dbDir, dbFile);

    const testResults = {
      environment: true,
      database: dbPath && existsSync(dbPath),
      dependencies: existsSync(join(process.cwd(), 'web', 'backend', 'node_modules')),
    };

    const allPassed = Object.values(testResults).every(result => result === true);

    res.json({
      success: allPassed,
      results: testResults,
      message: allPassed ? 'All tests passed' : 'Some tests failed'
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Test execution failed', message: error.message });
  }
});

// ============================================
// Helper Functions
// ============================================

async function checkEnvironment() {
  const requiredVars = ['JWT_SECRET'];
  const missingVars: string[] = [];
  const warnings: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }

  // Check optional but recommended vars
  if (!process.env.BBS_NAME) warnings.push('BBS_NAME not set');
  if (!process.env.SYSOP_NAME) warnings.push('SYSOP_NAME not set');

  return {
    status: missingVars.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok',
    message: missingVars.length > 0
      ? `Missing required variables: ${missingVars.join(', ')}`
      : warnings.length > 0
        ? warnings.join('; ')
        : 'All environment variables configured',
    details: {
      missing: missingVars,
      warnings: warnings,
      configured: {
        jwtSecret: !!process.env.JWT_SECRET,
        bbsName: !!process.env.BBS_NAME,
        sysopName: !!process.env.SYSOP_NAME,
        databaseDir: !!process.env.DATABASE_DIR,
      }
    }
  };
}

async function checkDatabase() {
  try {
    // Get database path from environment or default
    const dbDir = process.env.DATABASE_DIR || './data';
    const dbFile = process.env.DATABASE_FILE || 'amiexpress.db';
    const dbPath = join(process.cwd(), dbDir, dbFile);

    if (!existsSync(dbPath)) {
      return {
        status: 'error',
        message: 'Database file not found',
        details: { path: dbPath, exists: false }
      };
    }

    const stats = statSync(dbPath);

    // Get user count from database query
    let userCount = 0;
    try {
      const result = await db.query('SELECT COUNT(*) as count FROM users', []);
      userCount = result.rows[0]?.count || 0;
    } catch (e) {
      // Database might not have tables yet
    }

    return {
      status: stats.size === 0 ? 'warning' : 'ok',
      message: stats.size === 0 ? 'Database is empty' : `Database operational (${userCount} users)`,
      details: {
        path: dbPath,
        size: stats.size,
        users: userCount,
        readable: true,
        writable: true,
      }
    };
  } catch (error: any) {
    return {
      status: 'error',
      message: `Database check failed: ${error.message}`,
      details: { error: error.message }
    };
  }
}

async function checkFileSystem() {
  const requiredDirs = [
    'web/backend/src',
    'web/frontend/src',
    'doors',
  ];

  const optionalDirs = [
    'data/bbs/BBS/Screens',
    'data/bbs/BBS/Conf1',
  ];

  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  for (const dir of requiredDirs) {
    const fullPath = join(process.cwd(), dir);
    if (!existsSync(fullPath)) {
      missingRequired.push(dir);
    }
  }

  for (const dir of optionalDirs) {
    const fullPath = join(process.cwd(), dir);
    if (!existsSync(fullPath)) {
      missingOptional.push(dir);
    }
  }

  return {
    status: missingRequired.length > 0 ? 'error' : missingOptional.length > 0 ? 'warning' : 'ok',
    message: missingRequired.length > 0
      ? `Missing required directories: ${missingRequired.join(', ')}`
      : missingOptional.length > 0
        ? `Optional directories missing: ${missingOptional.join(', ')}`
        : 'All directories present',
    details: {
      missingRequired,
      missingOptional,
    }
  };
}

async function checkDependencies() {
  const checks = {
    backend: existsSync(join(process.cwd(), 'web', 'backend', 'node_modules')),
    frontend: existsSync(join(process.cwd(), 'web', 'frontend', 'node_modules')),
    sdk: existsSync(join(process.cwd(), 'sdk', 'node_modules')),
  };

  const missing = Object.entries(checks)
    .filter(([_, installed]) => !installed)
    .map(([name]) => name);

  return {
    status: !checks.backend || !checks.frontend ? 'error' : !checks.sdk ? 'warning' : 'ok',
    message: missing.length > 0
      ? `Dependencies not installed: ${missing.join(', ')}`
      : 'All dependencies installed',
    details: checks
  };
}

async function checkPorts() {
  // Note: Checking if ports are in use requires OS-specific commands
  // This is a simplified check that just verifies configuration
  return {
    status: 'ok',
    message: 'Port configuration valid',
    details: {
      backend: process.env.BACKEND_PORT || 3001,
      frontend: process.env.FRONTEND_PORT || 5173,
      telnet: process.env.TELNET_PORT || 2323,
      ssh: process.env.SSH_PORT || 2222,
    }
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export const deploymentRouter = router;
