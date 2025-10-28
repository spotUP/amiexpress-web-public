/**
 * Screen Security Utility
 * Finds screen files with security level variants
 *
 * 1:1 port from express.e:6246-6310 findSecurityScreen()
 */

import * as fs from 'fs';
import * as path from 'path';

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
 * @param screenDirAndName - Full path to screen without extension (e.g., "/path/to/Bulletins/Bull1")
 * @param userSecLevel - User's security level (0-255)
 * @returns Full path to found screen file, or null if not found
 */
export function findSecurityScreen(
  screenDirAndName: string,
  userSecLevel: number = 0
): string | null {
  const minLevel = 5;

  // express.e:6256-6260 - Check security screens
  // Round down to nearest 5
  let secLevel = Math.floor(userSecLevel / 5) * 5;

  // express.e:6260-6276 - Check security level screens (highest to lowest)
  while (secLevel >= minLevel) {
    // For web version, we only support .TXT files (no RIP graphics)
    // express.e:6272-6273
    const securityScreenPath = `${screenDirAndName}${secLevel}.TXT`;

    if (fs.existsSync(securityScreenPath)) {
      console.log(`✓ Found security screen: ${securityScreenPath} (level ${secLevel})`);
      return securityScreenPath;
    }

    // express.e:6274 - Decrement by 5
    secLevel = secLevel - 5;
  }

  // express.e:6280-6302 - Check non-security screens at end
  // This is the fallback screen with no security level suffix
  const defaultScreenPath = `${screenDirAndName}.TXT`;

  if (fs.existsSync(defaultScreenPath)) {
    console.log(`✓ Found default screen: ${defaultScreenPath}`);
    return defaultScreenPath;
  }

  // express.e:6304 - No screen found
  console.warn(`Screen not found: ${screenDirAndName} (checked levels ${userSecLevel} down to ${minLevel}, plus default)`);
  return null;
}

/**
 * Find bulletin file with security level variant
 * Wrapper around findSecurityScreen for bulletin-specific paths
 *
 * @param baseDir - Base BBS directory
 * @param conferenceDir - Conference directory name (e.g., "Conf01")
 * @param bulletinNumber - Bulletin number (1, 2, 3, etc.)
 * @param userSecLevel - User's security level
 * @returns Full path to bulletin file, or null
 */
export function findBulletinFile(
  baseDir: string,
  conferenceDir: string,
  bulletinNumber: number,
  userSecLevel: number = 0
): string | null {
  // express.e:24636 - StringF(str,'\sBulletins/Bull\d',confScreenDir,stat)
  const bulletinPath = path.join(
    baseDir,
    conferenceDir,
    'Screens',
    'Bulletins',
    `Bull${bulletinNumber}`
  );

  return findSecurityScreen(bulletinPath, userSecLevel);
}

/**
 * Find BullHelp screen with security level variant
 *
 * @param baseDir - Base BBS directory
 * @param conferenceDir - Conference directory name
 * @param userSecLevel - User's security level
 * @returns Full path to BullHelp file, or null
 */
export function findBullHelpFile(
  baseDir: string,
  conferenceDir: string,
  userSecLevel: number = 0
): string | null {
  // express.e:24618-24619 - StrCopy(str,confScreenDir); StrAdd(str,'Bulletins/BullHelp')
  const bullHelpPath = path.join(
    baseDir,
    conferenceDir,
    'Screens',
    'Bulletins',
    'BullHelp'
  );

  return findSecurityScreen(bullHelpPath, userSecLevel);
}
