/**
 * .info File Editor API Routes
 * Provides endpoints for managing Amiga .info file tooltypes
 */

import express, { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as amigafs from '../utils/amigafs';
import { execSync } from 'child_process';
import { config } from '../config';
import { parseInfoFile, writeInfoFile, updateTooltype, toggleTooltypeComment as toggleComment, Tooltype as InfoTooltype } from '../utils/info-file.util';

export const infoEditorRouter = express.Router();

interface Tooltype {
  key: string;
  value: string;
  commented: boolean;
  originalLine: string;
}

interface InfoFileMetadata {
  path: string;
  relativePath: string;
  basename: string;
  type: 'command' | 'door' | 'conference' | 'unknown';
  tooltypes: Tooltype[];
}

/**
 * Parse tooltypes from .info file
 */
function parseTooltypes(filePath: string): Tooltype[] {
  const tooltypes: Tooltype[] = [];

  try {
    const output = execSync(`strings "${filePath}"`, { encoding: 'utf8' });
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes('=')) {
        continue;
      }

      // Skip parenthesized lines
      if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
        continue;
      }

      let cleaned = trimmed;
      let commented = false;

      // Check for comment prefix
      if (cleaned.startsWith('!')) {
        commented = true;
        cleaned = cleaned.substring(1);
      } else if (cleaned.startsWith('#') || cleaned.startsWith('+') || cleaned.startsWith('%') || cleaned.startsWith("'")) {
        // Amiga-style prefixes, not comments
        cleaned = cleaned.substring(1);
      }

      const [key, ...valueParts] = cleaned.split('=');
      const value = valueParts.join('=').trim();

      if (key && value) {
        const cleanKey = key.toUpperCase().trim();
        tooltypes.push({
          key: cleanKey,
          value,
          commented,
          originalLine: trimmed
        });
      }
    }
  } catch (error) {
    console.error(`[InfoEditor] Error parsing ${filePath}:`, error);
  }

  return tooltypes;
}

/**
 * Determine file type from path
 */
function getFileType(relativePath: string): InfoFileMetadata['type'] {
  if (relativePath.includes('/Commands/')) {
    return 'command';
  } else if (relativePath.includes('/Doors/') || relativePath.includes('/doors/')) {
    return 'door';
  } else if (relativePath.match(/^Conf\d+\.info$/)) {
    return 'conference';
  }
  return 'unknown';
}

/**
 * GET /api/info-editor/files
 * List all .info files in the BBS directory
 */
infoEditorRouter.get('/files', async (req: Request, res: Response) => {
  try {
    const bbsRoot = config.get('dataDir');
    const files: InfoFileMetadata[] = [];

    // Scan Commands directories
    const commandDirs = [
      path.join(bbsRoot, 'Commands/BBSCmd'),
      path.join(bbsRoot, 'Commands/SysCmd')
    ];

    for (const dir of commandDirs) {
      if (amigafs.existsSync(dir)) {
        const entries = amigafs.readdirSync(dir);
        for (const entry of entries) {
          if (entry.toLowerCase().endsWith('.info')) {
            const fullPath = path.join(dir, entry);
            const relativePath = path.relative(bbsRoot, fullPath);
            files.push({
              path: fullPath,
              relativePath,
              basename: entry,
              type: 'command',
              tooltypes: []  // Don't load all tooltypes yet for performance
            });
          }
        }
      }
    }

    // Scan Doors directory
    const doorsDir = path.join(bbsRoot, 'Doors');
    if (amigafs.existsSync(doorsDir)) {
      const doorEntries = amigafs.readdirSync(doorsDir);
      for (const doorName of doorEntries) {
        const doorPath = path.join(doorsDir, doorName);
        try {
          const doorStat = amigafs.statSync(doorPath);
          if (doorStat.isDirectory()) {
            const doorFiles = amigafs.readdirSync(doorPath);
            for (const file of doorFiles) {
              if (file.toLowerCase().endsWith('.info')) {
                const fullPath = path.join(doorPath, file);
                const relativePath = path.relative(bbsRoot, fullPath);
                files.push({
                  path: fullPath,
                  relativePath,
                  basename: file,
                  type: 'door',
                  tooltypes: []
                });
              }
            }
          }
        } catch (err) {
          // Skip if can't stat
          continue;
        }
      }
    }

    // Scan Conference .info files
    const confFiles = amigafs.readdirSync(bbsRoot).filter(f =>
      f.match(/^Conf\d+\.info$/i)
    );
    for (const confFile of confFiles) {
      const fullPath = path.join(bbsRoot, confFile);
      files.push({
        path: fullPath,
        relativePath: confFile,
        basename: confFile,
        type: 'conference',
        tooltypes: []
      });
    }

    res.json({ files });

  } catch (error) {
    console.error('[InfoEditor] Error listing files:', error);
    res.status(500).json({
      error: 'Failed to list .info files',
      message: (error as Error).message
    });
  }
});

/**
 * GET /api/info-editor/file?path=<relative-path>
 * Get specific .info file with tooltypes
 */
