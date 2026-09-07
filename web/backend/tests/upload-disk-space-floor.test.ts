/**
 * Regression: displayUploadInterface refuses to start the upload flow when
 * there is less than the 2 MB express.e floor free (express.e:18989-19001).
 * Without it an upload to a full disk truncates on the first ENOSPC write and
 * rz aborts with a partial file in the playpen - the disk-full incident of
 * 2026-05-20 that motivated the audit.
 *
 * DRIVEN, NOT GREPPED. This suite used to read file.handler.ts as TEXT and
 * match regexes against it - `playpenFreeBytes = readFreeBytes(ulPath)` and
 * friends - because "file.handler.ts can't be loaded under jest (drags in the
 * BBS subsystem)". That has not been true for some time: the module requires
 * cleanly, which the first test below asserts so nobody reintroduces a grep.
 *
 * The pins were also wrong in the way source pins go wrong: the handler now
 * measures the PLAYPEN rather than the area's ulPath, and gates on
 * `pool.driveFree` rather than a `poolFreeBytes` local. Both are improvements,
 * and both failed a test that could only see spelling. What the floor is FOR
 * survives either rewrite, so that is what is asserted here: at 1 MB free the
 * caller is refused and sent back to the menu; at 50 MB he is not.
 */

/*
 * `require`, not `import`: readFreeBytes reaches for `require('fs')` inside
 * the function, and a spy installed on the ESM namespace object never reached
 * it - the handler went on reading the real disk and reported 7 GB free while
 * the test believed it had said 1 MB.
 */
const fsCjs = require('fs');

const handler = require('../src/handlers/file/file.handler');

/** Free space the handler will see, in bytes. */
function withFreeBytes(bytes: number): jest.SpyInstance {
  const blockSize = 4096;
  return jest.spyOn(fsCjs, 'statfsSync').mockReturnValue({
    bfree: Math.floor(bytes / blockSize),
    bsize: blockSize,
    blocks: 1_000_000,
    bavail: Math.floor(bytes / blockSize),
    files: 0,
    ffree: 0,
    type: 0,
  } as unknown as import('fs').StatsFs);
}

interface Emitted { text: string[] }

let socketSeq = 0;

async function drive(freeBytes: number): Promise<{ session: any; emitted: Emitted }> {
  const spy = withFreeBytes(freeBytes);
  const emitted: Emitted = { text: [] };
  // `on`/`off` as well as `emit`: the output buffer registers a disconnect
  // listener on the socket it is handed (utils/ansi-buffer.util.ts), and a
  // socket without them threw "socket.on is not a function" before the
  // handler reached its first line.
  // A UNIQUE `id`, because the output buffer is keyed by socket.id
  // (utils/ansi-buffer.util.ts:163-173). Sockets without one all shared a
  // single buffer bound to the FIRST socket, so every call after the first
  // emitted into a socket this test had stopped listening to and read as "the
  // handler did nothing".
  const socket: any = {
    id: `upload-floor-${socketSeq++}`,
    emit: (_event: string, payload: any) => {
      if (typeof payload === 'string') emitted.text.push(payload);
      return true;
    },
    connected: true,
    on: () => socket,
    off: () => socket,
    once: () => socket,
    removeListener: () => socket,
  };
  const session: any = {
    currentConf: 1,
    nodeId: 1,
    user: { id: 1, username: 'Sysop', secLevel: 255 },
  };
  handler.setFileAreas([
    { id: 1, conferenceId: 1, name: 'Uploads', ulPath: '/tmp', areaNumber: 1 },
  ]);
  try {
    handler.displayUploadInterface(socket, session, '');
    // emitText buffers for 16ms at 60fps (utils/output.util.ts:51). WAITED
    // for, not forced: flushOutput() emptied the first call's buffer and left
    // later ones silent, which read as "the handler did nothing".
    await new Promise((resolve) => setTimeout(resolve, 40));
  } finally {
    spy.mockRestore();
  }
  return { session, emitted };
}

describe('the upload floor', () => {
  test('the handler loads under jest, so this suite never has to grep again', () => {
    expect(typeof handler.displayUploadInterface).toBe('function');
    expect(typeof handler.setFileAreas).toBe('function');
  });

  test('refuses the upload when less than 2 MB is free, in express.e own words', async () => {
    const { session, emitted } = await drive(1024 * 1024);

    expect(emitted.text.join('')).toContain('Not enough free space for uploading!');
    // Refused means sent back, not left in a half-started transfer.
    expect(session.tempData).toBeUndefined();
    expect(session.menuPause).toBe(true);
  });

  test('starts the upload when there is room', async () => {
    const { emitted } = await drive(50 * 1024 * 1024);

    const text = emitted.text.join('');
    expect(text).not.toContain('Not enough free space');
    // express.e:19016, the first line of the flow proper.
    expect(text).toContain('Filename lengths above 12 are not allowed.');
  });

  test('the floor is 2 MB: just under is refused, just over is not', async () => {
    const twoMb = 2 * 1024 * 1024;
    expect((await drive(twoMb - 64 * 1024)).emitted.text.join('')).toContain('Not enough free space');
    expect((await drive(twoMb + 64 * 1024)).emitted.text.join('')).not.toContain('Not enough free space');
  });
});
