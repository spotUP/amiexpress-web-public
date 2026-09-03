import { S3Backend } from '../../src/storage/s3-backend';
import { StorageUnavailableError } from '../../src/storage/storage-backend';

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

describe('S3Backend', () => {
  it('puts an object into the configured bucket under the given key', async () => {
    const { client, sent } = clientReturning(() => ({}));
    await new S3Backend(2, 'uprough-cold', client).put('Files/DEMO.LHA', Buffer.from('x'));
    expect(sent[0].name).toBe('PutObjectCommand');
    expect(sent[0].input).toMatchObject({ Bucket: 'uprough-cold', Key: 'Files/DEMO.LHA' });
  });

  it('reads a body back as a Buffer', async () => {
    const { client } = clientReturning(() => ({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    }));
    const body = await new S3Backend(2, 'b', client).get('k');
    expect([...body]).toEqual([1, 2, 3]);
  });

  it('turns a missing object into null on head, not an exception', async () => {
    const { client } = clientReturning(() => {
      const err = new Error('NotFound') as Error & { name: string };
      err.name = 'NotFound';
      throw err;
    });
    expect(await new S3Backend(2, 'b', client).head('k')).toBeNull();
  });

  it('reports a throttled or unreachable volume as unavailable, never as missing', async () => {
    const { client } = clientReturning(() => {
      const err = new Error('SlowDown') as Error & { name: string };
      err.name = 'SlowDown';
      throw err;
    });
    await expect(new S3Backend(2, 'b', client).get('k')).rejects.toBeInstanceOf(StorageUnavailableError);
  });

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
});
