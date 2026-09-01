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
import { getSystemTime } from '../utils/date-time.util';
import { isRealInfoFile } from '../utils/info-file.util';

export const infoEditorRouter = express.Router();

interface Tooltype {
  key: string;
  value: string;
  commented: boolean;
  originalLine: string;
  /** Amiga parentheses or a bang - which syntax disabled this entry. */
  commentStyle?: '()' | '!';
  /** The #, +, % or ' AmiExpress writes in front of some keys. */
  prefix?: string;
}

interface InfoFileMetadata {
  path: string;
  relativePath: string;
  basename: string;
  type: 'command' | 'door' | 'conference' | 'unknown';
  tooltypes: Tooltype[];
}

/**
 * Read a file's tooltypes with the SAME parser the write uses.
 *
 * This route had a private parser that skipped valueless tooltypes,
 * parenthesised ones and empty values, while the PUT replaced the whole array
 * with what the editor sent - so every tooltype the editor could not display
 * was deleted on save. On this board that is 795 of 1,190 .info files losing
 * tooltypes on any save, 526 displaying none while holding some, and 82
 * rendering rows built out of binary noise that were then written back as
 * real tooltypes.
 *
 * parseInfoFile locates the real length-prefixed array, so nothing is
 * invented and nothing is hidden.
 */
function parseTooltypes(filePath: string): Tooltype[] {
  try {
    return parseInfoFile(filePath).tooltypes.map(tt => ({
      key: tt.key,
      value: tt.value,
      commented: tt.commented,
      originalLine: tt.originalLine,
      ...(tt.commentStyle ? { commentStyle: tt.commentStyle } : {}),
      ...(tt.prefix ? { prefix: tt.prefix } : {}),
    }));
  } catch (error) {
console.error(`[InfoEditor] Error parsing ${filePath}:`, error);
    return [];
  }
}

/**
 * Resolve a path under the BBS root, the way the rest of this codebase does.
 *
 * A command's file is named whatever the sysop's Amiga wrote - `wall.info`,
 * `SWall.info`, `ACCV103.info` - and 63 of the 155 files in Commands/BBSCmd
 * are lower or mixed case. macOS cannot see the difference; the Linux
 * container can, which is where the archiver bug of 7006ce568 lived too.
 *
 * Every route here now resolves ONCE and uses the resolved path for the read,
 * the backup and the write - the mismatch was that the GET tested existence
 * case-insensitively and then read case-sensitively.
 */
