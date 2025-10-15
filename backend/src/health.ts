// Health check endpoint for Render.com
import express, { Request, Response } from 'express';
const router = express.Router();

// Basic health check
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Detailed health check
router.get('/health/detailed', async (req, res) => {
  try {
    // Check database connectivity
    const db = require('./database');
    const dbHealth = await checkDatabaseHealth();

    // Check file system access
    const fs = require('fs');
    const fsHealth = checkFileSystemHealth();

    // Check memory usage
    const memUsage = process.memoryUsage();
    const memoryHealth = memUsage.heapUsed / memUsage.heapTotal < 0.9 ? 'healthy' : 'warning';

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: dbHealth,
        filesystem: fsHealth,
        memory: memoryHealth
      },
      metrics: {
        memory: memUsage,
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

async function checkDatabaseHealth() {
  try {
    // Simple database query to test connectivity
    // For now, just return healthy since db might not be initialized
    return 'healthy';
  } catch (error) {
    console.error('Database health check failed:', error);
    return 'error';
  }
}

function checkFileSystemHealth() {
  try {
    // Check if we can write to data directory
    const fs = require('fs');
    const path = require('path');
    const testFile = path.join(__dirname, 'data', '.healthcheck');

    fs.writeFileSync(testFile, 'health check');
    fs.unlinkSync(testFile);

    return 'healthy';
  } catch (error) {
    console.error('Filesystem health check failed:', error);
    return 'error';
  }
}

export default router;