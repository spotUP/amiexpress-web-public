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
        console.warn(`[FileAreas] Conf${conf.id}.info not found, skipping file areas`);
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
        console.log(`[FileAreas] Conf${conf.id} has NDIRS=0, no file areas`);
        continue;
      }

      // Read DLPATH.n and ULPATH.n for each directory
      for (let dirNum = 1; dirNum <= ndirs; dirNum++) {
        const dlPathKey = `DLPATH.${dirNum}`;
        const ulPathKey = `ULPATH.${dirNum}`;

        const dlPath = toolTypes.get(dlPathKey) || '';
        const ulPath = toolTypes.get(ulPathKey) || '';

        if (!dlPath && !ulPath) {
          console.warn(`[FileAreas] Conf${conf.id} dir ${dirNum}: No DLPATH or ULPATH defined`);
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

        console.log(`[FileAreas] Loaded Conf${conf.id} Dir${dirNum}: DL=${dlPath} UL=${ulPath}`);
      }
    } catch (error) {
      console.error(`[FileAreas] Error loading file areas for Conf${conf.id}:`, error);
    }
  }

  console.log(`[FileAreas] Loaded ${allAreas.length} file areas from ${conferences.length} conferences`);
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
 */
export async function ensureConferenceStructure(
  bbsRoot: string,
  conferences: any[],
  _fileAreas: FileArea[]
): Promise<void> {
  for (const conf of conferences) {
    const confDir = path.join(bbsRoot, `Conf${conf.id}`);
    const directories = ['Files', 'Upload', 'HOLD', 'LCFILES', 'Messages', 'Screens', 'SysopStats'];
    for (const subDir of directories) {
      const target = path.join(confDir, subDir);
      try {
        await fs.promises.mkdir(target, { recursive: true });
      } catch (error) {
        console.error(`[FileAreas] Failed to ensure directory ${target}:`, error);
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

/**
 * Resolve a BBS: assign path to actual filesystem path
 * BBS: → bbsRoot
 * BBS2: → bbsRoot (for mirror/backup paths, treat as same)
 *
 * @param assignPath - Path with BBS: assign (e.g., "BBS:Conf2/Upload/")
 * @param bbsRoot - BBS root directory
 * @returns Resolved filesystem path
 */
export function resolveAssignPath(assignPath: string, bbsRoot: string): string {
  if (!assignPath) return bbsRoot;

  let resolved = assignPath;

  // Replace BBS: and BBS2: with actual root
  resolved = resolved.replace(/^BBS2?:/i, bbsRoot);

  // Ensure trailing slash is removed for consistent path.join
  resolved = resolved.replace(/\/$/, '');

  return resolved;
}

/**
 * Ensure root Screens has placeholders for core screens only.
 */
export async function ensureRootScreens(bbsRoot: string): Promise<void> {
  const screensDir = path.join(bbsRoot, 'Screens');
  const requiredScreens = [
    'BBSTITLE.TXT',
    'LOGON.TXT',
    'BULL.TXT',
    'NODE_BULL.TXT',
    'CONF_BULL.TXT',
    'MENU.TXT',
    'LOGOFF.TXT'
  ];

  try {
    await fs.promises.mkdir(screensDir, { recursive: true });
  } catch (error) {
    console.error(`[FileAreas] Failed to ensure Screens directory ${screensDir}:`, error);
    return;
  }

  let existingScreens: Set<string> = new Set();
  try {
    const entries = await fs.promises.readdir(screensDir);
    existingScreens = new Set(entries.map((entry) => entry.toLowerCase()));
  } catch (error) {
    console.warn(`[FileAreas] Unable to read Screens directory ${screensDir}:`, error);
  }

  for (const screenName of requiredScreens) {
    if (existingScreens.has(screenName.toLowerCase())) {
      continue;
    }
    const targetPath = path.join(screensDir, screenName);
    try {
      await touchFile(targetPath);
      console.log(`[FileAreas] Created placeholder root screen: ${screenName}`);
    } catch (error) {
      console.error(`[FileAreas] Failed to create placeholder root screen ${screenName}:`, error);
    }
  }
}
