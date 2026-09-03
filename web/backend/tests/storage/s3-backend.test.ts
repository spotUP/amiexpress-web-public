import { S3Backend, createS3Backend } from '../../src/storage/s3-backend';
import { StorageUnavailableError } from '../../src/storage/storage-backend';
import type { StorageVolume } from '../../src/storage/volume-config';

interface SentCommand { name: string; input: Record<string, unknown>; }

function clientReturning(handler: (cmd: SentCommand) => unknown) {
  const sent: SentCommand[] = [];
  return {
    sent,
    client: {
      async send(command: unknown): Promise<unknown> {
        const cmd = { name: command!.constructor.name, input: (command as { input: Record<string, unknown> }).input };
        sent.push(cmd);
        return handler(cmd);
      },
    },
  };
}

function namedError(name: string, extra: Record<string, unknown> = {}): Error {
  const err = new Error(name) as Error & Record<string, unknown>;
  err.name = name;
  Object.assign(err, extra);
  return err;
}

function baseVolume(overrides: Partial<StorageVolume> = {}): StorageVolume {
  return {
    driveNumber: 2,
    kind: 's3',
    path: 'uprough-cold',
    endpoint: 'https://s3.example.com',
    region: 'auto',
    egress: 'METERED',
    volumeClass: 'PAID',
    keyId: 'AKIAEXAMPLE',
    ...overrides,
  };
}

