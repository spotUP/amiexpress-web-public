import * as fs from 'fs';
import * as path from 'path';
import { InfoFileParser } from './info-file-parser';

export interface FileArea {
  id: number;
  conferenceId: number;
  dirNumber: number;
  name: string;
  dlPath: string;
  ulPath: string;
  description?: string;
}

/**
 * Load file areas from conference .info files
 * 1:1 port from express.e - reads NDIRS, DLPATH.n, ULPATH.n from TOOLTYPE_CONF
 *
 * express.e:5006 - maxDirs:=readToolTypeInt(TOOLTYPE_CONF,conf,'NDIRS')
 * express.e:15264 - Same pattern for file operations
 *
 * File areas are stored in Conf{N}.info as tooltypes:
 * - NDIRS=N (number of directories)
 * - DLPATH.1=BBS:Conf{N}/Upload/ (download path for dir 1)
 * - ULPATH.1=BBS:Conf{N}/Upload/ (upload path for dir 1)
 * - DLPATH.2=... (optional secondary paths)
 *
 * @param bbsRoot - BBS root directory
 * @param conferences - Array of conferences to load areas for
 * @returns Array of file areas loaded from disk
 */
export function loadFileAreasFromDisk(bbsRoot: string, conferences: any[]): FileArea[] {
  const allAreas: FileArea[] = [];
  let globalId = 1;

  for (const conf of conferences) {
    try {
      const confInfoPath = path.join(bbsRoot, `Conf${conf.id}.info`);

      if (!fs.existsSync(confInfoPath)) {
        continue;
      }

      const buffer = fs.readFileSync(confInfoPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      // Normalize keys to uppercase for lookups
      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        toolTypes.set(key.toUpperCase(), value);
      }

      // Read NDIRS (express.e:5006)
      const ndirsStr = toolTypes.get('NDIRS');
      const ndirs = ndirsStr ? parseInt(ndirsStr, 10) || 0 : 0;

      if (ndirs === 0) {
        continue;
      }

      // Read DLPATH.n and ULPATH.n for each directory
      for (let dirNum = 1; dirNum <= ndirs; dirNum++) {
        const dlPathKey = `DLPATH.${dirNum}`;
        const ulPathKey = `ULPATH.${dirNum}`;

        const dlPath = toolTypes.get(dlPathKey) || '';
        const ulPath = toolTypes.get(ulPathKey) || '';

        if (!dlPath && !ulPath) {
          continue;
        }

        allAreas.push({
          id: globalId++,
          conferenceId: conf.id,
          dirNumber: dirNum,
          name: `${conf.name} - Dir ${dirNum}`,
          dlPath: dlPath || ulPath, // Fallback to ulPath if dlPath missing
          ulPath: ulPath || dlPath, // Fallback to dlPath if ulPath missing
          description: `File area ${dirNum} for ${conf.name}`
        });
      }
    } catch (error) {
      // Silent catch to prevent terminal pollution during speculative scan
    }
  }

  process.stdout.write(`[FileAreas] Loaded ${allAreas.length} file areas from ${conferences.length} conferences\n`);
  return allAreas;
}

/**
 * Placeholder creation for DIR files is disabled; callers may manage files manually.
 */
export async function ensureDirFilesExist(
  bbsRoot: string,
  fileAreas: FileArea[]
): Promise<void> {
  // Intentionally left blank: placeholder creation for conferences is disabled.
}

