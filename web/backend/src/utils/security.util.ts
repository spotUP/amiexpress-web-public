/**
 * Security Utility - checkSecurity() and related functions
 *
 * This module implements the AmiExpress Access Control System (ACS)
 * Based on express.e lines 8430-8497 (1:1 port)
 *
 * The security system is a three-tier permission system:
 * 1. Security Level (user.secLevel 0-255) - Basic numeric level
 * 2. ACS Flags (87 boolean permissions) - Granular access control
 * 3. ToolType Files (.info files) - Configuration-based overrides
 *
 * Check Priority Order (from express.e:8455-8497):
 * 1. Override denials (secOverride) - strongest denial
 * 2. Temporary session flags (securityFlags) - per-session overrides
 * 3. Hardcoded special cases - specific ACS codes with special handling
 * 4. Default access file (Access.info) - default for all users
 * 5. User-specific access file (Access/<username>.info) - user overrides
 * 6. ACS level file (Access/ACS.<level>.info) - level-based access
 */

import { ACSCode, ACS_NAMES } from '../constants/acs-codes';
import { EnvStat } from '../constants/env-codes';
import { findAcsLevel } from '../constants/security-levels';

/**
 * BBSSession interface extension for security fields
 * These fields will be added to the main BBSSession interface
 */
export interface SecuritySession {
  /** Current ACS level (0-255, or -1 if invalid) */
  acsLevel: number;

  /** Temporary per-session ACS overrides ("T"=true, "F"=false, "?"=undefined) */
  securityFlags: string;

  /** Permanent override denials ("T"=deny access) - strongest denial */
  secOverride: string;

  /** Whether to skip default access checks */
  overrideDefaultAccess: boolean;

  /** Whether user has specific access file (Access/<username>.info) */
  userSpecificAccess: boolean;

  /** Current environment status (what user is doing) */
  currentStat: EnvStat;

  /** Whether node is in quiet mode (invisible to WHO command) */
  quietFlag: boolean;

  /** Whether to block Online Messages (OLM) */
  blockOLM: boolean;
}

/**
 * Check if user has permission for a specific ACS code
 * Based on express.e checkSecurity() - lines 8455-8497 (1:1 port)
 *
 * @param session - BBS session with security fields
 * @param acsCode - ACS permission code to check
 * @returns true if user has permission, false if denied
 */
export function checkSecurity(session: any, acsCode: ACSCode): boolean {
  // Step 1: Check if user logged on (express.e:8456)
  if (!session.user) {
    return false;
  }

  // Step 2: Check override denials (express.e:8458-8460)
  // secOverride is the strongest denial - if "T", access is DENIED
  if (session.secOverride && session.secOverride.length > acsCode) {
    if (session.secOverride[acsCode] === 'T') {
      return false; // Override to deny
    }
  }

  // Step 3: Check temporary session flags (express.e:8462-8464)
  // securityFlags provides per-session overrides
  if (session.securityFlags && session.securityFlags.length > acsCode) {
    if (session.securityFlags[acsCode] !== '?') {
      return session.securityFlags[acsCode] === 'T';
    }
  }

  // Step 4: Check hardcoded special cases (express.e:8466-8485)
  // Some ACS codes have special logic instead of file lookups

  // Always allow these (express.e:8483-8485)
  if (
    acsCode === ACSCode.MSG_LEVEL ||
    acsCode === ACSCode.MSG_EXPERATION ||
    acsCode === ACSCode.CUSTOMCOMMANDS ||
    acsCode === ACSCode.JOIN_SUB_CONFERENCE
  ) {
    return true;
  }

  // WILDCARDS - check system configuration (express.e:8480-8481)
  if (acsCode === ACSCode.WILDCARDS) {
    // TODO for 100% 1:1: Check sopt.toggles[TOGGLES_USEWILDCARDS]
    // For now, default to true
    return true;
  }

  // Step 5: Check default access file (express.e:8487-8489)
  // TODO for 100% 1:1: Implement checkToolTypeExists(TOOLTYPE_DEFAULT_ACCESS)
  // This would check BBS/Access.info for the ACS string name
  // For now, skip to next step

  // Step 6: Check if acsLevel valid (express.e:8491)
  if (session.acsLevel === -1) {
    return false;
  }

  // Step 7: Check user-specific access file (express.e:8493-8495)
  // TODO for 100% 1:1: Implement checkToolTypeExists(TOOLTYPE_USER_ACCESS)
  // This would check BBS/Access/<username>.info
  // For now, skip to final step

  // Step 8: Check security level-based access (express.e:8497)
  // For now, use simple level-based checks until ToolType file system is implemented
  return checkSecurityByLevel(session, acsCode);
}

/**
 * Fallback security check based on security level
 * Used until ToolType file system is fully implemented
 *
 * @param session - BBS session
 * @param acsCode - ACS permission code
 * @returns true if level grants permission
 */
