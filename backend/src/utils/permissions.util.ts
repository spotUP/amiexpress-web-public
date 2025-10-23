/**
 * Permissions Utility
 * Centralized permission checking for BBS operations
 */

import { User } from '../types';

export class PermissionsUtil {
  /**
   * Check if user can delete files
   * Requires security level 100 or higher (sysop)
   */
  static canDeleteFiles(user: any): boolean {
    return user && user.secLevel >= 100;
  }

  /**
   * Check if user can move files between areas
   * Requires security level 100 or higher (sysop)
   */
  static canMoveFiles(user: any): boolean {
    return user && user.secLevel >= 100;
  }

  /**
   * Check if user can access file maintenance menu
   * Requires security level 100 or higher (sysop)
   */
  static canAccessFileMaintenance(user: any): boolean {
    return user && user.secLevel >= 100;
  }

  /**
   * Check if user can edit file descriptions
   * Requires security level 100 or higher (sysop)
   */
  static canEditFileDescriptions(user: any): boolean {
    return user && user.secLevel >= 100;
  }

  /**
   * Check if user can post messages
   * Requires security level 10 or higher
   */
  static canPostMessages(user: any): boolean {
    return user && user.secLevel >= 10;
  }

  /**
   * Check if user can delete messages
   * Can delete own messages OR sysop can delete any
   */
  static canDeleteMessage(user: any, messageAuthor: string): boolean {
    if (!user) return false;
    // Sysops can delete any message
    if (user.secLevel >= 100) return true;
    // Users can delete their own messages
    return user.username === messageAuthor;
  }

  /**
   * Check if user can access sysop functions
   * Requires security level 255 (full sysop)
   */
  static isSysop(user: any): boolean {
    return user && user.secLevel >= 255;
  }

  /**
   * Check if user can access co-sysop functions
   * Requires security level 100 or higher
   */
  static isCoSysop(user: any): boolean {
    return user && user.secLevel >= 100;
  }

  /**
   * Check if user has specific security level
   */
  static hasSecurityLevel(user: any, requiredLevel: number): boolean {
    return user && user.secLevel >= requiredLevel;
  }

  /**
   * Check if user can upload files
   * Requires security level 10 or higher
   */
  static canUploadFiles(user: any): boolean {
    return user && user.secLevel >= 10;
  }

  /**
   * Check if user can download files
   * All logged-in users can download
   */
  static canDownloadFiles(user: any): boolean {
    return user !== null && user !== undefined;
  }

  /**
   * Check if user can access door/external program
   * Requires security level 10 or higher
   */
  static canAccessDoors(user: any): boolean {
    return user && user.secLevel >= 10;
  }

  /**
   * Check if user can page sysop for chat
   * All logged-in users can page (if chat is enabled)
   */
  static canPageSysop(user: any): boolean {
    return user !== null && user !== undefined;
  }
}
