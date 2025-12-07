/**
 * Screen Security Utility
 * Finds screen files with security level variants
 *
 * 1:1 port from express.e:6246-6310 findSecurityScreen()
 */

import * as fs from 'fs';
import * as path from 'path';

const GRAPHIC_EXTENSIONS = ['.TXT.GR'];
const TEXT_EXTENSIONS = ['.TXT', '.txt'];

function resolveCaseInsensitivePath(targetPath: string): string | null {
  if (fs.existsSync(targetPath)) {
    return targetPath;
  }

  const dirPath = path.dirname(targetPath);
  const targetName = path.basename(targetPath);

  try {
    const entries = fs.readdirSync(dirPath);
    const match = entries.find(entry => entry.toLowerCase() === targetName.toLowerCase());
    if (match) {
      const resolvedPath = path.join(dirPath, match);
      if (fs.existsSync(resolvedPath)) {
        return resolvedPath;
      }
    }
  } catch (error) {
    // Directory may not exist or is unreadable
    return null;
  }

  return null;
}

/**
 * Find security screen file with appropriate security level
 *
 * Security screens are named: BaseName{SecurityLevel}.TXT
 * Examples: Bull100.TXT, Bull50.TXT, Bull.TXT
 *
 * Algorithm (express.e:6246-6310):
 * 1. Round user's security level down to nearest 5
 * 2. Check for screens at that level, then decrement by 5
 * 3. Minimum level checked is 5
 * 4. Finally check for non-security screen (no level suffix)
 *
 * Extension priority (express.e:6258-6295):
 * - RIP mode: .RIP first, then .TXT
 * - PETSCII mode: .seq first, then .TXT
 * - Normal mode: .TXT
 *
 * @param screenDirAndName - Full path to screen without extension (e.g., "/path/to/Bulletins/Bull1")
 * @param userSecLevel - User's security level (0-255)
 * @param petsciiMode - Whether PETSCII mode is enabled (prefer .seq files)
 * @param ripMode - Whether RIP mode is enabled (prefer .rip files)
 * @returns Full path to found screen file, or null if not found
 */
export function findSecurityScreen(
  screenDirAndName: string,
  userSecLevel: number = 0,
  petsciiMode: boolean = false,
  ripMode: boolean = false
): string | null {
  const minLevel = 5;

  // Extensions to try based on graphics mode (express.e:6258-6295)
  // RIP mode checks .RIP first, PETSCII checks .seq first
  let extensions: string[];
  if (ripMode) {
    extensions = ['.rip', '.RIP', ...GRAPHIC_EXTENSIONS, ...TEXT_EXTENSIONS];
  } else if (petsciiMode) {
    extensions = ['.seq', '.SEQ', ...GRAPHIC_EXTENSIONS, ...TEXT_EXTENSIONS];
  } else {
    extensions = [...GRAPHIC_EXTENSIONS, ...TEXT_EXTENSIONS];
  }

  // express.e:6256-6260 - Check security screens
  // Round down to nearest 5
  let secLevel = Math.floor(userSecLevel / 5) * 5;

  // express.e:6260-6276 - Check security level screens (highest to lowest)
  while (secLevel >= minLevel) {
    // Check each extension
    for (const ext of extensions) {
      const securityScreenPath = `${screenDirAndName}${secLevel}${ext}`;
      const resolvedSecurityPath = resolveCaseInsensitivePath(securityScreenPath);

      if (resolvedSecurityPath) {
        console.log(`[SCREEN] Found security screen: ${resolvedSecurityPath} (level ${secLevel})`);
        return resolvedSecurityPath;
      }
    }

    // express.e:6274 - Decrement by 5
    secLevel = secLevel - 5;
  }

  // express.e:6280-6302 - Check non-security screens at end
  // This is the fallback screen with no security level suffix
  for (const ext of extensions) {
    const defaultScreenPath = `${screenDirAndName}${ext}`;
    const resolvedDefaultPath = resolveCaseInsensitivePath(defaultScreenPath);

    if (resolvedDefaultPath) {
      console.log(`[SCREEN] Found default screen: ${resolvedDefaultPath}`);
      return resolvedDefaultPath;
    }
  }

  // express.e:6304 - No screen found
  console.warn(`[SCREEN] Not found: ${screenDirAndName} (checked levels ${userSecLevel} down to ${minLevel}, plus default)`);
  return null;
}

/**
 * Find bulletin file with security level variant
 * Wrapper around findSecurityScreen for bulletin-specific paths
 *
 * @param baseDir - Base BBS directory
 * @param conferenceDir - Conference directory name (e.g., "Conf1")
 * @param bulletinNumber - Bulletin number (1, 2, 3, etc.)
 * @param userSecLevel - User's security level
 * @param petsciiMode - Whether PETSCII mode is enabled
 * @param ripMode - Whether RIP mode is enabled
 * @returns Full path to bulletin file, or null
 */
export function findBulletinFile(
  baseDir: string,
  conferenceDir: string,
  bulletinNumber: number,
  userSecLevel: number = 0,
  petsciiMode: boolean = false,
  ripMode: boolean = false
): string | null {
  // express.e:24636 - StringF(str,'\sBulletins/Bull\d',confScreenDir,stat)
  const bulletinPath = path.join(
    baseDir,
    conferenceDir,
    'Screens',
    'Bulletins',
    `Bull${bulletinNumber}`
  );

  return findSecurityScreen(bulletinPath, userSecLevel, petsciiMode, ripMode);
}

/**
 * Find BullHelp screen with security level variant
 *
 * @param baseDir - Base BBS directory
 * @param conferenceDir - Conference directory name
 * @param userSecLevel - User's security level
 * @param petsciiMode - Whether PETSCII mode is enabled
 * @param ripMode - Whether RIP mode is enabled
 * @returns Full path to BullHelp file, or null
 */
export function findBullHelpFile(
  baseDir: string,
  conferenceDir: string,
  userSecLevel: number = 0,
  petsciiMode: boolean = false,
  ripMode: boolean = false
): string | null {
  // express.e:24618-24619 - StrCopy(str,confScreenDir); StrAdd(str,'Bulletins/BullHelp')
  const bullHelpPath = path.join(
    baseDir,
    conferenceDir,
    'Screens',
    'Bulletins',
    'BullHelp'
  );

  return findSecurityScreen(bullHelpPath, userSecLevel, petsciiMode, ripMode);
}
