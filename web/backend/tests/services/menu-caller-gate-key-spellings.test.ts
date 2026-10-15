/**
 * A gate key spelled `ACS.DOWNLOAD` is the same permission as `DOWNLOAD`:
 * the admin preview must not show it as denied, and the live caller must
 * agree with the preview.
 */
process.env.SKIP_DB_INIT = '1';
jest.mock('../../src/utils/acs-access-loader', () => ({
  checkAcsPermission: jest.fn((_level: number, name: string) => name === 'ACS.DOWNLOAD'),
  findAcsLevel: jest.fn(() => 255),
}));
import { menuCallerForPreview, menuCallerFromSession } from '../../src/services/menu-catalogue/caller';

test('the preview resolves the bare key and the ACS.-prefixed spelling to the same permission', () => {
  const c = menuCallerForPreview(255, 80, 1, 'ansi');
  expect(c.may('DOWNLOAD')).toBe(true);
  expect(c.may('ACS.DOWNLOAD')).toBe(true);
  expect(c.may('UPLOAD')).toBe(false);
  expect(c.may('ACS.UPLOAD')).toBe(false);
});

test('the live caller resolves both spellings the same way', () => {
  const user = { id: 1, username: 'a', secLevel: 10, securityFlags: 'T'.repeat(128), secOverride: null };
  const c = menuCallerFromSession({ user, currentConf: 1, nodeId: 1, screenWidth: 80 } as never);
  expect(c.may('DOWNLOAD')).toBe(true);
  expect(c.may('ACS.DOWNLOAD')).toBe(true);
});
