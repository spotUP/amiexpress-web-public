/**
 * Unit tests for ACS (Access Control System) Utility
 * Tests security permission system from express.e:8455-8497
 */

import {
  checkSecurity,
  checkSecurityByName,
  getUserPermissions,
  setUserPermission,
  overrideUserPermission,
  hasUserFlag,
  setUserFlag,
  setTempSecurityFlag,
  clearTempSecurityFlag,
  setOverride,
  clearOverride,
  setEnvStat,
  initializeSecurity,
  UserFlags,
  LevelFlags,
  ToggleFlags,
  setACSConfig,
  getACSConfig,
} from '../../src/utils/acs.util';
import { ACSPermission } from '../../src/constants/acs-permissions';
import { EnvStat } from '../../src/constants/env-codes';
import type { User } from '../../src/database';

describe('ACS Utility', () => {
  // Mock user factory
  const createUser = (overrides: Partial<User> = {}): User => ({
    id: 'test-user-1',
    username: 'testuser',
    password: 'hashedpassword',
    secLevel: 100,
    userFlags: 0,
    securityFlags: '',
    secOverride: '',
    location: 'Test City',
    phoneNumber: '555-1234',
    ...overrides,
  } as User);

  // Mock session factory
  const createSession = (user: User | null = null) => ({
    user,
    nodeId: 1,
    currentStat: EnvStat.IDLE,
    acsLevel: user?.secLevel || 0,
    userSpecificAccess: false,
    overrideDefaultAccess: false,
    quietFlag: false,
    blockOLM: false,
  });

  beforeEach(() => {
    // Reset ACS config to defaults before each test
    setACSConfig({
      acLvl: (() => {
        const arr = new Array(51).fill(0);
        arr[LevelFlags.DO_CALLERSLOG] = 1;
        arr[LevelFlags.DO_UD_LOG] = 1;
        arr[LevelFlags.BULLETINS] = 1;
        return arr;
      })(),
      toggles: new Array(20).fill(false),
      overrideDefaultAccess: false,
      userSpecificAccess: false,
    });
  });

  describe('checkSecurity', () => {
    it('should return false for null user', () => {
      expect(checkSecurity(null, ACSPermission.DOWNLOAD)).toBe(false);
    });

    it('should deny if secOverride has "T" for flag', () => {
      // express.e:8458-8460 - secOverride check
      const user = createUser({
        secLevel: 255, // Even sysop
        secOverride: 'T'.padEnd(87, ' '), // First flag overridden
      });

      expect(checkSecurity(user, ACSPermission.ACCOUNT_EDITING)).toBe(false);
    });

    it('should grant if securityFlags has "T" for flag', () => {
      // express.e:8462-8465 - securityFlags check
      const user = createUser({
        secLevel: 10,
        securityFlags: 'T'.padEnd(87, '?'),
      });

      expect(checkSecurity(user, ACSPermission.ACCOUNT_EDITING)).toBe(true);
    });

    it('should deny if securityFlags has "F" for flag', () => {
      const user = createUser({
        secLevel: 255,
        securityFlags: 'F'.padEnd(87, '?'),
      });

      expect(checkSecurity(user, ACSPermission.ACCOUNT_EDITING)).toBe(false);
    });

    it('should use default logic if securityFlags has "?" for flag', () => {
      const user = createUser({
        secLevel: 100,
        securityFlags: '?'.repeat(87),
      });

      // Should fall through to default logic (secLevel >= 100)
      expect(checkSecurity(user, ACSPermission.DOWNLOAD)).toBe(true);
    });

    it('should grant SENTBY_FILES if acLvl configured', () => {
      // express.e:8467-8469
      setACSConfig({
        acLvl: (() => {
          const arr = new Array(51).fill(0);
          arr[LevelFlags.SENTBY_FILES] = 1;
          return arr;
        })(),
        toggles: [],
        overrideDefaultAccess: false,
        userSpecificAccess: false,
      });

      const user = createUser({ secLevel: 10 });
      expect(checkSecurity(user, ACSPermission.SENTBY_FILES)).toBe(true);
    });

    it('should grant DEFAULT_CHAT_ON if acLvl configured', () => {
      setACSConfig({
        acLvl: (() => {
          const arr = new Array(51).fill(0);
          arr[LevelFlags.DEFAULT_CHAT_ON] = 1;
          return arr;
        })(),
        toggles: [],
        overrideDefaultAccess: false,
        userSpecificAccess: false,
      });

      const user = createUser({ secLevel: 10 });
      expect(checkSecurity(user, ACSPermission.DEFAULT_CHAT_ON)).toBe(true);
    });

    it('should check CLEAR_SCREEN_MSG against userFlags', () => {
      // express.e:8471-8472
      const user = createUser({
        secLevel: 10,
        userFlags: UserFlags.SCRNCLR,
      });

      expect(checkSecurity(user, ACSPermission.CLEAR_SCREEN_MSG)).toBe(true);

      const userNoFlag = createUser({
        secLevel: 10,
        userFlags: 0,
      });
      expect(checkSecurity(userNoFlag, ACSPermission.CLEAR_SCREEN_MSG)).toBe(false);
    });

    it('should check CLEAR_SCREEN_MSG with userKeys parameter', () => {
      const user = createUser({ secLevel: 10 });
      const userKeys = { userFlags: UserFlags.SCRNCLR };

      expect(checkSecurity(user, ACSPermission.CLEAR_SCREEN_MSG, userKeys)).toBe(true);
    });

    it('should grant KEEP_UPLOAD_CREDIT if acLvl configured', () => {
      setACSConfig({
        acLvl: (() => {
          const arr = new Array(51).fill(0);
          arr[LevelFlags.KEEP_UPLOAD_CREDIT] = 1;
          return arr;
        })(),
        toggles: [],
        overrideDefaultAccess: false,
        userSpecificAccess: false,
      });

      const user = createUser({ secLevel: 10 });
      expect(checkSecurity(user, ACSPermission.KEEP_UPLOAD_CREDIT)).toBe(true);
    });

    it('should grant DO_CALLERSLOG if acLvl configured', () => {
      // Default config has DO_CALLERSLOG = 1
      const user = createUser({ secLevel: 10 });
      expect(checkSecurity(user, ACSPermission.DO_CALLERSLOG)).toBe(true);
    });

    it('should grant DO_UD_LOG if acLvl configured', () => {
      // Default config has DO_UD_LOG = 1
      const user = createUser({ secLevel: 10 });
      expect(checkSecurity(user, ACSPermission.DO_UD_LOG)).toBe(true);
    });

    it('should grant SCREEN_TO_FRONT if acLvl configured', () => {
      setACSConfig({
        acLvl: (() => {
          const arr = new Array(51).fill(0);
          arr[LevelFlags.SCREEN_TO_FRONT] = 1;
          return arr;
        })(),
        toggles: [],
        overrideDefaultAccess: false,
        userSpecificAccess: false,
      });

      const user = createUser({ secLevel: 10 });
      expect(checkSecurity(user, ACSPermission.SCREEN_TO_FRONT)).toBe(true);
    });

    it('should grant WILDCARDS if toggle configured', () => {
      setACSConfig({
        acLvl: new Array(51).fill(0),
        toggles: (() => {
          const arr = new Array(20).fill(false);
          arr[ToggleFlags.USEWILDCARDS] = true;
          return arr;
        })(),
        overrideDefaultAccess: false,
        userSpecificAccess: false,
      });

      const user = createUser({ secLevel: 10 });
      expect(checkSecurity(user, ACSPermission.WILDCARDS)).toBe(true);
    });

    it('should always grant MSG_LEVEL', () => {
      // express.e:8483 - these permissions always return TRUE
      const user = createUser({ secLevel: 1 });
      expect(checkSecurity(user, ACSPermission.MSG_LEVEL)).toBe(true);
    });

    it('should always grant MSG_EXPERATION', () => {
      const user = createUser({ secLevel: 1 });
      expect(checkSecurity(user, ACSPermission.MSG_EXPERATION)).toBe(true);
    });

    it('should always grant CUSTOMCOMMANDS', () => {
      const user = createUser({ secLevel: 1 });
      expect(checkSecurity(user, ACSPermission.CUSTOMCOMMANDS)).toBe(true);
    });

    it('should always grant JOIN_SUB_CONFERENCE', () => {
      const user = createUser({ secLevel: 1 });
      expect(checkSecurity(user, ACSPermission.JOIN_SUB_CONFERENCE)).toBe(true);
    });

    it('should grant permission if secLevel >= 10 and no overrideDefaultAccess', () => {
      // express.e:8487-8489 - default access
      const user = createUser({ secLevel: 10 });
      expect(checkSecurity(user, ACSPermission.DOWNLOAD)).toBe(true);
    });

    it('should deny permission if secLevel < 10 and no overrideDefaultAccess', () => {
      const user = createUser({ secLevel: 5 });
      expect(checkSecurity(user, ACSPermission.DOWNLOAD)).toBe(false);
    });

    it('should deny if acsLevel is -1', () => {
      // express.e:8491
      const user = createUser({ secLevel: -1 });
      expect(checkSecurity(user, ACSPermission.DOWNLOAD)).toBe(false);
    });

    it('should grant all permissions to sysop (level 255) if userSpecificAccess enabled', () => {
      // express.e:8493-8495
      setACSConfig({
        acLvl: new Array(51).fill(0),
        toggles: new Array(20).fill(false),
        overrideDefaultAccess: false,
        userSpecificAccess: true,
      });

      const sysop = createUser({ secLevel: 255 });
      expect(checkSecurity(sysop, ACSPermission.SYSOP_COMMANDS)).toBe(true);
      expect(checkSecurity(sysop, ACSPermission.REMOTE_SHELL)).toBe(true);
    });

    it('should use secLevel >= 100 fallback for final check', () => {
      // express.e:8497 - final fallback
      // Need to disable default access to test the final fallback
      setACSConfig({ overrideDefaultAccess: true });

      const highLevelUser = createUser({ secLevel: 100 });
      const lowLevelUser = createUser({ secLevel: 50 });

      expect(checkSecurity(highLevelUser, ACSPermission.UPLOAD)).toBe(true);
      expect(checkSecurity(lowLevelUser, ACSPermission.UPLOAD)).toBe(false);

      // Reset config
      setACSConfig({ overrideDefaultAccess: false });
    });
  });

  describe('checkSecurityByName', () => {
    it('should check permission by name', () => {
      const user = createUser({ secLevel: 100 });
      expect(checkSecurityByName(user, 'ACS.DOWNLOAD')).toBe(true);
    });

    it('should return false for invalid permission name', () => {
      const user = createUser({ secLevel: 255 });
      expect(checkSecurityByName(user, 'INVALID_PERMISSION')).toBe(false);
    });

    it('should return false for null user', () => {
      expect(checkSecurityByName(null, 'ACS.DOWNLOAD')).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    it('should return empty array for null user', () => {
      expect(getUserPermissions(null)).toEqual([]);
    });

    it('should return list of permissions user has', () => {
      const user = createUser({ secLevel: 100 });
      const permissions = getUserPermissions(user);

      expect(permissions).toContain('ACS.MSG_LEVEL'); // Always granted
      expect(permissions).toContain('ACS.MSG_EXPERATION'); // Always granted
      expect(permissions).toContain('ACS.CUSTOMCOMMANDS'); // Always granted
      expect(permissions).toContain('ACS.JOIN_SUB_CONFERENCE'); // Always granted
      expect(permissions).toContain('ACS.DO_CALLERSLOG'); // Default config
      expect(permissions).toContain('ACS.DO_UD_LOG'); // Default config
      expect(permissions.length).toBeGreaterThan(0);
    });

    it('should return minimal permissions for low-level user', () => {
      const user = createUser({ secLevel: 5 });
      const permissions = getUserPermissions(user);

      // Should only have always-granted permissions
      expect(permissions).toContain('ACS.MSG_LEVEL');
      expect(permissions).toContain('ACS.MSG_EXPERATION');
      expect(permissions).toContain('ACS.CUSTOMCOMMANDS');
      expect(permissions).toContain('ACS.JOIN_SUB_CONFERENCE');
    });
  });

  describe('setUserPermission', () => {
    it('should initialize securityFlags if not set', () => {
      const user = createUser({ securityFlags: '' });
      setUserPermission(user, ACSPermission.DOWNLOAD, true);

      expect(user.securityFlags!.length).toBeGreaterThan(ACSPermission.DOWNLOAD);
      expect(user.securityFlags![ACSPermission.DOWNLOAD]).toBe('T');
    });

    it('should set permission to "T" when allowed', () => {
      const user = createUser({ securityFlags: '?'.repeat(87) });
      setUserPermission(user, ACSPermission.UPLOAD, true);

      expect(user.securityFlags![ACSPermission.UPLOAD]).toBe('T');
    });

    it('should set permission to "F" when denied', () => {
      const user = createUser({ securityFlags: '?'.repeat(87) });
      setUserPermission(user, ACSPermission.REMOTE_SHELL, false);

      expect(user.securityFlags![ACSPermission.REMOTE_SHELL]).toBe('F');
    });

    it('should extend securityFlags string if needed', () => {
      const user = createUser({ securityFlags: '?' });
      setUserPermission(user, ACSPermission.SYSOP_COMMANDS, true);

      expect(user.securityFlags!.length).toBeGreaterThan(ACSPermission.SYSOP_COMMANDS);
      expect(user.securityFlags![ACSPermission.SYSOP_COMMANDS]).toBe('T');
    });
  });

  describe('overrideUserPermission', () => {
    it('should initialize secOverride if not set', () => {
      const user = createUser({ secOverride: '' });
      overrideUserPermission(user, ACSPermission.DOWNLOAD, true);

      expect(user.secOverride!.length).toBeGreaterThan(ACSPermission.DOWNLOAD);
    });

    it('should set override to "T" when enabled', () => {
      const user = createUser({ secOverride: ''.padEnd(87, ' ') });
      overrideUserPermission(user, ACSPermission.UPLOAD, true);

      expect(user.secOverride![ACSPermission.UPLOAD]).toBe('T');
    });

    it('should clear override to " " when disabled', () => {
      const user = createUser({ secOverride: 'T'.padEnd(87, ' ') });
      overrideUserPermission(user, ACSPermission.ACCOUNT_EDITING, false);

      expect(user.secOverride![ACSPermission.ACCOUNT_EDITING]).toBe(' ');
    });

    it('should extend secOverride string if needed', () => {
      const user = createUser({ secOverride: ' ' });
      overrideUserPermission(user, ACSPermission.SYSOP_COMMANDS, true);

      expect(user.secOverride!.length).toBeGreaterThan(ACSPermission.SYSOP_COMMANDS);
      expect(user.secOverride![ACSPermission.SYSOP_COMMANDS]).toBe('T');
    });

    it('should block permission even if otherwise granted', () => {
      const user = createUser({
        secLevel: 255,
        secOverride: '',
      });

      overrideUserPermission(user, ACSPermission.SYSOP_COMMANDS, true);
      expect(checkSecurity(user, ACSPermission.SYSOP_COMMANDS)).toBe(false);
    });
  });

  describe('hasUserFlag', () => {
    it('should return true if flag is set', () => {
      const user = createUser({ userFlags: UserFlags.DONATED });
      expect(hasUserFlag(user, UserFlags.DONATED)).toBe(true);
    });

    it('should return false if flag is not set', () => {
      const user = createUser({ userFlags: 0 });
      expect(hasUserFlag(user, UserFlags.DONATED)).toBe(false);
    });

    it('should return true for multiple flags', () => {
      const user = createUser({
        userFlags: UserFlags.DONATED | UserFlags.SCRNCLR,
      });

      expect(hasUserFlag(user, UserFlags.DONATED)).toBe(true);
      expect(hasUserFlag(user, UserFlags.SCRNCLR)).toBe(true);
    });

    it('should return false for flag not in combination', () => {
      const user = createUser({
        userFlags: UserFlags.DONATED | UserFlags.SCRNCLR,
      });

      expect(hasUserFlag(user, UserFlags.NEWMSG)).toBe(false);
    });
  });

  describe('setUserFlag', () => {
    it('should set flag when enabled', () => {
      const user = createUser({ userFlags: 0 });
      setUserFlag(user, UserFlags.DONATED, true);

      expect(hasUserFlag(user, UserFlags.DONATED)).toBe(true);
      expect(user.userFlags).toBe(UserFlags.DONATED);
    });

    it('should clear flag when disabled', () => {
      const user = createUser({ userFlags: UserFlags.DONATED });
      setUserFlag(user, UserFlags.DONATED, false);

      expect(hasUserFlag(user, UserFlags.DONATED)).toBe(false);
      expect(user.userFlags).toBe(0);
    });

    it('should preserve other flags when setting', () => {
      const user = createUser({
        userFlags: UserFlags.DONATED | UserFlags.SCRNCLR,
      });

      setUserFlag(user, UserFlags.NEWMSG, true);

      expect(hasUserFlag(user, UserFlags.DONATED)).toBe(true);
      expect(hasUserFlag(user, UserFlags.SCRNCLR)).toBe(true);
      expect(hasUserFlag(user, UserFlags.NEWMSG)).toBe(true);
    });

    it('should preserve other flags when clearing', () => {
      const user = createUser({
        userFlags: UserFlags.DONATED | UserFlags.SCRNCLR | UserFlags.NEWMSG,
      });

      setUserFlag(user, UserFlags.DONATED, false);

      expect(hasUserFlag(user, UserFlags.DONATED)).toBe(false);
      expect(hasUserFlag(user, UserFlags.SCRNCLR)).toBe(true);
      expect(hasUserFlag(user, UserFlags.NEWMSG)).toBe(true);
    });
  });

  describe('Session-based security functions', () => {
    describe('setTempSecurityFlag', () => {
      it('should set temporary permission flag', () => {
        const user = createUser({ securityFlags: '?'.repeat(87) });
        const session = createSession(user);

        setTempSecurityFlag(session, ACSPermission.REMOTE_SHELL);

        expect(session.user!.securityFlags![ACSPermission.REMOTE_SHELL]).toBe('T');
      });

      it('should extend securityFlags if needed', () => {
        const user = createUser({ securityFlags: '' });
        const session = createSession(user);

        setTempSecurityFlag(session, ACSPermission.SYSOP_COMMANDS);

        expect(session.user!.securityFlags!.length).toBeGreaterThan(ACSPermission.SYSOP_COMMANDS);
        expect(session.user!.securityFlags![ACSPermission.SYSOP_COMMANDS]).toBe('T');
      });

      it('should do nothing if session has no user', () => {
        const session = createSession(null);
        expect(() => setTempSecurityFlag(session, ACSPermission.DOWNLOAD)).not.toThrow();
      });
    });

    describe('clearTempSecurityFlag', () => {
      it('should clear temporary permission flag', () => {
        const user = createUser({ securityFlags: 'T'.repeat(87) });
        const session = createSession(user);

        clearTempSecurityFlag(session, ACSPermission.REMOTE_SHELL);

        expect(session.user!.securityFlags![ACSPermission.REMOTE_SHELL]).toBe('F');
      });

      it('should do nothing if session has no user', () => {
        const session = createSession(null);
        expect(() => clearTempSecurityFlag(session, ACSPermission.DOWNLOAD)).not.toThrow();
      });
    });

    describe('setOverride', () => {
      it('should set override denial', () => {
        const user = createUser({ secOverride: ''.padEnd(87, 'F') });
        const session = createSession(user);

        setOverride(session, ACSPermission.SYSOP_COMMANDS);

        expect(session.user!.secOverride![ACSPermission.SYSOP_COMMANDS]).toBe('T');
      });

      it('should extend secOverride if needed', () => {
        const user = createUser({ secOverride: '' });
        const session = createSession(user);

        setOverride(session, ACSPermission.SYSOP_COMMANDS);

        expect(session.user!.secOverride!.length).toBeGreaterThan(ACSPermission.SYSOP_COMMANDS);
        expect(session.user!.secOverride![ACSPermission.SYSOP_COMMANDS]).toBe('T');
      });

      it('should do nothing if session has no user', () => {
        const session = createSession(null);
        expect(() => setOverride(session, ACSPermission.DOWNLOAD)).not.toThrow();
      });
    });

    describe('clearOverride', () => {
      it('should clear all override denials', () => {
        const user = createUser({ secOverride: 'T'.repeat(87) });
        const session = createSession(user);

        clearOverride(session);

        expect(session.user!.secOverride).toBe('');
      });

      it('should do nothing if session has no user', () => {
        const session = createSession(null);
        expect(() => clearOverride(session)).not.toThrow();
      });
    });

    describe('setEnvStat', () => {
      it('should set environment status on session', () => {
        const user = createUser();
        const session = createSession(user);

        setEnvStat(session, EnvStat.MAIL);

        expect(session.currentStat).toBe(EnvStat.MAIL);
      });

      it('should handle null user gracefully', () => {
        const session = createSession(null);
        expect(() => setEnvStat(session, EnvStat.IDLE)).not.toThrow();
      });
    });

    describe('initializeSecurity', () => {
      it('should initialize security fields for session', () => {
        const user = createUser({ secLevel: 150 });
        const session = createSession(user);

        initializeSecurity(session);

        expect(session.acsLevel).toBe(150);
        expect(session.userSpecificAccess).toBe(false); // checkToolTypeExists returns false
        expect(session.overrideDefaultAccess).toBe(false); // secLevel < 255
        expect(session.user!.securityFlags).toBe('');
        expect(session.user!.secOverride).toBe('');
        expect(session.currentStat).toBe(EnvStat.IDLE);
        expect(session.quietFlag).toBe(false);
        expect(session.blockOLM).toBe(false);
      });

      it('should set overrideDefaultAccess for sysop', () => {
        const sysop = createUser({ secLevel: 255 });
        const session = createSession(sysop);

        initializeSecurity(session);

        expect(session.overrideDefaultAccess).toBe(true);
      });

      it('should do nothing if session has no user', () => {
        const session = createSession(null);
        expect(() => initializeSecurity(session)).not.toThrow();
      });
    });
  });

  describe('ACS Configuration', () => {
    describe('getACSConfig / setACSConfig', () => {
      it('should get current ACS configuration', () => {
        const config = getACSConfig();
        expect(config.acLvl).toBeDefined();
        expect(config.toggles).toBeDefined();
        expect(config.overrideDefaultAccess).toBeDefined();
        expect(config.userSpecificAccess).toBeDefined();
      });

      it('should update ACS configuration', () => {
        const newConfig = {
          overrideDefaultAccess: true,
          userSpecificAccess: true,
        };

        setACSConfig(newConfig);
        const config = getACSConfig();

        expect(config.overrideDefaultAccess).toBe(true);
        expect(config.userSpecificAccess).toBe(true);
      });

      it('should merge partial configuration updates', () => {
        setACSConfig({ overrideDefaultAccess: true });
        let config = getACSConfig();
        expect(config.overrideDefaultAccess).toBe(true);

        setACSConfig({ userSpecificAccess: true });
        config = getACSConfig();
        expect(config.overrideDefaultAccess).toBe(true); // Should persist
        expect(config.userSpecificAccess).toBe(true);
      });
    });
  });

  describe('Security scenarios', () => {
    it('should handle guest user (no permissions)', () => {
      const guest = createUser({ secLevel: 0 });

      expect(checkSecurity(guest, ACSPermission.DOWNLOAD)).toBe(false);
      expect(checkSecurity(guest, ACSPermission.UPLOAD)).toBe(false);
      expect(checkSecurity(guest, ACSPermission.ENTER_MESSAGE)).toBe(false);

      // But always-granted permissions still work
      expect(checkSecurity(guest, ACSPermission.MSG_LEVEL)).toBe(true);
    });

    it('should handle new user (basic permissions)', () => {
      const newUser = createUser({ secLevel: 10 });

      expect(checkSecurity(newUser, ACSPermission.READ_BULLETINS)).toBe(true);
      expect(checkSecurity(newUser, ACSPermission.DOWNLOAD)).toBe(true);
      // Default access grants permissions to secLevel >= 10
      // To restrict sysop commands, use securityFlags or secOverride
      expect(checkSecurity(newUser, ACSPermission.SYSOP_COMMANDS)).toBe(true);
    });

    it('should handle power user (elevated permissions)', () => {
      const powerUser = createUser({ secLevel: 150 });

      expect(checkSecurity(powerUser, ACSPermission.UPLOAD)).toBe(true);
      expect(checkSecurity(powerUser, ACSPermission.ENTER_MESSAGE)).toBe(true);
      expect(checkSecurity(powerUser, ACSPermission.FILE_LISTINGS)).toBe(true);
    });

    it('should handle sysop (all permissions)', () => {
      setACSConfig({ userSpecificAccess: true });
      const sysop = createUser({ secLevel: 255 });

      expect(checkSecurity(sysop, ACSPermission.SYSOP_COMMANDS)).toBe(true);
      expect(checkSecurity(sysop, ACSPermission.REMOTE_SHELL)).toBe(true);
      expect(checkSecurity(sysop, ACSPermission.SYSOP_DOWNLOAD)).toBe(true);
    });

    it('should respect explicit denials even for sysop', () => {
      const sysop = createUser({
        secLevel: 255,
        secOverride: '',
      });

      overrideUserPermission(sysop, ACSPermission.REMOTE_SHELL, true);

      expect(checkSecurity(sysop, ACSPermission.REMOTE_SHELL)).toBe(false);
    });

    it('should grant specific permissions via securityFlags', () => {
      const restrictedUser = createUser({ secLevel: 5 });

      // User normally wouldn't have permission
      expect(checkSecurity(restrictedUser, ACSPermission.UPLOAD)).toBe(false);

      // Grant specific permission
      setUserPermission(restrictedUser, ACSPermission.UPLOAD, true);
      expect(checkSecurity(restrictedUser, ACSPermission.UPLOAD)).toBe(true);

      // Other permissions still denied
      expect(checkSecurity(restrictedUser, ACSPermission.DOWNLOAD)).toBe(false);
    });
  });
});