async function touchFile(filePath: string): Promise<void> {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const handle = await fs.promises.open(filePath, 'a');
    await handle.close();
  } catch (error) {
console.error(`[FileAreas] Failed to touch file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Ensure every conference has the directories/files AmiExpress expects
 *
 * From express.e analysis:
 * - LCFILES/  - Lost carrier files (express.e:17486, 19404, 19484)
 * - HOLD/     - Files needing sysop review (express.e:19405, 19488)
 * - PartUpload/ - Partial/interrupted uploads (express.e:14574, 17536, 18127)
 * - MsgBase/  - Message base storage (express.e:2068)
 * - Screens/  - Conference-specific screens (express.e:5052)
 * - SysopStats/ - Upload statistics (express.e:18772)
 * - Upload/   - Default upload directory
 *
 * Note: Legacy BBS data may have some of these as files instead of directories.
 * We skip creating directories when files already exist to preserve data.
 */
export async function ensureConferenceStructure(
  bbsRoot: string,
  conferences: any[],
  _fileAreas: FileArea[]
): Promise<void> {
  // All directories from express.e that should exist in each conference
  // express.e creates these as directories, but legacy data may have files
  const directories = [
    'Upload',      // Default upload directory
    'MsgBase',     // Message base storage (express.e:2068)
    'Screens',     // Conference screens (express.e:5052)
    'SysopStats',  // Statistics files (express.e:18772)
    'PartUpload',  // Partial uploads (express.e:14574)
    'LCFILES',     // Lost carrier files (express.e:17486)
    'HOLD'         // Held files for review (express.e:19405)
  ];

  for (const conf of conferences) {
    const confDir = path.join(bbsRoot, `Conf${conf.id}`);

    for (const subDir of directories) {
      const target = path.join(confDir, subDir);
      try {
        // Check if path already exists
        const stat = await fs.promises.stat(target).catch(() => null);

        if (stat === null) {
          // Doesn't exist - create the directory
          await fs.promises.mkdir(target, { recursive: true });
        } else if (!stat.isDirectory()) {
          // Exists as a file - skip silently to preserve legacy data
          // This is common for LCFILES and HOLD in imported Amiga BBS data
        }
        // If it's already a directory, nothing to do
      } catch (error: any) {
        // Silent catch to prevent terminal pollution
      }
    }
  }
}

/**
 * Get file areas for a specific conference
 *
 * @param bbsRoot - BBS root directory
 * @param confId - Conference ID
 * @returns Array of file areas for the conference
 */
export function loadConferenceFileAreas(bbsRoot: string, confId: number): FileArea[] {
  return loadFileAreasFromDisk(bbsRoot, [{ id: confId, name: `Conference ${confId}` }]);
}

// NOTE: resolveAssignPath() was removed - use path-util.ts::resolveAssignPath() instead
// It handles more assign types (BBS:, DOORS:, NODE#:, T:, RAM:, etc.)

/**
 * Ensure root Screens has placeholders for core screens only.
 *
 * BULL/NODE_BULL/CONF_BULL are intentionally NOT in this list. Per express.e
 * (express.e:6539-6550 + 6773-6845), `displayScreen(SCREEN_BULL)` returns
 * TRUE if the file opens — and `displayFile()` returns TRUE for an empty
 * file because Open() succeeds. The caller (express.e:28556) then triggers
 * `doPause()` whenever displayScreen returns TRUE. So a 0-byte BULL.TXT
 * causes a press-enter prompt with no content above it. The express.e-faithful
 * way to suppress the pause is to NOT have the file at all (findSecurityScreen
 * returns FALSE → displayScreen returns FALSE → no pause).
 */
export async function ensureRootScreens(bbsRoot: string): Promise<void> {
  const screensDir = path.join(bbsRoot, 'Screens');
  const requiredScreens = [
    'BBSTITLE.TXT',
    'LOGON.TXT',
    'MENU.TXT',
    'LOGOFF.TXT'
  ];

  try {
    await fs.promises.mkdir(screensDir, { recursive: true });
  } catch (error) {
    return;
  }

  let existingScreens: Set<string> = new Set();
  try {
    const entries = await fs.promises.readdir(screensDir);
    existingScreens = new Set(entries.map((entry) => entry.toLowerCase()));
  } catch (error) {
    // Silent catch
  }

  for (const screenName of requiredScreens) {
    if (existingScreens.has(screenName.toLowerCase())) {
      continue;
    }
    const targetPath = path.join(screensDir, screenName);
    try {
      await touchFile(targetPath);
    } catch (error) {
      // Silent catch
    }
  }
}
