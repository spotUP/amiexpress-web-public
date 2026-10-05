/**
 * A telnet caller typing in the LIVECHAT door: every key is a
 * chat:keystroke the door socket wrapper broadcasts to the room. It used
 * socket.io's socket.to(), which a telnet connection does not have - "socket.to
 * is not a function" was thrown inside the door's keypress handler, printed
 * in red on his screen, and his line never reached the room (the sysop and
 * randy, live, 2026-10-05).
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/chat/group-chat.handler', () => ({
  ...jest.requireActual('../../src/handlers/chat/group-chat.handler'),
  emitToRoom: jest.fn(),
}));

import { createDoorSocketWrapper } from '../../src/handlers/door.handler';
import { emitToRoom } from '../../src/handlers/chat/group-chat.handler';

test('a keystroke from a telnet connection (no socket.to) reaches the room, and nothing throws', () => {
  const telnet: any = { id: 'telnet-7', emit: jest.fn(), on: jest.fn() }; // no .to
  const session: any = { currentRoomId: 'room_1', user: { id: '2', username: 'randy' } };
  const wrapped = createDoorSocketWrapper(telnet, session, {});
  expect(() => wrapped.emit('chat:keystroke', { userId: 2, char: 'g' })).not.toThrow();
  expect(() => wrapped.emit('chat:keystroke-submit', { userId: 2 })).not.toThrow();
  expect(emitToRoom).toHaveBeenCalledWith('room_1', 'chat:keystroke',
    expect.objectContaining({ username: 'randy', char: 'g' }), 'telnet-7');
  expect(emitToRoom).toHaveBeenCalledWith('room_1', 'chat:keystroke-submit', expect.anything(), 'telnet-7');
});
