/**
 * Screen Security Utility
 * Finds screen files with security level variants
 *
 * 1:1 port from express.e:6246-6310 findSecurityScreen()
 */

import * as fs from 'fs';
import * as path from 'path';

// Default extensions if ScreenTypes.info not available
const DEFAULT_SCREEN_TYPE_EXTENSIONS = ['.TXT.GR', '.IBM'];
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
 * Get screen type extension with dot prefix
 * express.e:31918-31923 - Adds '.' prefix if not present
 *
 * @param screenTypeExt - Screen type extension (e.g., "GR", "IBM", ".TXT.GR")
 * @returns Extension with dot prefix (e.g., ".GR", ".IBM", ".TXT.GR")
 */
function normalizeScreenTypeExtension(screenTypeExt: string): string {
  // express.e:31918 - IF (tempstr2[0]<>".")
  if (screenTypeExt[0] !== '.') {
    // express.e:31919 - StringF(tempstr,'.\s',tempstr2)
    return `.${screenTypeExt}`;
  }
  // express.e:31922 - screenTypeExt.add(tempstr2)
  return screenTypeExt;
}

/**
 * Find security screen file with appropriate security level
 *
 * 1:1 port from express.e:6246-6310 findSecurityScreen()
 *
 * Algorithm:
 * 1. If DEF_SCREENS: Check non-security screens first, then security screens
 * 2. If not DEF_SCREENS: Check security screens first, then non-security screens
 * 3. For each check: RIP mode → User screen type → Plain .TXT
 * 4. Security levels checked from user's level down to minLevel (5) in steps of 5
 *
 * @param screenDirAndName - Full path to screen without extension (e.g., "/path/to/Bulletins/Bull1")
 * @param userSecLevel - User's security level (0-255)
 * @param userScreenTypeExt - User's preferred screen type extension (e.g., ".TXT.GR", ".IBM")
 * @param ripMode - Whether RIP mode is enabled (prefer .RIP files)
 * @param defScreens - DEF_SCREENS tooltype (if true, check non-security first)
 * @returns Full path to found screen file, or null if not found
 */
export function findSecurityScreen(
  screenDirAndName: string,
  userSecLevel: number = 0,
  userScreenTypeExt: string | null = null,
  ripMode: boolean = false,
  defScreens: boolean = false
): string | null {
  const minLevel = 5;

  /**
   * Check for a screen file with given security level
   * express.e:6258-6288
   *
   * Priority:
   * 1. RIP mode: .RIP
   * 2. User screen type: .TXT.GR, .IBM, etc.
   * 3. Plain text: .TXT
   */
  const checkScreen = (basePath: string): string | null => {
    // express.e:6258-6260 - IF ripMode check .RIP first
    if (ripMode) {
      const ripPath = `${basePath}.RIP`;
      const resolved = resolveCaseInsensitivePath(ripPath);
      if (resolved) {
console.log(`[SCREEN] Found RIP screen: ${resolved}`);
        return resolved;
      }
    }

    // express.e:6264-6267 - Check user's screen type preference
    if (userScreenTypeExt) {
      const normalized = normalizeScreenTypeExtension(userScreenTypeExt);
      const userTypePath = `${basePath}${normalized}`;
      const resolved = resolveCaseInsensitivePath(userTypePath);
      if (resolved) {
console.log(`[SCREEN] Found user screen type: ${resolved}`);
        return resolved;
      }
    }

    // express.e:6269-6270 - Fallback to .TXT
    for (const txtExt of TEXT_EXTENSIONS) {
      const txtPath = `${basePath}${txtExt}`;
      const resolved = resolveCaseInsensitivePath(txtPath);
      if (resolved) {
console.log(`[SCREEN] Found text screen: ${resolved}`);
        return resolved;
      }
    }

    return null;
  };

  // express.e:6251-6271 - DEF_SCREENS means find non-security screens first
  if (defScreens) {
    // express.e:6257-6271 - Check non-security screens first
    const nonSecurityScreen = checkScreen(screenDirAndName);
    if (nonSecurityScreen) {
      return nonSecurityScreen;
    }
  }

  // express.e:6273-6290 - Check security screens
  // Round down to nearest 5
  let secLevel = Math.floor(userSecLevel / 5) * 5;

  // Check security level screens (highest to lowest)
  while (secLevel >= minLevel) {
    const securityBasePath = `${screenDirAndName}${secLevel}`;
    const securityScreen = checkScreen(securityBasePath);
    if (securityScreen) {
      return securityScreen;
    }

    // express.e:6288 - Decrement by 5
    secLevel = secLevel - 5;
  }

  // express.e:6292-6306 - Check non-security screens at end if not DEF_SCREENS
  if (!defScreens) {
    const nonSecurityScreen = checkScreen(screenDirAndName);
    if (nonSecurityScreen) {
      return nonSecurityScreen;
    }
  }

  // express.e:6308 - No screen found
console.warn(`[SCREEN] Not found: ${screenDirAndName} (checked levels ${userSecLevel} down to ${minLevel})`);
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
 * @param userScreenTypeExt - User's preferred screen type extension
 * @param ripMode - Whether RIP mode is enabled
 * @param defScreens - DEF_SCREENS tooltype
 * @returns Full path to bulletin file, or null
 */
export function findBulletinFile(
  baseDir: string,
  conferenceDir: string,
  bulletinNumber: number,
  userSecLevel: number = 0,
  userScreenTypeExt: string | null = null,
  ripMode: boolean = false,
  defScreens: boolean = false
): string | null {
  // express.e:24636 - StringF(str,'\sBulletins/Bull\d',confScreenDir,stat)
  const bulletinPath = path.join(
    baseDir,
    conferenceDir,
    'Screens',
    'Bulletins',
    `Bull${bulletinNumber}`
  );

  return findSecurityScreen(bulletinPath, userSecLevel, userScreenTypeExt, ripMode, defScreens);
}

/**
 * Find BullHelp screen with security level variant
 *
 * @param baseDir - Base BBS directory
 * @param conferenceDir - Conference directory name
 * @param userSecLevel - User's security level
 * @param userScreenTypeExt - User's preferred screen type extension
 * @param ripMode - Whether RIP mode is enabled
 * @param defScreens - DEF_SCREENS tooltype
 * @returns Full path to BullHelp file, or null
 */
export function findBullHelpFile(
  baseDir: string,
  conferenceDir: string,
  userSecLevel: number = 0,
  userScreenTypeExt: string | null = null,
  ripMode: boolean = false,
  defScreens: boolean = false
): string | null {
  // express.e:24618-24619 - StrCopy(str,confScreenDir); StrAdd(str,'Bulletins/BullHelp')
  const bullHelpPath = path.join(
    baseDir,
    conferenceDir,
    'Screens',
    'Bulletins',
    'BullHelp'
  );

  return findSecurityScreen(bullHelpPath, userSecLevel, userScreenTypeExt, ripMode, defScreens);
}
