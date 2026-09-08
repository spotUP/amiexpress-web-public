/**
 * An upload session ends by sweeping the playpen, as express.e:18915 does.
 *
 * `cleanPlayPen` (the port of express.e:18259) moves whatever is left in the
 * node's playpen - i.e. partial, aborted uploads - into
 * `<conf>/PartUpload/<name>@<slot>`, which is where `resumeStuff()` looks when
 * the caller tries again. It was ported, documented, and called by NOTHING, so
 * PartUpload was never filled and resume had nothing to offer: a dropped
 * upload always started again from zero.
 *
 * express calls it at the END of the same procedure this file ports, so that
 * is where it now runs.
 */
process.env.SKIP_DB_INIT = '1';

const cleanPlayPen = jest.fn(async () => undefined);
jest.mock('../../src/utils/clean-playpen.util', () => ({ cleanPlayPen }));

jest.mock('../../src/server/database-helpers', () => ({
  callersLog: jest.fn(async () => undefined),
}));

jest.mock('../../src/utils/download-logging.util', () => ({
  writeToCallersLog: jest.fn(async () => undefined),
  writeToUDLog: jest.fn(async () => undefined),
}));

import { LoggedOnSubState } from '../../src/constants/bbs-states';

function emitter() {
  return { emit: jest.fn(() => true) } as any;
}

function session(): any {
  return {
    nodeId: 3,
    currentConf: 1,
    subState: LoggedOnSubState.READ_COMMAND,
    tempData: {},
    user: { id: 'u-1', username: 'spot', name: 'spot', slotNumber: 3, location: 'Uprough' },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the end of an upload session', () => {
  it('sweeps the playpen, so a partial upload can be resumed later', async () => {
    const { runPostUpload } = require('../../src/services/post-upload.service');

    await runPostUpload(emitter(), session(), {
      uploadStartTime: Date.now() - 5000,
      uploadedFiles: 1,
      uploadedBytes: 1024,
    });

    expect(cleanPlayPen).toHaveBeenCalledTimes(1);
  });

  it('sweeps it even when the session received nothing at all', async () => {
    // The aborted upload is exactly the case that leaves a partial file, and
    // it is the case where uploadedFiles is 0.
    const { runPostUpload } = require('../../src/services/post-upload.service');

    await runPostUpload(emitter(), session(), {
      uploadStartTime: Date.now() - 5000,
      uploadedFiles: 0,
      uploadedBytes: 0,
    });

    expect(cleanPlayPen).toHaveBeenCalledTimes(1);
  });

  it('hands it the node playpen and the session, as express does', async () => {
    const { runPostUpload } = require('../../src/services/post-upload.service');
    const s = session();

    await runPostUpload(emitter(), s, {
      uploadStartTime: Date.now() - 5000,
      uploadedFiles: 1,
      uploadedBytes: 1024,
    });

    const [playpenDir, passedSession] = cleanPlayPen.mock.calls[0] as unknown as [string, unknown];
    expect(playpenDir).toContain('Node3');
    expect(passedSession).toBe(s);
  });

  it('does not let a sweep failure swallow the caller\'s upload', async () => {
    cleanPlayPen.mockRejectedValueOnce(new Error('disk full'));
    const { runPostUpload } = require('../../src/services/post-upload.service');
    const s = session();

    await expect(
      runPostUpload(emitter(), s, {
        uploadStartTime: Date.now() - 5000,
        uploadedFiles: 1,
        uploadedBytes: 1024,
      }),
    ).resolves.toBeUndefined();

    // The session still reaches the menu rather than stalling mid-pipeline.
    expect(s.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});
