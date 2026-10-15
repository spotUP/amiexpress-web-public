/**
 * Security Utility - DEPRECATED
 *
 * This file has been consolidated with acs.util.ts.
 * All new code should import from acs.util.ts instead.
 *
 * This file remains as a compatibility wrapper for existing code.
 */

// Re-export everything from acs.util.ts
export * from './acs.util';

// Re-export ACSPermission as ACSCode for backward compatibility
export { ACSPermission as ACSCode } from '../constants/acs-permissions';
export { ACS_PERMISSION_NAMES as ACS_NAMES } from '../constants/acs-permissions';

// Re-export EnvStat (not duplicated, just commonly used with security)
export { EnvStat } from '../constants/env-codes';

// Re-export findAcsLevel from ACS access loader (express.e:3025-3035 file-based scan)
export { findAcsLevel } from './acs-access-loader';

/**
 * Security session interface - now part of User object in acs.util.ts
 * Kept for backward compatibility
 */
export interface SecuritySession {
  acsLevel: number;
  securityFlags: string;
  secOverride: string;
  overrideDefaultAccess: boolean;
  userSpecificAccess: boolean;
  currentStat: any;
  quietFlag: boolean;
  blockOLM: boolean;
}

/**
 * All security functions (checkSecurity, setTempSecurityFlag, etc.)
 * are now exported from acs.util.ts above.
 *
 * Migration guide:
 * - Replace: import { checkSecurity } from './utils/security.util'
 * - With:    import { checkSecurity } from './utils/acs.util'
 * - Replace: ACSCode enum
 * - With:    ACSPermission enum
 */
