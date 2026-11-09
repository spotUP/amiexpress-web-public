/**
 * The storage setup wizard's "Test connection" step: a sysop who has just
 * created a bucket and a key types them in and asks "does this work?" BEFORE
 * the drive exists. Before this route the only test was
 * `POST /drives/:n/test`, which needs a saved drive - so a mistyped secret
 * had to become a drive in the pool to be found out.
 *
 * The S3 client is stubbed at the SDK boundary, so the request runs through
 * the real route, the real service and the real `createS3Backend`.
 */
const mockSend = jest.fn();
const mockClientConfigs: unknown[] = [];

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation((config: unknown) => {
    mockClientConfigs.push(config);
    return { send: mockSend };
  }),
  ListObjectsV2Command: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));
jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() },
}));

import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import { createConfigRouter } from '../../src/api/config-routes';
import { config as appConfig } from '../../src/config';

async function waitForTestDb(): Promise<any> {
  for (let attempts = 0; !(global as any).testDb && attempts < 30; attempts++) {
    await new Promise(r => setTimeout(r, 500));
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

const SECRET = 'test-b2-application-key-0000000000';
const B2_BUCKET = {
  endpoint: 'https://s3.eu-central-003.backblazeb2.com',
  region: 'eu-central-003',
  bucket: 'my-bbs-files',
  keyId: '0031234567890ab0000000001',
  secret: SECRET,
};

/** What a test may not leave behind: a drive line or a key file. */
function storageFootprint(): string {
  const root = appConfig.get('dataDir');
  const drives = path.join(root, 'Drives.info');
  const keys = path.join(root, 'Storage');
  return JSON.stringify({
    drives: fs.existsSync(drives) ? fs.readFileSync(drives).toString('base64') : null,
    keys: fs.existsSync(keys) ? fs.readdirSync(keys).sort() : null,
  });
}

describe('POST /api/config/drives/test-connection', () => {
  let app: express.Application;

  beforeAll(async () => {
    const db = await waitForTestDb();
    app = express();
    app.use(express.json());
    app.use('/api/config', createConfigRouter(db));
  }, 30000);

  beforeEach(() => {
    mockSend.mockReset();
    mockClientConfigs.length = 0;
  });

  it('reaches the bucket with the typed key and saves nothing', async () => {
    mockSend.mockResolvedValue({ Contents: [], IsTruncated: false });
    const before = storageFootprint();

    const res = await request(app).post('/api/config/drives/test-connection').send(B2_BUCKET);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ reachable: true });
    expect(mockClientConfigs).toHaveLength(1);
    expect(mockClientConfigs[0]).toMatchObject({
      endpoint: B2_BUCKET.endpoint,
      region: 'eu-central-003',
      credentials: { accessKeyId: B2_BUCKET.keyId, secretAccessKey: SECRET },
    });
    // One request, against a prefix no area uses - never a walk of the bucket.
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toEqual({
      input: { Bucket: 'my-bbs-files', Prefix: '__connectivity_probe__/', ContinuationToken: undefined },
    });
    expect(storageFootprint()).toBe(before);
  });

  it('says in plain words that the secret is wrong, and never sends it back', async () => {
    mockSend.mockRejectedValue(
      Object.assign(new Error('The request signature we calculated does not match the signature you provided.'), {
        name: 'SignatureDoesNotMatch',
        $metadata: { httpStatusCode: 403 },
      })
    );

    const res = await request(app).post('/api/config/drives/test-connection').send(B2_BUCKET);

    expect(res.status).toBe(200);
    expect(res.body.data.reachable).toBe(false);
    expect(res.body.data.explanation).toMatch(/secret does not belong to this key ID/);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it('names a bucket that is not there', async () => {
    mockSend.mockRejectedValue(
      Object.assign(new Error('The specified bucket does not exist'), {
        name: 'NoSuchBucket',
        $metadata: { httpStatusCode: 404 },
      })
    );

    const res = await request(app).post('/api/config/drives/test-connection').send(B2_BUCKET);

    expect(res.body.data.reachable).toBe(false);
    expect(res.body.data.explanation).toMatch(/no bucket with this name/);
  });

  it('refuses a request with no secret before touching the network', async () => {
    const { secret: _omitted, ...withoutSecret } = B2_BUCKET;

    const res = await request(app).post('/api/config/drives/test-connection').send(withoutSecret);

    expect(res.status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
