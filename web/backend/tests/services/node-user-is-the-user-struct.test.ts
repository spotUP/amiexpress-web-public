/**
 * node<n>.user is the user struct express.e writes - 232 bytes, the same
 * record as the caller's slot in user.data.
 *
 * express.e createNodeUserFiles (2935-2950): Write(fh,loggedOnUser,SIZEOF
 * user). The board had a second serializer with its own layout and wrote 240
 * bytes, so zOOsTAT - the S command on this board, which reads that file -
 * showed conference #0, 3932160 minutes and no time left (GOTO8O, relayed
 * 2026-10-02).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NodeFileManager } from '../../src/services/NodeFileManager';
import { userFileManager } from '../../src/services/UserFileManager';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'node-user-'));

const user: any = {
  id: 'u1', username: '607080', slotNumber: 5, secLevel: 100, location: 'uP r0uGH',
  confRJoin: 4, autoRejoin: 4, timeLimit: 3600, timeTotal: 3600, timeUsed: 120, calls: 12,
  uploads: 0, downloads: 3, bytesUpload: 0, bytesDownload: 195232,
  created: new Date('2026-09-01T00:00:00Z'),
};

describe('node<n>.user', () => {
  it('is the 232-byte user struct, byte for byte the user.data record', () => {
    new NodeFileManager(root).writeNodeUserFile(5, user);
    const written = fs.readFileSync(path.join(root, 'node5.user'));
    expect(written.length).toBe(232);
    expect(written.equals(userFileManager.userRecord(user, 5))).toBe(true);
  });

  it('node<n>.userkeys is the user.keys record', () => {
    new NodeFileManager(root).writeNodeUserKeysFile(5, user);
    const written = fs.readFileSync(path.join(root, 'node5.userkeys'));
    expect(written.equals(userFileManager.userKeysRecord(user, 5))).toBe(true);
  });

  it('reads back as the same record', () => {
    const mgr = new NodeFileManager(root);
    mgr.writeNodeUserFile(5, user);
    expect(mgr.readNodeUserFile(5)?.name).toBe('607080');
  });
});
