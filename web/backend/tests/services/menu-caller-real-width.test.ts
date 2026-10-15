jest.mock('../../src/utils/acs-access-loader');
import { menuCallerFromSession } from '../../src/services/menu-catalogue/caller';

const session = (over: object) => ({ user: { secLevel: 10 }, currentConf: 1, nodeId: 1, ...over }) as never;

test('the menu caller carries the real terminal size, the same one AEW_SCREEN SIZE answers', () => {
  const c = menuCallerFromSession(session({ screenWidth: 80, wireWidth: 132, wireHeight: 40 }));
  expect([c.columns, c.rows]).toEqual([132, 40]);
});

test('a C64 caller is 40 columns, a plain 80 column caller stays 80', () => {
  expect(menuCallerFromSession(session({ petsciiMode: true, petsciiColumns: 40, wireWidth: 132 })).columns).toBe(40);
  expect(menuCallerFromSession(session({ screenWidth: 80 })).columns).toBe(80);
});