describe('S3Backend', () => {
  describe('put', () => {
    it('puts an object into the configured bucket under the given key, with the body', async () => {
      const { client, sent } = clientReturning(() => ({}));
      await new S3Backend(2, 'uprough-cold', client).put('Files/DEMO.LHA', Buffer.from('x'));
      expect(sent[0].name).toBe('PutObjectCommand');
      expect(sent[0].input).toMatchObject({ Bucket: 'uprough-cold', Key: 'Files/DEMO.LHA' });
      expect(Buffer.from(sent[0].input.Body as Buffer)).toEqual(Buffer.from('x'));
    });

    it('refuses a body over the 5 GB single-request limit by name, without calling send', async () => {
      const { client, sent } = clientReturning(() => ({}));
      const oversized = { length: 5 * 1024 ** 3 + 1 } as Buffer;
      await expect(new S3Backend(2, 'b', client).put('big.lha', oversized)).rejects.toThrow(/5.*GB|byte/i);
      expect(sent).toHaveLength(0);
    });

    it('refuses a 6 GB body outright, without calling send', async () => {
      const { client, sent } = clientReturning(() => ({}));
      const sixGb = { length: 6 * 1024 ** 3 } as Buffer;
      await expect(new S3Backend(2, 'b', client).put('huge.lha', sixGb)).rejects.toThrow(Error);
      expect(sent).toHaveLength(0);
    });
  });

  describe('get', () => {
    it('sends a GetObjectCommand for the configured bucket and key', async () => {
      const { client, sent } = clientReturning(() => ({
        Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      }));
      await new S3Backend(2, 'uprough-cold', client).get('Files/DEMO.LHA');
      expect(sent[0].name).toBe('GetObjectCommand');
      expect(sent[0].input).toMatchObject({ Bucket: 'uprough-cold', Key: 'Files/DEMO.LHA' });
    });

    it('reads a body back as a Buffer', async () => {
      const { client } = clientReturning(() => ({
        Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      }));
      const body = await new S3Backend(2, 'b', client).get('k');
      expect([...body]).toEqual([1, 2, 3]);
    });

    it('rethrows a missing object raw, not as StorageUnavailableError and not swallowed', async () => {
      const { client } = clientReturning(() => {
        throw namedError('NoSuchKey');
      });
      await expect(new S3Backend(2, 'b', client).get('k')).rejects.not.toBeInstanceOf(StorageUnavailableError);
      await expect(new S3Backend(2, 'b', client).get('k')).rejects.toMatchObject({ name: 'NoSuchKey' });
    });
  });

  describe('head', () => {
    it('sends a HeadObjectCommand and maps ContentLength/LastModified into an ObjectHead', async () => {
      const mtime = new Date('2026-01-01T00:00:00Z');
      const { client, sent } = clientReturning(() => ({ ContentLength: 42, LastModified: mtime }));
      const head = await new S3Backend(2, 'uprough-cold', client).head('Files/DEMO.LHA');
      expect(sent[0].name).toBe('HeadObjectCommand');
      expect(sent[0].input).toMatchObject({ Bucket: 'uprough-cold', Key: 'Files/DEMO.LHA' });
      expect(head).toEqual({ key: 'Files/DEMO.LHA', size: 42, mtime });
    });

    it('turns a missing object into null on head, not an exception', async () => {
      const { client } = clientReturning(() => {
        throw namedError('NotFound');
      });
      expect(await new S3Backend(2, 'b', client).head('k')).toBeNull();
    });

    it('treats a bare 404 status as absence even without the modeled name', async () => {
      const { client } = clientReturning(() => {
        throw namedError('UnknownGatewayError', { $metadata: { httpStatusCode: 404 } });
      });
      expect(await new S3Backend(2, 'b', client).head('k')).toBeNull();
    });

    it('reports a throttled or unreachable volume as unavailable, never as missing', async () => {
      const { client } = clientReturning(() => {
        throw namedError('SlowDown');
      });
      await expect(new S3Backend(2, 'b', client).get('k')).rejects.toBeInstanceOf(StorageUnavailableError);
    });

    it('treats a transient status ahead of a misleading NotFound-shaped name, never as missing', async () => {
      // A throttled or overloaded gateway can echo a stale/generic body -
      // the modeled name must not outrank the status when both are present.
      const { client } = clientReturning(() => {
        throw namedError('NotFound', { $metadata: { httpStatusCode: 503 } });
      });
      await expect(new S3Backend(2, 'b', client).head('k')).rejects.toBeInstanceOf(StorageUnavailableError);
    });

    it('classifies a 503 status as unavailable even under a name outside the fallback list', async () => {
      const { client } = clientReturning(() => {
        throw namedError('SomeUnlistedGatewayName', { $metadata: { httpStatusCode: 503 } });
      });
      await expect(new S3Backend(2, 'b', client).head('k')).rejects.toBeInstanceOf(StorageUnavailableError);
    });

    it('classifies a raw ECONNRESET as unavailable', async () => {
      const { client } = clientReturning(() => {
        throw namedError('Error', { code: 'ECONNRESET' });
      });
      await expect(new S3Backend(2, 'b', client).head('k')).rejects.toBeInstanceOf(StorageUnavailableError);
    });

    it('wraps an unclassified failure (e.g. a 403 from a missing ListBucket grant) as unavailable, not raw', async () => {
      // The two-branch StorageBackend contract (absence, StorageUnavailableError)
      // has no room for a third "raw SDK error" branch - an AccessDenied that
      // looks like "missing" until the status code is read must still come
      // out as "cannot answer right now", never as an uncaught exception.
      const { client } = clientReturning(() => {
        throw namedError('AccessDenied', { $metadata: { httpStatusCode: 403 } });
      });
      await expect(new S3Backend(2, 'b', client).head('k')).rejects.toBeInstanceOf(StorageUnavailableError);
    });
  });

  describe('delete', () => {
    it('sends a DeleteObjectCommand for the configured bucket and key', async () => {
      const { client, sent } = clientReturning(() => ({}));
      await new S3Backend(2, 'uprough-cold', client).delete('Files/DEMO.LHA');
      expect(sent[0].name).toBe('DeleteObjectCommand');
      expect(sent[0].input).toMatchObject({ Bucket: 'uprough-cold', Key: 'Files/DEMO.LHA' });
    });

    it('treats deleting an already-missing object as a no-op, matching LocalBackend', async () => {
      const { client } = clientReturning(() => {
        throw namedError('NoSuchKey');
      });
      await expect(new S3Backend(2, 'b', client).delete('k')).resolves.toBeUndefined();
    });

    it('reports a transient failure on delete as unavailable, never as a silent no-op', async () => {
      const { client } = clientReturning(() => {
        throw namedError('SlowDown');
      });
      await expect(new S3Backend(2, 'b', client).delete('k')).rejects.toBeInstanceOf(StorageUnavailableError);
    });
  });

  describe('list', () => {
    it('pages a listing until the bucket stops truncating it', async () => {
      let call = 0;
      const { client } = clientReturning(() => {
        call++;
        return call === 1
          ? { Contents: [{ Key: 'a', Size: 1, LastModified: new Date(0) }], IsTruncated: true, NextContinuationToken: 't' }
          : { Contents: [{ Key: 'b', Size: 2, LastModified: new Date(0) }], IsTruncated: false };
      });
      const heads = await new S3Backend(2, 'b', client).list('');
      expect(heads.map((h) => h.key)).toEqual(['a', 'b']);
    });

    it('sends Prefix and never Delimiter - recursive listing is a cross-task invariant', async () => {
      const { client, sent } = clientReturning(() => ({ Contents: [], IsTruncated: false }));
      await new S3Backend(2, 'b', client).list('Files/');
      expect(sent[0].name).toBe('ListObjectsV2Command');
      expect(sent[0].input.Prefix).toBe('Files/');
      expect(sent[0].input).not.toHaveProperty('Delimiter');
    });

    it('refuses a truncated page with no continuation token rather than returning a short listing', async () => {
      const { client } = clientReturning(() => ({
        Contents: [{ Key: 'a', Size: 1, LastModified: new Date(0) }],
        IsTruncated: true,
        NextContinuationToken: undefined,
      }));
      await expect(new S3Backend(2, 'b', client).list('')).rejects.toBeInstanceOf(StorageUnavailableError);
    });

    it('refuses a listing whose continuation token repeats, rather than looping forever', async () => {
      const { client } = clientReturning(() => ({
        Contents: [{ Key: 'a', Size: 1, LastModified: new Date(0) }],
        IsTruncated: true,
        NextContinuationToken: 'same-token',
      }));
      await expect(new S3Backend(2, 'b', client).list('')).rejects.toBeInstanceOf(StorageUnavailableError);
    });
  });
});

describe('createS3Backend', () => {
  it('refuses a volume whose kind is not s3', () => {
    expect(() => createS3Backend(baseVolume({ kind: 'local' }), 'secret')).toThrow(/not an s3/i);
  });

  it('refuses a missing KEYID', () => {
    expect(() => createS3Backend(baseVolume({ keyId: undefined }), 'secret')).toThrow(/KEYID/);
  });

  it('refuses an empty secret', () => {
    expect(() => createS3Backend(baseVolume(), '')).toThrow(/secret/i);
  });

  it('refuses a missing ENDPOINT', () => {
    expect(() => createS3Backend(baseVolume({ endpoint: undefined }), 'secret')).toThrow(/ENDPOINT/);
  });

  it('refuses a bucket path carrying a prefix (s3://bucket/prefix), naming the drive', () => {
    expect(() => createS3Backend(baseVolume({ path: 'uprough-cold/incoming' }), 'secret')).toThrow(
      /DRIVE\.2.*bucket/i
    );
  });
});
