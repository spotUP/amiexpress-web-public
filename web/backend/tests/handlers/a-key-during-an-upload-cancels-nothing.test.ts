/**
 * A key that reaches handleCommand while the session is parked in
 * FILES_UPLOAD - after rz exits, while the received files are processed -
 * used to cancel the upload with an invented "Upload canceled" and "Press
 * any key to continue...". express.e's transfer blocks the caller; it has no
 * such cancel and prints neither line. The key is dropped.
 *
 * And when a web upload's description ends, express.e goes straight to the
 * checker (19326-19331); the port printed an invented "Processing upload...".
 */
process.env.SKIP_DB_INIT = '1';

const processBatchFile = jest.fn(async (..._args: any[]) => {});
jest.mock('../../src/server/file-socket-handlers', () => ({
  ...jest.requireActual('../../src/server/file-socket-handlers'),
  processBatchFile: (...args: any[]) => processBatchFile(...args),
}));

import { handleCommand } from '../../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../../src/index';
import { flushOutput } from '../../src/utils/output.util';

// The output buffer is keyed by socket id: one id per caller.
let n = 0;
function aCallerMidUpload() {
  const printed: string[] = [];
  const socket = {
    id: `mid-upload-${++n}`,
    server: {},
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') printed.push(String(data)); return true; },
    on: () => {}, off: () => {}, removeListener: () => {},
  } as any;
  const session: any = {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.FILES_UPLOAD,
    connectionType: 'telnet',
    nodeId: 1,
    inputBuffer: '',
    user: { id: 1, username: 'spot', secLevel: 10 },
    tempData: { uploadBatch: [{ filename: 'DEMO.LHA' }] },
  };
  return { socket, session, printed };
}

describe('a key during an upload', () => {
  test('prints nothing and leaves the upload alone', async () => {
    const { socket, session, printed } = aCallerMidUpload();

    await handleCommand(socket, session, 'x');
    flushOutput(socket); // emitText buffers

    expect(printed.join('')).toBe('');
    expect(session.subState).toBe(LoggedOnSubState.FILES_UPLOAD);
    expect(session.tempData.uploadBatch).toHaveLength(1);
  });
});

describe('the end of a web upload description', () => {
  test('hands the file to the checker without a line of its own', async () => {
    const { socket, session, printed } = aCallerMidUpload();
    session.subState = LoggedOnSubState.UPLOAD_DESC_INPUT;
    session.tempData = {
      webUploadMode: true,
      currentUploadedFile: { filename: 'DEMO.LHA', size: 10, path: '/tmp/DEMO.LHA' },
      uploadBatch: [],
      currentDescription: ['a demo'],
      currentLineBuffer: '',
    };

    await handleCommand(socket, session, '\r');
    flushOutput(socket); // emitText buffers

    expect(processBatchFile).toHaveBeenCalledTimes(1);
    expect(printed.join('')).not.toContain('Processing upload');
  });
});
