/**
 * DT_CALLEDTODAY (express.e:4189-4195) answers getTodaysCalls
 * (express.e:28425-28432): the record's timesOnToday when the user's last
 * call was today, 0 when it was another day; a write sets timesOnToday.
 *
 * The port read `timesOnToday` - an alias the record never carries (it is
 * `callsToday`) - so every door was told 0 calls today, and it took the day
 * from `timeLastOn - 21600`, subtracting seconds from a Date.
 */
import { XIMDataQueryHandler } from '../../src/amiga-emulation/xim/data-query';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

function aDoor(user: Record<string, unknown>, stringIn = '') {
  const strings: string[] = [];
  const messageParser = {
    writeCommand: jest.fn(),
    writeData: jest.fn(),
    writeString: jest.fn((_addr: number, value: string) => strings.push(value)),
    writeMessageString: jest.fn(),
    readString: jest.fn(() => stringIn),
    getCommandName: jest.fn(() => 'DT_CALLEDTODAY'),
  } as any;
  const emulator = { readMemory32: () => 0, writeMemory32: () => undefined, writeMemory: () => undefined, readString: () => '' } as any;
  const handler = new XIMDataQueryHandler(emulator, { replyMsg: jest.fn() } as any, messageParser, { user } as any, {} as any);
  const send = (data: number) => handler.handleDataQuery({ command: XIMCommand.DT_CALLEDTODAY, data, string: '', msgAddr: 0x1000 } as any);
  return { send, strings };
}

describe('DT_CALLEDTODAY is getTodaysCalls', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 9, 4, 12, 0, 0) }));
  afterEach(() => jest.useRealTimers());

  test('a door is told the calls made today when the last call was today', () => {
    const door = aDoor({ lastLogin: new Date(2026, 9, 4, 0, 30, 0), timeLastOn: new Date(2026, 9, 4, 0, 30, 0), callsToday: 3 });
    door.send(1);
    expect(door.strings).toEqual(['3']);
  });

  test('a last call yesterday is 0 calls today, the day turning at local midnight', () => {
    const door = aDoor({ lastLogin: new Date(2026, 9, 3, 23, 30, 0), callsToday: 3 });
    door.send(1);
    expect(door.strings).toEqual(['0']);
  });

  test('a door setting it sets the record\'s callsToday', () => {
    const user: any = { lastLogin: new Date(2026, 9, 4, 11, 0, 0), callsToday: 3 };
    aDoor(user, '7').send(0);
    expect(user.callsToday).toBe(7);
  });
});