infoEditorRouter.get('/file', async (req: Request, res: Response) => {
  try {
    const relativePath = req.query.path as string;
    if (!relativePath) {
      return res.status(400).json({ error: 'Missing path parameter' });
    }

    const bbsRoot = config.get('dataDir');
    const fullPath = path.join(bbsRoot, relativePath);

    // Security check - ensure path is within BBS root
    const resolvedPath = path.resolve(fullPath);
    const resolvedRoot = path.resolve(bbsRoot);
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!amigafs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const tooltypes = parseTooltypes(fullPath);
    const metadata: InfoFileMetadata = {
      path: fullPath,
      relativePath,
      basename: path.basename(fullPath),
      type: getFileType(relativePath),
      tooltypes
    };

    res.json(metadata);

  } catch (error) {
    console.error('[InfoEditor] Error reading file:', error);
    res.status(500).json({
      error: 'Failed to read .info file',
      message: (error as Error).message
    });
  }
});

/**
 * PUT /api/info-editor/file
 * Update tooltypes in .info file
 *
 * Body: { path: string, tooltypes: Tooltype[] }
 */
infoEditorRouter.put('/file', async (req: Request, res: Response) => {
  try {
    const { path: relativePath, tooltypes } = req.body;

    if (!relativePath || !tooltypes) {
      return res.status(400).json({ error: 'Missing path or tooltypes' });
    }

    const bbsRoot = config.get('dataDir');
    const fullPath = path.join(bbsRoot, relativePath);

    // Security check
    const resolvedPath = path.resolve(fullPath);
    const resolvedRoot = path.resolve(bbsRoot);
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Create backup
    const backupPath = fullPath + '.backup';
    fs.copyFileSync(fullPath, backupPath);

    try {
      // Parse .info file
      const info = parseInfoFile(fullPath);

      // Update tooltypes
      info.tooltypes = tooltypes.map((tt: Tooltype) => ({
        key: tt.key.toUpperCase(),
        value: tt.value,
        commented: tt.commented,
        originalLine: `${tt.commented ? '!' : ''}${tt.key}=${tt.value}`
      }));

      // Write back to file
      writeInfoFile(info);

      res.json({
        success: true,
        message: 'Tooltypes saved successfully',
        backupPath
      });
    } catch (parseError) {
      console.error('[InfoEditor] Error modifying binary .info file:', parseError);

      // Fallback: create .tooltypes.txt file
      const tooltypesPath = fullPath + '.tooltypes.txt';
      let content = `# Tooltypes for ${path.basename(fullPath)}\n`;
      content += `# Generated: ${new Date().toISOString()}\n`;
      content += `# Warning: Binary modification failed, manual update required\n\n`;

      for (const tt of tooltypes) {
        const prefix = tt.commented ? '!' : '';
        content += `${prefix}${tt.key}=${tt.value}\n`;
      }

      fs.writeFileSync(tooltypesPath, content);

      res.json({
        success: true,
        message: 'Tooltypes saved to text file (binary modification failed)',
        backupPath,
        tooltypesPath,
        warning: 'Binary .info modification failed. Text file created for reference.',
        error: (parseError as Error).message
      });
    }

  } catch (error) {
    console.error('[InfoEditor] Error updating file:', error);
    res.status(500).json({
      error: 'Failed to update .info file',
      message: (error as Error).message
    });
  }
});

/**
 * POST /api/info-editor/toggle
 * Toggle comment status of a tooltype
 *
 * Body: { path: string, key: string }
 */
infoEditorRouter.post('/toggle', async (req: Request, res: Response) => {
  try {
    const { path: relativePath, key } = req.body;

    if (!relativePath || !key) {
      return res.status(400).json({ error: 'Missing path or key' });
    }

    const bbsRoot = config.get('dataDir');
    const fullPath = path.join(bbsRoot, relativePath);

    // Security check
    const resolvedPath = path.resolve(fullPath);
    const resolvedRoot = path.resolve(bbsRoot);
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Create backup
    const backupPath = fullPath + '.backup';
    fs.copyFileSync(fullPath, backupPath);

    try {
      // Parse .info file
      let info = parseInfoFile(fullPath);

      // Find and toggle the tooltype
      const tooltype = info.tooltypes.find(tt => tt.key.toUpperCase() === key.toUpperCase());
      if (!tooltype) {
        return res.status(404).json({ error: 'Tooltype not found' });
      }

      // Toggle comment status
      info = toggleComment(info, key);

      // Write back to file
      writeInfoFile(info);

      // Get updated tooltype
      const updatedTooltype = info.tooltypes.find(tt => tt.key.toUpperCase() === key.toUpperCase());

      res.json({
        success: true,
        tooltype: updatedTooltype,
        message: `${key} is now ${updatedTooltype?.commented ? 'disabled' : 'enabled'}`
      });
    } catch (parseError) {
      console.error('[InfoEditor] Error modifying binary .info file:', parseError);
      res.status(500).json({
        error: 'Failed to modify .info file',
        message: (parseError as Error).message
      });
    }

  } catch (error) {
    console.error('[InfoEditor] Error toggling tooltype:', error);
    res.status(500).json({
      error: 'Failed to toggle tooltype',
      message: (error as Error).message
    });
  }
});

export default infoEditorRouter;
