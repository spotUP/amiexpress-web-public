/**
 * ACS (Access Control System) Utility
 * 1:1 port from express.e lines 8455-8497
 *
 * Implements the security/permission system from AmiExpress.
 * This controls user access to all BBS features.
 */

import { ACSPermission, ACS_PERMISSION_NAMES } from '../constants/acs-permissions';
import type { User } from '../database';

// ===== User Flag Constants (axenums.e:46) =====
export enum UserFlags {
  NEWMSG = 1,          // Show new user message
  TOCONF1 = 2,         // To conference 1
  ONETIME_MSG = 4,     // Show all users only once
  SCRNCLR = 8,         // Screen clear code sent
  DONATED = 16,        // User donated
  ED_FULLSCREEN = 32,  // Full screen editor
  ED_PROMPT = 64,      // Editor prompt
  BGFILECHECK = 128    // Background file check
}

// ===== Level Constants (axcommon.e:40-70) =====
export enum LevelFlags {
  UPLOAD = 10,
  VIEW_A_FILE = 11,
  EDIT_USER_INFO = 12,
  LVL_REMOTE_SHELL = 13,
  ZIPPY_TEXT_SEARCH = 14,
  OVERRIDE_CHAT = 15,
  EDIT_USER_NAME = 16,
  EDIT_USER_LOCATION = 17,
  EDIT_PHONE_NUMBER = 18,
  EDIT_PASSWORD = 19,
  SENTBY_FILES = 20,
  DEFAULT_CHAT_ON = 21,
  CLEAR_SCREEN_MSG = 22,
  CAPITOLS_IN_FILE = 23,
  CHAT_COLOR_SYSOP = 24,
  CHAT_COLOR_USER = 25,
  VARYING_LINK_RATE = 26,
  KEEP_UPLOAD_CREDIT = 27,
  ALLOW_FREE_RESUMING = 28,
  DO_CALLERSLOG = 29,
  DO_UD_LOG = 30,
  OVERRIDE_TIMES = 41,
  BULLETINS = 42,
  SYSOP_READ = 43,
  NODE_NUMBER = 44,
  SCREEN_TO_FRONT = 45,
  ZOO = 46,
  PKAX = 47,
  LHARC = 48,
  WARP = 49,
  LONGWHO = 50
}

// ===== Toggle Constants (axcommon.e:366-385) =====
export enum ToggleFlags {
  TRUERESET = 0,
  CONFRELATIVE = 1,
  DOORLOG = 2,
  STARTLOG = 3,
  NOTIMEOUT = 4,
  NOMCIMSGS = 5,
  RED1 = 6,
  BREAK_CHAT = 7,
  NAMEBASE = 8,
  QUIETSTART = 9,
  MULTICOM = 10,
  NOPURGE = 11,
  REPURGE = 12,
  REUSEINACTIVE = 13,
  USEWILDCARDS = 14,
  CALLERID = 15,
  CALLERIDNAME = 16,
  SERIALRESET = 17,
  AREABASE = 18,
  CREDITBYKB = 19
}

// ===== Configuration Structure =====
export interface ACSConfig {
  acLvl: number[];      // Access level configuration array
  toggles: boolean[];   // System toggle options
  overrideDefaultAccess: boolean;
  userSpecificAccess: boolean;
}

// Default configuration
let acsConfig: ACSConfig = {
  acLvl: new Array(51).fill(0),      // Initialize with 51 elements (0-50)
  toggles: new Array(20).fill(false), // Initialize with 20 elements (0-19)
  overrideDefaultAccess: false,
  userSpecificAccess: false
};

// ===== Configuration Management =====
export function setACSConfig(config: Partial<ACSConfig>) {
  acsConfig = { ...acsConfig, ...config };
}

export function getACSConfig(): ACSConfig {
  return acsConfig;
}

/**
 * Check Security Permission
 * 1:1 port from express.e:8455-8497 checkSecurity()
 *
 * @param user - The logged-on user (null if not logged in)
 * @param securityFlag - ACS permission index (0-86)
 * @param userKeys - User key flags (optional, can be part of user object)
 * @returns true if user has permission, false otherwise
 */
