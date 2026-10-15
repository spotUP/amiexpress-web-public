/**
 * A booked download saves the account without an error.
 *
 * bookDownloads saved `bytesAvailableForDownload` with the account, and no
 * column by that name (`bytesavailablefordownload`) exists, so every booked
 * download failed its row write with a SqliteError and logged "could not
 * save the account row". The value is AmiExpress's bytesADL, a SESSION
 * figure worked out at logon from the day's limit minus dailyBytesDld
 * (express.e:28529-28535) and never stored - dailyBytesDld is what persists.
 *
 * The same shape as the day-turn lockout of 2026-09-16: a field whose
 * column name comes from lowercasing, and no column to catch it. Driven
 * through the real database write, which is what failed.
 */
import { bookDownloads } from '../../src/services/download-booking.service';

it('saves the account row of a booked download', async () => {
  const errors: string[] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
  try {
    const session: any = {
      nodeId: 1,
      currentConf: 1,
      conferences: [],
      user: {
        id: 'no-such-user', username: 'tester', secLevel: 100, downloads: 0, bytesDownload: 0,
        dailyBytesDld: 0, bytesAvailableForDownload: 1_000_000,
      },
    };
    await bookDownloads(session, [{ name: 'FILE.LHA', size: 1000, confNum: 1 }]);
  } finally {
    spy.mockRestore();
  }

  expect(errors.filter((e) => e.includes('could not save the account row'))).toEqual([]);
});
