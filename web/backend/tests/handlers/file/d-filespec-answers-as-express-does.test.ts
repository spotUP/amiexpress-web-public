/**
 * D's "Filespec" is read with lineInput (express.e:20124), whose line break
 * comes before whatever follows: an empty answer's '\b\n' (20137), "Aborting"
 * (20141), "\b\nChecking..." (20145). The port printed only the second.
 */
process.env.SKIP_DB_INIT = '1';

import { DownloadHandler } from '../../../src/handlers/file/download.handler';

function caller() {
  const wire: string[] = [];
  const socket: any = { id: `d-${Math.random()}`, emit: (_e: string, d: unknown) => { wire.push(String(d)); return true; }, on: () => socket };
  const session: any = { nodeId: 1, currentConf: 1, user: { id: 'u1', secLevel: 10 }, tempData: { downloadFileList: [], downloadNumFiles: 0 } };
  return { socket, session, said: () => wire.join('') };
}

test('an empty filespec with nothing chosen: two line breaks and back to the menu', async () => {
  const c = caller();
  await DownloadHandler.handleFilenameInput(c.socket, c.session, '');
  expect(c.said()).toBe('\r\n\r\n');
});

test('Q: lineInput\'s break, then "Aborting..."', async () => {
  const c = caller();
  await DownloadHandler.handleFilenameInput(c.socket, c.session, 'Q');
  expect(c.said()).toBe('\r\nAborting...\r\n\r\n');
});
