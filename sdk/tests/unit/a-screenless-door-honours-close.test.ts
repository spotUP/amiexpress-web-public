/**
 * A door with no blessed screen can still be ended by the board's close.
 *
 * Raw doorInputHandler doors (bbslink, bbslinkwall, telnet, telnet-front,
 * phreakwars) never create a screen, so honourDoorClose takes a null screen:
 * the door announces it honours the close, the close runs the door's own
 * quit once, and the returned function withdraws the announcement when the
 * door ends some other way.
 */
import { EventEmitter } from 'events';
import { honourDoorClose } from '../../utils/blessed-helpers';

function fakeSession() {
  const socket = new EventEmitter();
  const announced: boolean[] = [];
  socket.on('door:honours-close', (v: boolean) => announced.push(v));
  return { session: { socket }, socket, announced };
}

describe('honourDoorClose without a screen', () => {
  it('runs the door quit once on door:close and withdraws the announcement', () => {
    const { session, socket, announced } = fakeSession();
    const quit = jest.fn();
    honourDoorClose(session, null, quit);
    expect(announced).toEqual([true]);

    socket.emit('door:close');
    socket.emit('door:close');

    expect(quit).toHaveBeenCalledTimes(1);
    expect(announced).toEqual([true, false]);
    expect(socket.listenerCount('door:close')).toBe(0);
  });

  it('withdraws through the returned function when the door quits itself', () => {
    const { session, socket, announced } = fakeSession();
    const quit = jest.fn();
    const withdraw = honourDoorClose(session, undefined, quit);
    withdraw();
    socket.emit('door:close');
    expect(quit).not.toHaveBeenCalled();
    expect(announced).toEqual([true, false]);
  });
});
