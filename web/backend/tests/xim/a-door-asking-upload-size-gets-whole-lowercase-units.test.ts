/**
 * express.e calcSizeText (3336-3371), used by DT_SIZEUPLOAD / DT_SIZEDOWNLOAD
 * (4115-4120) and ~SU / ~SD (5359-5366): each pass adds 512 and divides by
 * 1024 while the value is 1024 or more, then appends b / kb / mb / gb / tb /
 * pb. Whole numbers, lowercase, no space ("2mb", never "1.5 MB").
 *
 * The XIM door path (xim/data-query.ts) had its own formatter that printed
 * "1.5 MB"; the three other copies now share utils/byte-format.util.
 */
jest.mock('../../src/utils/acs-access-loader');
import { XIMDataQueryHandler } from '../../src/amiga-emulation/xim/data-query';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';
import { calcSizeText } from '../../src/utils/byte-format.util';

describe('calcSizeText', () => {
  test.each([
    [0, '0b'],
    [1023, '1023b'],
    [1024, '1kb'],
    [1536, '2kb'], // 1536 + 512 = 2048 / 1024
    [1535, '1kb'],
    [1048575, '1mb'], // rounds up to 1024kb, then again to 1mb
    [1572864, '2mb'],
    [5 * 1024 ** 3, '5gb'],
    [3 * 1024 ** 4, '3tb'],
    [2 * 1024 ** 5, '2pb'],
  ])('%d bytes reads %s', (bytes, text) => {
    expect(calcSizeText(bytes)).toBe(text);
  });
});

test('DT_SIZEUPLOAD and DT_SIZEDOWNLOAD hand the door the calcSizeText text', () => {
  const writeString = jest.fn();
  const handler = new XIMDataQueryHandler(
    { readString: jest.fn().mockReturnValue('') } as never,
    { replyMsg: jest.fn() } as never,
    { writeData: jest.fn(), writeString, getCommandName: () => 'X' } as never,
    { user: { bytesUpload: 1572864, bytesDownload: 5 * 1024 ** 3 } } as never,
    {} as never,
  );
  handler.handleDataQuery({ command: XIMCommand.DT_SIZEUPLOAD, data: 1, string: '', msgAddr: 0x1000 } as never);
  handler.handleDataQuery({ command: XIMCommand.DT_SIZEDOWNLOAD, data: 1, string: '', msgAddr: 0x1000 } as never);
  expect(writeString.mock.calls.map((c) => c[1])).toEqual(['2mb', '5gb']);
});