function resolveUnderRoot(relativePath: string): string | null {
  const bbsRoot = config.get('dataDir');
  const fullPath = path.join(bbsRoot, relativePath);

  // Confinement is checked on the requested path AND on what it resolved to.
  const resolvedRoot = path.resolve(bbsRoot);
  if (!path.resolve(fullPath).startsWith(resolvedRoot)) return null;

  const real = amigafs.resolvePath(fullPath);
  if (!real) return null;
  if (!path.resolve(real).startsWith(resolvedRoot)) return null;

  return real;
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
 * List all .info files in the BBS directory (recursive)
 */
/**
 * The envelope every caller unwraps.
 *
 * This router replied with bare objects - `{ files }`, the metadata itself,
 * `{ error }` - while apiClient types all four endpoints as ApiResponse and
 * every page reads `.data`. So Configuration Files always showed zero files
 * and both tooltype editors always showed none, with nothing failing
 * anywhere: the server answered correctly in a shape the client could not
 * read.
 */
function sendOk<T>(res: Response, data: T, message?: string): void {
  res.json({
    success: true,
    data,
    message,
    timestamp: getSystemTime().toISOString(),
  });
}

function sendFail(res: Response, status: number, message: string): void {
  res.status(status).json({
    success: false,
    message,
    timestamp: getSystemTime().toISOString(),
  });
}

infoEditorRouter.get('/files', async (req: Request, res: Response) => {
  try {
    const bbsRoot = config.get('dataDir');
    const files: InfoFileMetadata[] = [];

    // Recursive file walker
    const walk = (dir: string) => {
      const entries = amigafs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        try {
          const stats = amigafs.statSync(fullPath);
          if (stats.isDirectory()) {
            // Skip large/irrelevant directories
            if (entry === 'node_modules' || entry === '.git' || entry === 'logs') continue;
            walk(fullPath);
          } else if (isRealInfoFile(entry)) {
            const relativePath = path.relative(bbsRoot, fullPath);
            files.push({
              path: fullPath,
              relativePath,
              basename: entry,
              type: getFileType(relativePath),
              tooltypes: []
            });
          }
        } catch (err) {
          // Skip if can't stat
        }
      }
    };

    walk(bbsRoot);

    sendOk(res, { files });

  } catch (error) {
console.error('[InfoEditor] Error listing files:', error);
    sendFail(res, 500, `Failed to list .info files: ${(error as Error).message}`);
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
      return sendFail(res, 400, 'Missing path parameter');
    }

    const fullPath = resolveUnderRoot(relativePath);
    if (!fullPath) {
      return sendFail(res, 404, 'File not found');
    }

    const tooltypes = parseTooltypes(fullPath);
    const metadata: InfoFileMetadata = {
      path: fullPath,
      relativePath,
      basename: path.basename(fullPath),
      type: getFileType(relativePath),
      tooltypes
    };

    sendOk(res, metadata);

  } catch (error) {
console.error('[InfoEditor] Error reading file:', error);
    sendFail(res, 500, `Failed to read .info file: ${(error as Error).message}`);
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
      return sendFail(res, 400, 'Missing path or tooltypes');
    }

    const fullPath = resolveUnderRoot(relativePath);
    if (!fullPath) {
      return sendFail(res, 404, 'File not found');
    }

    // Create backup
    const backupPath = fullPath + '.backup';
    fs.copyFileSync(fullPath, backupPath);

    try {
      // Parse .info file
      const info = parseInfoFile(fullPath);

      // A blank "Add Tooltype" row has no key. Writing it produced the entry
      // "=", after which the file no longer parsed and every later save took
      // the fallback path below.
      const rows = (tooltypes as Tooltype[]).filter(tt => tt.key && tt.key.trim());

      // An entry the sysop did not touch keeps its exact on-disk bytes. That
      // is not an optimisation: rebuilding every line as `!KEY=VALUE` rewrote
      // the ACS files' parentheses into bangs (express.e reads the
      // parenthesised form), dropped the #, + and % prefixes AmiExpress
      // writes, and turned `BANNER=` into `BANNER`.
      const existingByKey = new Map(info.tooltypes.map(tt => [tt.key, tt]));

      info.tooltypes = rows.map((tt: Tooltype) => {
        const key = tt.key.toUpperCase().trim();
        const existing = existingByKey.get(key);
        if (existing && existing.value === tt.value && existing.commented === tt.commented) {
          return existing;
        }

        const prefix = tt.prefix ?? existing?.prefix ?? '';
        const commentStyle = tt.commentStyle ?? existing?.commentStyle;
        const body = tt.value ? `${prefix}${key}=${tt.value}` : `${prefix}${key}`;
        const originalLine = !tt.commented
          ? body
          : commentStyle === '()' ? `(${body})` : `!${body}`;
        return {
          key,
          value: tt.value,
          commented: tt.commented,
          prefix,
          ...(commentStyle ? { commentStyle } : {}),
          originalLine,
        };
      });

      // Write back to file
      writeInfoFile(info);

      sendOk(res, { backupPath }, 'Tooltypes saved successfully');
    } catch (parseError) {
console.error('[InfoEditor] Error modifying binary .info file:', parseError);

      // The file is unchanged, so put it back exactly as it was and SAY SO.
      // This used to write a `<file>.tooltypes.txt` sidecar and reply success:
      // nothing reads that file - AmiExpress's companion fallback is
      // `<name>.txt`, not `<name>.info.tooltypes.txt` (tooltypes.e:259-270) -
      // so the sysop was told the save worked when nothing had been saved.
      try {
        fs.copyFileSync(backupPath, fullPath);
      } catch (restoreError) {
console.error('[InfoEditor] Failed to restore backup:', restoreError);
      }

      return sendFail(
        res,
        500,
        `Could not write ${path.basename(fullPath)}: ${(parseError as Error).message}`
      );
    }

  } catch (error) {
console.error('[InfoEditor] Error updating file:', error);
    sendFail(res, 500, `Failed to update .info file: ${(error as Error).message}`);
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
      return sendFail(res, 400, 'Missing path or key');
    }

    const fullPath = resolveUnderRoot(relativePath);
    if (!fullPath) {
      return sendFail(res, 404, 'File not found');
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
        return sendFail(res, 404, 'Tooltype not found');
      }

      // Toggle comment status
      info = toggleComment(info, key);

      // Write back to file
      writeInfoFile(info);

      // Get updated tooltype
      const updatedTooltype = info.tooltypes.find(tt => tt.key.toUpperCase() === key.toUpperCase());

      sendOk(
        res,
        { tooltype: updatedTooltype },
        `${key} is now ${updatedTooltype?.commented ? 'disabled' : 'enabled'}`
      );
    } catch (parseError) {
console.error('[InfoEditor] Error modifying binary .info file:', parseError);
      sendFail(res, 500, `Failed to modify .info file: ${(parseError as Error).message}`);
    }

  } catch (error) {
console.error('[InfoEditor] Error toggling tooltype:', error);
    sendFail(res, 500, `Failed to toggle tooltype: ${(error as Error).message}`);
  }
});

export default infoEditorRouter;
