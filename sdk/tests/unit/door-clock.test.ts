/**
 * A door's game clock stands still while the board holds the door (Ctrl+K
 * palette) and carries on from the same instant on resume, so game deadlines
 * kept as timestamps (invulnerability, power-up lifetimes, section times)
 * do not age during a pause.
 */
import { EventEmitter } from 'events';
import { DoorClock, honourDoorHold } from '../../utils/blessed-helpers';

describe('door clock', () => {
  it('excludes the time the board held the door, through the board hold signals', () => {
    let wall = 1_000;
    const clock = new DoorClock(() => wall);
    const socket = new EventEmitter();
    const hold = honourDoorHold({ socket }, { clock });

    wall = 1_500;
    expect(hold.now()).toBe(1_500);

    socket.emit('door:pause');
    expect(hold.isPaused()).toBe(true);
    wall = 61_500; // a minute in the palette
    expect(hold.now()).toBe(1_500);

    socket.emit('door:resume');
    expect(hold.isPaused()).toBe(false);
    expect(hold.now()).toBe(1_500);

    wall = 61_600;
    expect(hold.now()).toBe(1_600);

    // A second pause adds to the first.
    socket.emit('door:pause');
    wall = 71_600;
    socket.emit('door:resume');
    wall = 71_700;
    expect(hold.now()).toBe(1_700);

    // Withdrawn: the door no longer listens, the clock keeps game time.
    hold.withdraw();
    socket.emit('door:pause');
    wall = 81_700;
    expect(hold.isPaused()).toBe(false);
    expect(hold.now()).toBe(11_700);
  });
});
