/**
 * Permissions Utility Unit Tests
 *
 * Tests all permission checking functions for security level enforcement.
 * Critical for BBS security - ensures proper access control.
 */

import { PermissionsUtil } from '../../src/utils/permissions.util';

describe('PermissionsUtil', () => {
  // Test user fixtures
  const guest = { username: 'guest', secLevel: 0 };
  const regularUser = { username: 'user', secLevel: 10 };
  const trustedUser = { username: 'trusted', secLevel: 50 };
  const coSysop = { username: 'cosysop', secLevel: 100 };
  const sysop = { username: 'sysop', secLevel: 255 };

  describe('canDeleteFiles', () => {
    it('should allow sysop (secLevel 255)', () => {
      expect(PermissionsUtil.canDeleteFiles(sysop)).toBe(true);
    });

    it('should allow co-sysop (secLevel 100)', () => {
      expect(PermissionsUtil.canDeleteFiles(coSysop)).toBe(true);
    });

    it('should deny regular user (secLevel 10)', () => {
      expect(PermissionsUtil.canDeleteFiles(regularUser)).toBe(false);
    });

    it('should deny guest (secLevel 0)', () => {
      expect(PermissionsUtil.canDeleteFiles(guest)).toBe(false);
    });

    it('should deny null user', () => {
      expect(PermissionsUtil.canDeleteFiles(null)).toBe(false);
    });

    it('should deny undefined user', () => {
      expect(PermissionsUtil.canDeleteFiles(undefined)).toBe(false);
    });

    it('should allow exactly secLevel 100', () => {
      const exactLevel = { username: 'exact', secLevel: 100 };
      expect(PermissionsUtil.canDeleteFiles(exactLevel)).toBe(true);
    });

    it('should deny secLevel 99', () => {
      const belowThreshold = { username: 'below', secLevel: 99 };
      expect(PermissionsUtil.canDeleteFiles(belowThreshold)).toBe(false);
    });
  });

  describe('canMoveFiles', () => {
    it('should allow sysop (secLevel 255)', () => {
      expect(PermissionsUtil.canMoveFiles(sysop)).toBe(true);
    });

    it('should allow co-sysop (secLevel 100)', () => {
      expect(PermissionsUtil.canMoveFiles(coSysop)).toBe(true);
    });

    it('should deny regular user (secLevel 10)', () => {
      expect(PermissionsUtil.canMoveFiles(regularUser)).toBe(false);
    });

    it('should deny null user', () => {
      expect(PermissionsUtil.canMoveFiles(null)).toBe(false);
    });
  });

  describe('canAccessFileMaintenance', () => {
    it('should allow sysop (secLevel 255)', () => {
      expect(PermissionsUtil.canAccessFileMaintenance(sysop)).toBe(true);
    });

    it('should allow co-sysop (secLevel 100)', () => {
      expect(PermissionsUtil.canAccessFileMaintenance(coSysop)).toBe(true);
    });

    it('should deny regular user (secLevel 10)', () => {
      expect(PermissionsUtil.canAccessFileMaintenance(regularUser)).toBe(false);
    });

    it('should deny null user', () => {
      expect(PermissionsUtil.canAccessFileMaintenance(null)).toBe(false);
    });
  });

  describe('canEditFileDescriptions', () => {
    it('should allow sysop (secLevel 255)', () => {
      expect(PermissionsUtil.canEditFileDescriptions(sysop)).toBe(true);
    });

    it('should allow co-sysop (secLevel 100)', () => {
      expect(PermissionsUtil.canEditFileDescriptions(coSysop)).toBe(true);
    });

    it('should deny regular user (secLevel 10)', () => {
      expect(PermissionsUtil.canEditFileDescriptions(regularUser)).toBe(false);
    });

    it('should deny null user', () => {
      expect(PermissionsUtil.canEditFileDescriptions(null)).toBe(false);
    });
  });

  describe('canPostMessages', () => {
    it('should allow sysop (secLevel 255)', () => {
      expect(PermissionsUtil.canPostMessages(sysop)).toBe(true);
    });

    it('should allow co-sysop (secLevel 100)', () => {
      expect(PermissionsUtil.canPostMessages(coSysop)).toBe(true);
    });

    it('should allow regular user (secLevel 10)', () => {
      expect(PermissionsUtil.canPostMessages(regularUser)).toBe(true);
    });

    it('should deny guest (secLevel 0)', () => {
      expect(PermissionsUtil.canPostMessages(guest)).toBe(false);
    });

    it('should deny null user', () => {
      expect(PermissionsUtil.canPostMessages(null)).toBe(false);
    });

    it('should allow exactly secLevel 10', () => {
      const exactLevel = { username: 'exact', secLevel: 10 };
      expect(PermissionsUtil.canPostMessages(exactLevel)).toBe(true);
    });

    it('should deny secLevel 9', () => {
      const belowThreshold = { username: 'below', secLevel: 9 };
      expect(PermissionsUtil.canPostMessages(belowThreshold)).toBe(false);
    });
  });

  describe('canDeleteMessage', () => {
    it('should allow sysop to delete any message', () => {
      expect(PermissionsUtil.canDeleteMessage(sysop, 'otheruser')).toBe(true);
    });

    it('should allow co-sysop to delete any message', () => {
      expect(PermissionsUtil.canDeleteMessage(coSysop, 'otheruser')).toBe(true);
    });

    it('should allow user to delete own message', () => {
      expect(PermissionsUtil.canDeleteMessage(regularUser, 'user')).toBe(true);
    });

    it('should deny user deleting others message', () => {
      expect(PermissionsUtil.canDeleteMessage(regularUser, 'otheruser')).toBe(false);
    });

    it('should deny null user', () => {
      expect(PermissionsUtil.canDeleteMessage(null, 'user')).toBe(false);
    });

    it('should handle case-sensitive username matching', () => {
      expect(PermissionsUtil.canDeleteMessage(regularUser, 'User')).toBe(false);
      expect(PermissionsUtil.canDeleteMessage(regularUser, 'user')).toBe(true);
    });

    it('should allow guest to delete own message', () => {
      expect(PermissionsUtil.canDeleteMessage(guest, 'guest')).toBe(true);
    });
  });

  describe('isSysop', () => {
    it('should return true for secLevel 255', () => {
      expect(PermissionsUtil.isSysop(sysop)).toBe(true);
    });

    it('should return false for co-sysop (secLevel 100)', () => {
      expect(PermissionsUtil.isSysop(coSysop)).toBe(false);
    });

    it('should return false for regular user', () => {
      expect(PermissionsUtil.isSysop(regularUser)).toBe(false);
    });

    it('should return false for null user', () => {
      expect(PermissionsUtil.isSysop(null)).toBe(false);
    });

    it('should return false for secLevel 254', () => {
      const almostSysop = { username: 'almost', secLevel: 254 };
      expect(PermissionsUtil.isSysop(almostSysop)).toBe(false);
    });

    it('should return true for secLevel above 255', () => {
      const superSysop = { username: 'super', secLevel: 300 };
      expect(PermissionsUtil.isSysop(superSysop)).toBe(true);
    });
  });

  describe('isCoSysop', () => {
    it('should return true for sysop (secLevel 255)', () => {
      expect(PermissionsUtil.isCoSysop(sysop)).toBe(true);
    });

    it('should return true for co-sysop (secLevel 100)', () => {
      expect(PermissionsUtil.isCoSysop(coSysop)).toBe(true);
    });

    it('should return false for regular user (secLevel 10)', () => {
      expect(PermissionsUtil.isCoSysop(regularUser)).toBe(false);
    });

    it('should return false for null user', () => {
      expect(PermissionsUtil.isCoSysop(null)).toBe(false);
    });

    it('should return true for exactly secLevel 100', () => {
      const exactLevel = { username: 'exact', secLevel: 100 };
      expect(PermissionsUtil.isCoSysop(exactLevel)).toBe(true);
    });

    it('should return false for secLevel 99', () => {
      const belowThreshold = { username: 'below', secLevel: 99 };
      expect(PermissionsUtil.isCoSysop(belowThreshold)).toBe(false);
    });
  });

  describe('hasSecurityLevel', () => {
    it('should return true when user meets required level', () => {
      expect(PermissionsUtil.hasSecurityLevel(regularUser, 10)).toBe(true);
      expect(PermissionsUtil.hasSecurityLevel(coSysop, 100)).toBe(true);
      expect(PermissionsUtil.hasSecurityLevel(sysop, 255)).toBe(true);
    });

    it('should return true when user exceeds required level', () => {
      expect(PermissionsUtil.hasSecurityLevel(sysop, 100)).toBe(true);
      expect(PermissionsUtil.hasSecurityLevel(coSysop, 50)).toBe(true);
    });

    it('should return false when user below required level', () => {
      expect(PermissionsUtil.hasSecurityLevel(regularUser, 50)).toBe(false);
      expect(PermissionsUtil.hasSecurityLevel(guest, 10)).toBe(false);
    });

    it('should return false for null user', () => {
      expect(PermissionsUtil.hasSecurityLevel(null, 10)).toBe(false);
    });

    it('should handle zero required level', () => {
      expect(PermissionsUtil.hasSecurityLevel(guest, 0)).toBe(true);
      expect(PermissionsUtil.hasSecurityLevel(regularUser, 0)).toBe(true);
    });

    it('should handle custom security levels', () => {
      expect(PermissionsUtil.hasSecurityLevel(trustedUser, 50)).toBe(true);
      expect(PermissionsUtil.hasSecurityLevel(trustedUser, 51)).toBe(false);
    });
  });

  describe('canUploadFiles', () => {
    it('should allow sysop (secLevel 255)', () => {
      expect(PermissionsUtil.canUploadFiles(sysop)).toBe(true);
    });

    it('should allow co-sysop (secLevel 100)', () => {
      expect(PermissionsUtil.canUploadFiles(coSysop)).toBe(true);
    });

    it('should allow regular user (secLevel 10)', () => {
      expect(PermissionsUtil.canUploadFiles(regularUser)).toBe(true);
    });

    it('should deny guest (secLevel 0)', () => {
      expect(PermissionsUtil.canUploadFiles(guest)).toBe(false);
    });

    it('should deny null user', () => {
      expect(PermissionsUtil.canUploadFiles(null)).toBe(false);
    });

    it('should allow exactly secLevel 10', () => {
      const exactLevel = { username: 'exact', secLevel: 10 };
      expect(PermissionsUtil.canUploadFiles(exactLevel)).toBe(true);
    });

    it('should deny secLevel 9', () => {
      const belowThreshold = { username: 'below', secLevel: 9 };
      expect(PermissionsUtil.canUploadFiles(belowThreshold)).toBe(false);
    });
  });

  describe('canDownloadFiles', () => {
    it('should allow any logged-in user', () => {
      expect(PermissionsUtil.canDownloadFiles(guest)).toBe(true);
      expect(PermissionsUtil.canDownloadFiles(regularUser)).toBe(true);
      expect(PermissionsUtil.canDownloadFiles(coSysop)).toBe(true);
      expect(PermissionsUtil.canDownloadFiles(sysop)).toBe(true);
    });

    it('should deny null user', () => {
      expect(PermissionsUtil.canDownloadFiles(null)).toBe(false);
    });

    it('should deny undefined user', () => {
      expect(PermissionsUtil.canDownloadFiles(undefined)).toBe(false);
    });

    it('should allow user with secLevel 0', () => {
      expect(PermissionsUtil.canDownloadFiles(guest)).toBe(true);
    });
  });

  describe('canAccessDoors', () => {
    it('should allow sysop (secLevel 255)', () => {
      expect(PermissionsUtil.canAccessDoors(sysop)).toBe(true);
    });

    it('should allow co-sysop (secLevel 100)', () => {
      expect(PermissionsUtil.canAccessDoors(coSysop)).toBe(true);
    });

    it('should allow regular user (secLevel 10)', () => {
      expect(PermissionsUtil.canAccessDoors(regularUser)).toBe(true);
    });

    it('should deny guest (secLevel 0)', () => {
      expect(PermissionsUtil.canAccessDoors(guest)).toBe(false);
    });

    it('should deny null user', () => {
      expect(PermissionsUtil.canAccessDoors(null)).toBe(false);
    });

    it('should allow exactly secLevel 10', () => {
      const exactLevel = { username: 'exact', secLevel: 10 };
      expect(PermissionsUtil.canAccessDoors(exactLevel)).toBe(true);
    });

    it('should deny secLevel 9', () => {
      const belowThreshold = { username: 'below', secLevel: 9 };
      expect(PermissionsUtil.canAccessDoors(belowThreshold)).toBe(false);
    });
  });

  describe('canPageSysop', () => {
    it('should allow any logged-in user', () => {
      expect(PermissionsUtil.canPageSysop(guest)).toBe(true);
      expect(PermissionsUtil.canPageSysop(regularUser)).toBe(true);
      expect(PermissionsUtil.canPageSysop(coSysop)).toBe(true);
      expect(PermissionsUtil.canPageSysop(sysop)).toBe(true);
    });

    it('should deny null user', () => {
      expect(PermissionsUtil.canPageSysop(null)).toBe(false);
    });

    it('should deny undefined user', () => {
      expect(PermissionsUtil.canPageSysop(undefined)).toBe(false);
    });

    it('should allow user with secLevel 0', () => {
      expect(PermissionsUtil.canPageSysop(guest)).toBe(true);
    });
  });

  describe('security level boundaries', () => {
    it('should enforce correct thresholds for all permission levels', () => {
      // secLevel 0 - guest
      expect(PermissionsUtil.canDownloadFiles(guest)).toBe(true);
      expect(PermissionsUtil.canPageSysop(guest)).toBe(true);
      expect(PermissionsUtil.canPostMessages(guest)).toBe(false);
      expect(PermissionsUtil.canUploadFiles(guest)).toBe(false);
      expect(PermissionsUtil.canAccessDoors(guest)).toBe(false);

      // secLevel 10 - regular user
      expect(PermissionsUtil.canPostMessages(regularUser)).toBe(true);
      expect(PermissionsUtil.canUploadFiles(regularUser)).toBe(true);
      expect(PermissionsUtil.canAccessDoors(regularUser)).toBe(true);
      expect(PermissionsUtil.canDeleteFiles(regularUser)).toBe(false);

      // secLevel 100 - co-sysop
      expect(PermissionsUtil.canDeleteFiles(coSysop)).toBe(true);
      expect(PermissionsUtil.canMoveFiles(coSysop)).toBe(true);
      expect(PermissionsUtil.isCoSysop(coSysop)).toBe(true);
      expect(PermissionsUtil.isSysop(coSysop)).toBe(false);

      // secLevel 255 - sysop
      expect(PermissionsUtil.isSysop(sysop)).toBe(true);
      expect(PermissionsUtil.isCoSysop(sysop)).toBe(true);
      expect(PermissionsUtil.canDeleteFiles(sysop)).toBe(true);
    });
  });
});
