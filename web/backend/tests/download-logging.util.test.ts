import { logDownload } from '../src/utils/download-logging.util';
import { setACSConfig, LevelFlags } from '../src/utils/acs.util';

// Mock fs to avoid filesystem writes
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  appendFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

const fsMock = jest.requireMock('fs');
const shouldRunLoggingTests = process.env.ENABLE_LOG_DOWNLOAD_TESTS === '1';

const describeLoggingTests = shouldRunLoggingTests ? describe : describe.skip;

describeLoggingTests('download-logging util ACS gating', () => {
  const user = { username: 'tester' } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips UD/Callers logs when ACS flags are disabled', async () => {
    const acLvl = new Array(51).fill(0);
    acLvl[LevelFlags.DO_CALLERSLOG] = 0;
    acLvl[LevelFlags.DO_UD_LOG] = 0;
    setACSConfig({ acLvl });

    await logDownload(user, 'file.txt', 1234, false, 1);

    expect(fsMock.appendFileSync).not.toHaveBeenCalled();
  });

  it('writes logs when ACS flags are enabled', async () => {
    const acLvl = new Array(51).fill(0);
    acLvl[LevelFlags.DO_CALLERSLOG] = 1;
    acLvl[LevelFlags.DO_UD_LOG] = 1;
    setACSConfig({ acLvl });

    await logDownload(user, 'file.txt', 1234, false, 1);

    expect(fsMock.appendFileSync).toHaveBeenCalled();
  });
});