export function checkSecurity(
  user: User | null,
  securityFlag: ACSPermission,
  userKeys?: { userFlags: number }
): boolean {
  // express.e:8456 - IF (loggedOnUser=NIL) THEN RETURN FALSE
  if (!user) return false;

  // express.e:8458-8460 - Check secOverride
  // IF (StrLen(secOverride)>securityFlag)
  //   IF secOverride[securityFlag]="T" THEN RETURN FALSE
  if (user.secOverride && user.secOverride.length > securityFlag) {
    if (user.secOverride[securityFlag] === 'T') return false;
  }

  // express.e:8462-8465 - Check securityFlags
  // IF (StrLen(securityFlags)>securityFlag)
  //   IF securityFlags[securityFlag]<>"?" THEN RETURN (securityFlags[securityFlag]="T")
  if (user.securityFlags && user.securityFlags.length > securityFlag) {
    if (user.securityFlags[securityFlag] !== '?') {
      return user.securityFlags[securityFlag] === 'T';
    }
  }

  // express.e:8467-8483 - Special permission checks
  if (securityFlag === ACSPermission.SENTBY_FILES) {
    return acsConfig.acLvl[LevelFlags.SENTBY_FILES] === 1;
  } else if (securityFlag === ACSPermission.DEFAULT_CHAT_ON) {
    return acsConfig.acLvl[LevelFlags.DEFAULT_CHAT_ON] === 1;
  } else if (securityFlag === ACSPermission.CLEAR_SCREEN_MSG) {
    // express.e:8471 - IF loggedOnUserKeys=NIL THEN RETURN FALSE
    if (!userKeys && !user.userFlags) return false;
    // express.e:8472 - RETURN loggedOnUserKeys.userFlags AND USER_SCRNCLR
    const flags = userKeys ? userKeys.userFlags : user.userFlags;
    return (flags & UserFlags.SCRNCLR) !== 0;
  } else if (securityFlag === ACSPermission.KEEP_UPLOAD_CREDIT) {
    return acsConfig.acLvl[LevelFlags.KEEP_UPLOAD_CREDIT] > 0;
  } else if (securityFlag === ACSPermission.DO_CALLERSLOG) {
    return acsConfig.acLvl[LevelFlags.DO_CALLERSLOG] === 1;
  } else if (securityFlag === ACSPermission.DO_UD_LOG) {
    return acsConfig.acLvl[LevelFlags.DO_UD_LOG] === 1;
  } else if (securityFlag === ACSPermission.SCREEN_TO_FRONT) {
    return acsConfig.acLvl[LevelFlags.SCREEN_TO_FRONT] === 1;
  } else if (securityFlag === ACSPermission.WILDCARDS) {
    return acsConfig.toggles[ToggleFlags.USEWILDCARDS] === true;
  } else if (
    securityFlag === ACSPermission.MSG_LEVEL ||
    securityFlag === ACSPermission.MSG_EXPERATION ||
    securityFlag === ACSPermission.CUSTOMCOMMANDS ||
    securityFlag === ACSPermission.JOIN_SUB_CONFERENCE
  ) {
    // express.e:8483 - These permissions always return TRUE
    return true;
  }

  // express.e:8487-8489 - Check default access
  // IF (overrideDefaultAccess=FALSE) AND (securityFlag<>ACS_OVERRIDE_DEFAULTS)
  //   IF checkToolTypeExists(TOOLTYPE_DEFAULT_ACCESS,0,ListItem(securityNames,securityFlag)) THEN RETURN TRUE
  if (
    !acsConfig.overrideDefaultAccess &&
    securityFlag !== ACSPermission.OVERRIDE_DEFAULTS
  ) {
    // In web version, we'll use a simple default: allow if sec level >= 10
    if (user.secLevel >= 10) return true;
  }

  // express.e:8491 - IF (acsLevel=-1) THEN RETURN FALSE
  const acsLevel = user.secLevel;
  if (acsLevel === -1) return false;

  // express.e:8493-8495 - Check user-specific access
  // IF userSpecificAccess
  //   IF checkToolTypeExists(TOOLTYPE_USER_ACCESS,0,ListItem(securityNames,securityFlag)) THEN RETURN TRUE
  if (acsConfig.userSpecificAccess) {
    // In web version, sysop (level 255) gets all permissions
    if (user.secLevel === 255) return true;
  }

  // express.e:8497 - Final fallback: check access level
  // ENDPROC checkToolTypeExists(TOOLTYPE_ACCESS,acsLevel,ListItem(securityNames,securityFlag))
  // For web version: default deny unless seclevel >= 100 for most operations
  return user.secLevel >= 100;
}

/**
 * Check if user has permission by permission name
 */
export function checkSecurityByName(
  user: User | null,
  permissionName: string,
  userKeys?: { userFlags: number }
): boolean {
  const index = ACS_PERMISSION_NAMES.indexOf(permissionName);
  if (index === -1) return false;
  return checkSecurity(user, index, userKeys);
}

/**
 * Get list of all permissions a user has
 */
export function getUserPermissions(user: User | null): string[] {
  if (!user) return [];

  const permissions: string[] = [];
  for (let i = 0; i < ACS_PERMISSION_NAMES.length; i++) {
    if (checkSecurity(user, i)) {
      permissions.push(ACS_PERMISSION_NAMES[i]);
    }
  }
  return permissions;
}

/**
 * Set user permission flag
 */
export function setUserPermission(
  user: User,
  securityFlag: ACSPermission,
  allowed: boolean
): void {
  if (!user.securityFlags) {
    // Initialize with all '?' (use default)
    user.securityFlags = '?'.repeat(87);
  }

  // Ensure string is long enough
  while (user.securityFlags.length <= securityFlag) {
    user.securityFlags += '?';
  }

  // Set the permission
  const flags = user.securityFlags.split('');
  flags[securityFlag] = allowed ? 'T' : 'F';
  user.securityFlags = flags.join('');
}

/**
 * Override user permission (force deny)
 */
export function overrideUserPermission(
  user: User,
  securityFlag: ACSPermission,
  override: boolean
): void {
  if (!user.secOverride) {
    user.secOverride = ''.padEnd(87, ' ');
  }

  // Ensure string is long enough
  while (user.secOverride.length <= securityFlag) {
    user.secOverride += ' ';
  }

  // Set the override
  const overrides = user.secOverride.split('');
  overrides[securityFlag] = override ? 'T' : ' ';
  user.secOverride = overrides.join('');
}

/**
 * Check if user has a specific user flag
 */
export function hasUserFlag(user: User, flag: UserFlags): boolean {
  return (user.userFlags & flag) !== 0;
}

/**
 * Set a user flag
 */
export function setUserFlag(user: User, flag: UserFlags, enabled: boolean): void {
  if (enabled) {
    user.userFlags |= flag;
  } else {
    user.userFlags &= ~flag;
  }
}
