/**
 * Screen Security Utility
 * Finds screen files with security level variants
 *
 * 1:1 port from express.e:6246-6310 findSecurityScreen()
 */

import * as fs from 'fs';
import * as path from 'path';
import { findCaseInsensitive } from './amigafs';
import { screenFileDrawsNothing } from '../screens/screen-blankness';

// Default extensions if ScreenTypes.info not available
const DEFAULT_SCREEN_TYPE_EXTENSIONS = ['.TXT.GR', '.IBM'];
const TEXT_EXTENSIONS = ['.TXT', '.txt'];

/**
 * A caller that wants hollow screen files kept out of the answer.
 *
 * `hollow` collects, in search order, every candidate that was present but
 * had nothing in it. The first entry is the one a caller should fall back to
 * when the whole walk came up empty.
 */
export interface HollowAware {
  hollow?: string[];
}

function resolveCaseInsensitivePath(targetPath: string): string | null {
  /*
   * THE LISTING ANSWERS THIS, and nothing else needs to.
   *
   * This used to try `fs.existsSync(targetPath)` first and, when the cached
   * listing then found a match, `fs.existsSync(match)` to confirm it - two
   * syscalls per call on the miss path, which is the common one: the level
   * walk below asks about ~200 names per screen per scope and almost all of
   * them are absent. Measured on this board, those existence checks were 931
   * ms of a 1.35 second index rebuild.
   *
   * `findCaseInsensitive` reads a directory listing that amigafs remembers
   * until the directory's mtime moves, so it already knows whether the name
   * is there - in any case - without asking the filesystem again. A listing
   * taken from a real readdir IS the existence check.
   */
  try {
    return findCaseInsensitive(path.dirname(targetPath), path.basename(targetPath));
  } catch {
    // A directory that will not list has nothing in it as far as this is
    // concerned.
    return null;
  }
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
 * @param petsciiMode - WEB_ extension over express.e (no Amiga equivalent):
 *   web C64 terminal / real-C64 PETSCII sessions prefer a .SEQ variant over
 *   everything else. See resolvePetsciiPath() in screen.handler.ts for the
 *   sibling non-security-lookup preference this mirrors.
 * @param texttvMode - WEB_ extension over express.e (no Amiga equivalent):
 *   teletext sessions (T answer at the graphics prompt) prefer a .TTI
 *   variant after .SEQ/.RIP and before the user screen type.
 * @returns Full path to found screen file, or null if not found
 */
export function findSecurityScreen(
  screenDirAndName: string,
  userSecLevel: number = 0,
  userScreenTypeExt: string | null = null,
  ripMode: boolean = false,
  defScreens: boolean = false,
  petsciiMode: boolean = false,
  texttvMode: boolean = false,
  options?: HollowAware
): string | null {
  const minLevel = 5;

  /*
   * A file with nothing in it does not answer the name - IF the caller has
   * somewhere else to look.
   *
   * This walk takes the first name that is present, down the security levels
   * and then across the scopes the loader hands it, so a hollow
   * `Logon100.txt` used to beat a perfectly good `Logon.txt` beside it.
   * express.e:6773 shows any file that OPENS, so the caller got a cleared
   * screen and a pause, and the fault read as a missing theme.
   *
   * Callers that pass a sink get hollow candidates collected there instead of
   * returned, and decide for themselves what to do when every scope was
   * hollow (the loader keeps the first one, so a screen the sysop blanked on
   * purpose still resolves and is simply not drawn - it must never be
   * reported as a screen that is MISSING). Callers that pass nothing behave
   * exactly as they always did.
   */
  const takeHollow = (resolved: string | null): string | null => {
    if (!resolved || !options?.hollow) return resolved;
    if (!screenFileDrawsNothing(resolved)) return resolved;
    options.hollow.push(resolved);
    return null;
  };

  /**
   * Check for a screen file with given security level
   * express.e:6258-6288
   *
   * Priority:
   * 0. WEB_ extension (not in express.e): PETSCII mode: .SEQ
   * 0b. WEB_ extension (not in express.e): teletext mode: native .TTI
   *     first (validated as packets - an ANSI file wearing the name
   *     must not shadow the real variant), then ANSI .TTX.
   * 1. RIP mode: .RIP
   * 2. User screen type: .TXT.GR, .IBM, etc.
   * 3. Plain text: .TXT
   */
  const checkScreen = (basePath: string): string | null => {
    // WEB_ extension over express.e:6258-6270 - PETSCII sessions prefer .SEQ
    // ahead of RIP/screen-type/TXT. A PETSCII session is never simultaneously
    // a RIP session on this BBS, but if both flags were ever set, PETSCII
    // still wins here (matches resolvePetsciiPath()'s priority elsewhere).
    if (petsciiMode) {
      const seqPath = `${basePath}.SEQ`;
      const resolved = takeHollow(resolveCaseInsensitivePath(seqPath));
      if (resolved) {
console.log(`[SCREEN] Found PETSCII screen: ${resolved}`);
        return resolved;
      }
    }

    // express.e:6258-6260 - IF ripMode check .RIP first
    if (ripMode) {
      const ripPath = `${basePath}.RIP`;
      const resolved = takeHollow(resolveCaseInsensitivePath(ripPath));
      if (resolved) {
console.log(`[SCREEN] Found RIP screen: ${resolved}`);
        return resolved;
      }
    }

    // WEB_ extension over express.e - teletext sessions prefer native
    // packet .TTI first, then ANSI .TTX, both ahead of the user screen
    // type. Validation and rendering happen in the loader (which falls
    // back to the twin on unparseable packets); this slot answers paths.
    // A teletext session is never simultaneously PETSCII or RIP on this
    // BBS (the T branch clears both), so this slot only fires when
    // neither of theirs did.
    if (texttvMode) {
      const ttiPath = `${basePath}.TTI`;
      const resolvedTti = takeHollow(resolveCaseInsensitivePath(ttiPath));
      if (resolvedTti) {
console.log(`[SCREEN] Found native teletext screen: ${resolvedTti}`);
        return resolvedTti;
      }
      const ttxPath = `${basePath}.TTX`;
      const resolved = takeHollow(resolveCaseInsensitivePath(ttxPath));
      if (resolved) {
console.log(`[SCREEN] Found teletext screen: ${resolved}`);
        return resolved;
      }
    }

    // express.e:6264-6267 - Check user's screen type preference
    if (userScreenTypeExt) {
      const normalized = normalizeScreenTypeExtension(userScreenTypeExt);
      const userTypePath = `${basePath}${normalized}`;
      const resolved = takeHollow(resolveCaseInsensitivePath(userTypePath));
      if (resolved) {
console.log(`[SCREEN] Found user screen type: ${resolved}`);
        return resolved;
      }
    }

    // express.e:6269-6270 - Fallback to .TXT
    for (const txtExt of TEXT_EXTENSIONS) {
      const txtPath = `${basePath}${txtExt}`;
      const resolved = takeHollow(resolveCaseInsensitivePath(txtPath));
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

  /*
   * express.e:6308 - no screen found HERE, which is not news.
   *
   * This function answers for ONE directory, and the loader calls it once per
   * search location - so a miss is the search working, not a fault. It used
   * to write a WARN line for every one of them, and this board's logger
   * spends ~13ms per line: building the screen index (every screen, every
   * node directory, every theme) wrote 9,363 of them and took MINUTES, with
   * the admin's login-sequence request waiting behind it the whole time -
   * "found it on local now its stuck loading" (sysop, 2026-09-16).
   *
   * The real failure is still reported, once, by the caller that ran out of
   * places to look: `[SYSOP WARNING] Screen File: Screen "X" not found after
   * trying 6 locations`, with every location it tried listed above it.
   */
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
