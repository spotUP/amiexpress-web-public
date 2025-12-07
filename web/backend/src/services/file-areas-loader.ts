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
 * Ensure every DIR file for the configured file areas exists.
 * If a DIR file is missing, create an empty file so doors/readers never fail.
 */
export async function ensureDirFilesExist(
  bbsRoot: string,
  fileAreas: FileArea[]
): Promise<void> {
  const created = new Set<string>();

  for (const area of fileAreas) {
    const confDir = path.join(bbsRoot, `Conf${area.conferenceId}`);
    const dirFilePath = path.join(confDir, `DIR${area.dirNumber}`);

    if (created.has(dirFilePath)) {
      continue;
    }

    try {
      await fs.promises.mkdir(confDir, { recursive: true });
      const fileHandle = await fs.promises.open(dirFilePath, 'a');
      await fileHandle.close();
      created.add(dirFilePath);
      console.log(`[FileAreas] Ensured DIR file exists: ${dirFilePath}`);
      await ensureDirFileHasContent(dirFilePath);
    } catch (error) {
      console.error(`[FileAreas] Failed to ensure DIR file ${dirFilePath}:`, error);
    }
  }
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
  fileAreas: FileArea[]
): Promise<void> {
  const dirNumbersByConf = new Map<number, Set<number>>();
  const areaNamesByConf = new Map<number, string[]>();
  const globalScreensDir = path.join(bbsRoot, 'Screens');
  let globalScreens: string[] = [];

  try {
    const entries = await fs.promises.readdir(globalScreensDir, { withFileTypes: true });
    globalScreens = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    console.warn(`[FileAreas] Unable to read global screens directory:`, error);
  }

  for (const area of fileAreas) {
    if (!dirNumbersByConf.has(area.conferenceId)) {
      dirNumbersByConf.set(area.conferenceId, new Set());
      areaNamesByConf.set(area.conferenceId, []);
    }
    dirNumbersByConf.get(area.conferenceId)!.add(area.dirNumber);
    areaNamesByConf.get(area.conferenceId)!.push(area.name);
  }

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

    const pathsToTouch = [
      path.join(confDir, 'NumULs'),
      path.join(confDir, 'SysopStats', 'NumULs_2'),
      path.join(confDir, 'Dir0.info'),
      path.join(confDir, 'Messages.info'),
      path.join(confDir, 'HOLD', 'HELD'),
      path.join(confDir, 'LCFILES', 'uploads.lc')
    ];

    const dirNumbers = dirNumbersByConf.get(conf.id);
    if (dirNumbers) {
      for (const dirNum of dirNumbers) {
        pathsToTouch.push(path.join(confDir, `DIR${dirNum}`));
        pathsToTouch.push(path.join(confDir, `Dir${dirNum}.info`));
      }
    }

    pathsToTouch.push(path.join(confDir, 'Upload', 'FILE_ID.DIZ'));

    const areaNames = areaNamesByConf.get(conf.id);
    if (areaNames) {
      for (const name of areaNames) {
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
        pathsToTouch.push(path.join(confDir, 'Files', `${safeName}.dir`));
      }
    }

    for (const filePath of pathsToTouch) {
      try {
        await touchFile(filePath);
      } catch {
        // Already logged
      }
    }

    for (const screenName of globalScreens) {
      const targetPath = path.join(confDir, 'Screens', screenName);
      if (fs.existsSync(targetPath)) {
        continue;
      }
      try {
        await fs.promises.copyFile(path.join(globalScreensDir, screenName), targetPath);
        console.log(`[FileAreas] Copied ${screenName} to ${confDir}/Screens`);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.error(`[FileAreas] Failed to copy screen ${screenName} to ${confDir}/Screens:`, error);
        }
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

async function ensureDirFileHasContent(filePath: string): Promise<void> {
  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.size === 0) {
      await fs.promises.writeFile(filePath, '\n');
      console.log(`[FileAreas] Seeded DIR file placeholder: ${filePath}`);
    }
  } catch (error) {
    console.error(`[FileAreas] Unable to seed DIR file ${filePath}:`, error);
  }
}
