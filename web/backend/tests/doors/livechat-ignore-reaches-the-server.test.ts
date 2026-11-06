/**
 * LiveChat's /ignore, /unignore and the context-menu Ignore emit chat:ignore,
 * chat:unignore and chat:ignore-list from the door's server half. A door emit
 * reaches the backend only when createDoorSocketWrapper intercepts it; these
 * three had no route, fell through to socket.emit and went to the caller's
 * browser, so the server-side ignore (decision D8) never ran for anyone using
 * the door: the ignored user's lines and DMs kept arriving.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/chat/ignore.handler', () => ({
  handleChatIgnore: jest.fn(),
}));

import { createDoorSocketWrapper } from '../../src/handlers/door.handler';
import { handleChatIgnore } from '../../src/handlers/chat/ignore.handler';

test.each([
  ['chat:ignore', 'ignore', { user: 'dave' }],
  ['chat:unignore', 'unignore', { user: 'dave' }],
  ['chat:ignore-list', 'list', {}],
] as const)('door %s reaches the ignore handler, not the browser', (event, action, payload) => {
  (handleChatIgnore as jest.Mock).mockClear();
  const toBrowser = jest.fn();
  const socket: any = { id: 'web-3', emit: toBrowser, on: jest.fn() };
  const session: any = { currentRoomId: 'general', user: { id: '1', username: 'spot' } };
  const wrapped = createDoorSocketWrapper(socket, session, {});

  wrapped.emit(event, payload);

  expect(handleChatIgnore).toHaveBeenCalledTimes(1);
  expect(handleChatIgnore).toHaveBeenCalledWith(socket, session, action, payload);
  expect(toBrowser).not.toHaveBeenCalledWith(event, expect.anything());
});