function checkSecurityByLevel(session: any, acsCode: ACSCode): boolean {
  const level = session.user?.secLevel || 0;

  // Full sysop (255) has all permissions
  if (level >= 255) return true;

  // Sysop commands require level 200+ (express.e:24843, 25661, etc.)
  if (acsCode === ACSCode.SYSOP_COMMANDS) {
    return level >= 200;
  }

  // High-privilege commands require level 100+ (co-sysop)
  if (
    acsCode === ACSCode.CONFFLAGS ||
    acsCode === ACSCode.EDIT_DIRS ||
    acsCode === ACSCode.EDIT_FILES ||
    acsCode === ACSCode.CREATE_CONFERENCE ||
    acsCode === ACSCode.SYSOP_DOWNLOAD ||
    acsCode === ACSCode.SYSOP_VIEW ||
    acsCode === ACSCode.SYSOP_READ
  ) {
    return level >= 100;
  }

  // Most user commands require level 10+ (basic user)
  if (
    acsCode === ACSCode.READ_MESSAGE ||
    acsCode === ACSCode.ENTER_MESSAGE ||
    acsCode === ACSCode.DOWNLOAD ||
    acsCode === ACSCode.UPLOAD ||
    acsCode === ACSCode.FILE_LISTINGS ||
    acsCode === ACSCode.VIEW_A_FILE ||
    acsCode === ACSCode.JOIN_CONFERENCE ||
    acsCode === ACSCode.READ_BULLETINS ||
    acsCode === ACSCode.COMMENT_TO_SYSOP ||
    acsCode === ACSCode.PAGE_SYSOP ||
    acsCode === ACSCode.DISPLAY_USER_STATS ||
    acsCode === ACSCode.EDIT_USER_INFO ||
    acsCode === ACSCode.EDIT_PASSWORD ||
    acsCode === ACSCode.VOTE
  ) {
    return level >= 10;
  }

  // Account editing and profile changes require level 10+
  if (
    acsCode === ACSCode.ACCOUNT_EDITING ||
    acsCode === ACSCode.EDIT_USER_NAME ||
    acsCode === ACSCode.EDIT_USER_LOCATION ||
    acsCode === ACSCode.EDIT_PHONE_NUMBER ||
    acsCode === ACSCode.EDIT_INTERNET_NAME ||
    acsCode === ACSCode.EDIT_EMAIL ||
    acsCode === ACSCode.EDIT_REAL_NAME
  ) {
    return level >= 10;
  }

  // Default: deny access
  return false;
}

/**
 * Set temporary security flag (grant permission for session)
 * Based on express.e setTempSecurityFlags() - lines 8430-8435
 *
 * @param session - BBS session
 * @param acsCode - ACS code to grant
 */
export function setTempSecurityFlag(session: any, acsCode: ACSCode): void {
  // Ensure securityFlags is long enough
  while (session.securityFlags.length <= acsCode) {
    session.securityFlags += '?';
  }
  // Set to "T" (true)
  session.securityFlags =
    session.securityFlags.substring(0, acsCode) +
    'T' +
    session.securityFlags.substring(acsCode + 1);
}

/**
 * Clear temporary security flag (deny permission for session)
 * Based on express.e clearTempSecurityFlags() - lines 8437-8442
 *
 * @param session - BBS session
 * @param acsCode - ACS code to deny
 */
export function clearTempSecurityFlag(session: any, acsCode: ACSCode): void {
  // Ensure securityFlags is long enough
  while (session.securityFlags.length <= acsCode) {
    session.securityFlags += '?';
  }
  // Set to "F" (false)
  session.securityFlags =
    session.securityFlags.substring(0, acsCode) +
    'F' +
    session.securityFlags.substring(acsCode + 1);
}

/**
 * Set override (strongest denial - blocks even if otherwise granted)
 * Based on express.e setOverride() - lines 8448-8453
 *
 * @param session - BBS session
 * @param acsCode - ACS code to permanently deny
 */
export function setOverride(session: any, acsCode: ACSCode): void {
  // Ensure secOverride is long enough
  while (session.secOverride.length <= acsCode) {
    session.secOverride += 'F';
  }
  // Set to "T" (deny)
  session.secOverride =
    session.secOverride.substring(0, acsCode) +
    'T' +
    session.secOverride.substring(acsCode + 1);
}

/**
 * Clear all override denials
 * Based on express.e clearOverride() - lines 8444-8446
 *
 * @param session - BBS session
 */
export function clearOverride(session: any): void {
  session.secOverride = '';
}

/**
 * Set environment status (what user is currently doing)
 * Based on express.e setEnvStat() - lines 13184-13229 (simplified for web version)
 *
 * In the original, this updates:
 * - Shared semaphore for multi-node coordination
 * - AmigaDOS environment variables
 * - Master ACP process notifications
 * - Execute-on STATUS_CHANGE scripts
 *
 * In the web version, we just track the status in the session.
 *
 * @param session - BBS session
 * @param envStat - Environment status code
 */
export function setEnvStat(session: any, envStat: EnvStat): void {
  session.currentStat = envStat;

  // TODO for 100% 1:1: Implement multi-node coordination
  // TODO for 100% 1:1: Implement STATUS_CHANGE execute-on scripts
  // For now, just set the status in the session
}

/**
 * Initialize security fields for a new session
 * Called during login (express.e lines 447-455)
 *
 * @param session - BBS session to initialize
 */
export function initializeSecurity(session: any): void {
  // Calculate ACS level (express.e:447)
  session.acsLevel = findAcsLevel(session.user?.secLevel || 0);

  // Check if user-specific access file exists (express.e:450)
  // TODO for 100% 1:1: Implement checkToolTypeExists(TOOLTYPE_USER_ACCESS, 0, username)
  session.userSpecificAccess = false;

  // Check override defaults (express.e:453)
  // TODO for 100% 1:1: Implement checkSecurity(ACS_OVERRIDE_DEFAULTS)
  session.overrideDefaultAccess = false;

  // Clear temporary flags (express.e:455)
  session.securityFlags = '';
  session.secOverride = '';

  // Initialize environment status
  session.currentStat = EnvStat.IDLE;
  session.quietFlag = false;
  session.blockOLM = false;
}
