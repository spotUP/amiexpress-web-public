import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalBackend } from '../../src/storage/local-backend';
import { StorageQuotaError, StorageUnavailableError } from '../../src/storage/storage-backend';
import { FakeBackend } from './fake-backend';

const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0;

describe('LocalBackend', () => {
  it('round-trips an object through a real directory', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localback-'));
    const backend = new LocalBackend(1, root);

    await backend.put('Files/DEMO.LHA', Buffer.from('payload'));
    expect((await backend.get('Files/DEMO.LHA')).toString()).toBe('payload');

    const head = await backend.head('Files/DEMO.LHA');
    expect(head?.size).toBe(7);

    expect((await backend.list('Files/')).map((o) => o.key)).toEqual(['Files/DEMO.LHA']);

    await backend.delete('Files/DEMO.LHA');
    expect(await backend.head('Files/DEMO.LHA')).toBeNull();
  });

  it('answers head with null rather than throwing for a missing object', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localback2-'));
    expect(await new LocalBackend(1, root).head('nope')).toBeNull();
  });

  it('refuses a key that escapes the drive root with a ".." segment', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localback-escape-'));
    const backend = new LocalBackend(1, root);

    await expect(backend.get('../escape')).rejects.toThrow(/\.\./);
    await expect(backend.put('../escape', Buffer.from('x'))).rejects.toThrow(/\.\./);
    await expect(backend.delete('../escape')).rejects.toThrow(/\.\./);
    await expect(backend.list('../escape/')).rejects.toThrow(/\.\./);
    await expect(backend.head('../escape')).rejects.toThrow(/\.\./);
  });

  it('refuses an absolute key', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localback-abs-'));
    const backend = new LocalBackend(1, root);
    const absolute = path.join(os.tmpdir(), 'somewhere-else');

    await expect(backend.get(absolute)).rejects.toThrow(/absolute/);
    await expect(backend.put(absolute, Buffer.from('x'))).rejects.toThrow(/absolute/);
    await expect(backend.delete(absolute)).rejects.toThrow(/absolute/);
    await expect(backend.list(`${absolute}/`)).rejects.toThrow(/absolute/);
    await expect(backend.head(absolute)).rejects.toThrow(/absolute/);
  });

  // chmod 000 does not restrict root, so this test cannot force EACCES there.
  (runningAsRoot ? it.skip : it)(
    'reports an unreadable directory as unavailable, not as a missing object',
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localback-unreadable-'));
      const backend = new LocalBackend(1, root);
      await backend.put('secret/DEMO.LHA', Buffer.from('payload'));

      const secretDir = path.join(root, 'secret');
      fs.chmodSync(secretDir, 0o000);
      try {
        await expect(backend.head('secret/DEMO.LHA')).rejects.toBeInstanceOf(StorageUnavailableError);
        await expect(backend.get('secret/DEMO.LHA')).rejects.toBeInstanceOf(StorageUnavailableError);
      } finally {
        fs.chmodSync(secretDir, 0o700);
      }
    }
  );

  it('lists recursively, matching FakeBackend key-for-key on a two-level tree', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localback-recursive-'));
    const local = new LocalBackend(1, root);
    const fake = new FakeBackend({ driveNumber: 1 });

    const files: Record<string, string> = {
      'Conf1/Files/DEMO.LHA': 'a',
      'Conf1/Files/sub/NESTED.LHA': 'bb',
      'Conf1/Files/OTHER.LHA': 'ccc',
      'Conf1/Bulletins/BULL1.TXT': 'dddd',
    };
    for (const [key, content] of Object.entries(files)) {
      await local.put(key, Buffer.from(content));
      await fake.put(key, Buffer.from(content));
    }

    const localKeys = (await local.list('Conf1/Files/')).map((o) => o.key).sort();
    const fakeKeys = (await fake.list('Conf1/Files/')).map((o) => o.key).sort();

    expect(localKeys).toEqual(fakeKeys);
    expect(localKeys).toEqual([
      'Conf1/Files/DEMO.LHA',
      'Conf1/Files/OTHER.LHA',
      'Conf1/Files/sub/NESTED.LHA',
    ]);
  });

  it('excludes an orphaned temp file from list(), so a crash mid-write never surfaces as an object', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localback-tmp-leak-'));
    const backend = new LocalBackend(1, root);
    await backend.put('Files/DEMO.LHA', Buffer.from('payload'));

    // Simulate a temp file orphaned by a crash between writeFile and rename -
    // same directory, same naming scheme put() actually uses.
    fs.mkdirSync(path.join(root, 'Files'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'Files', '.DEMO.LHA.tmp-1234-abcdef012345'),
      Buffer.from('half-written')
    );

    expect((await backend.list('Files/')).map((o) => o.key)).toEqual(['Files/DEMO.LHA']);
  });

  it('lists a real object whose key merely ends in the temp-file shape, with no leading dot', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localback-lookalike-'));
    const backend = new LocalBackend(1, root);

    // Shaped exactly like a temp-file suffix ('.tmp-<digits>-<hex>'), but the
    // key itself carries no leading dot - a caller-uploaded object, not
    // scratch space from a crashed put().
    await backend.put('Files/REPORT.tmp-20240101-abc123', Buffer.from('payload'));

    expect((await backend.list('Files/')).map((o) => o.key)).toEqual([
      'Files/REPORT.tmp-20240101-abc123',
    ]);
  });

  it('refuses an empty key or "." as a key, since both resolve to the drive root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localback-empty-key-'));
    const backend = new LocalBackend(1, root);

    for (const badKey of ['', '.']) {
      await expect(backend.get(badKey)).rejects.toThrow(/empty/);
      await expect(backend.put(badKey, Buffer.from('x'))).rejects.toThrow(/empty/);
      await expect(backend.delete(badKey)).rejects.toThrow(/empty/);
      await expect(backend.list(badKey)).rejects.toThrow(/empty/);
    }

    // Nothing was written into the drive root or its parent.
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('treats a key nested under a file (ENOTDIR) as missing, not as unavailable', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localback-enotdir-'));
    const backend = new LocalBackend(1, root);
    await backend.put('Files/DEMO.LHA', Buffer.from('payload'));

    // 'Files/DEMO.LHA' is a file, not a directory - nothing can be nested
    // under it, so a key that tries to reach under it does not exist.
    const nested = 'Files/DEMO.LHA/nested';

    expect(await backend.head(nested)).toBeNull();
    await expect(backend.get(nested)).rejects.toMatchObject({ code: 'ENOTDIR' });
    await expect(backend.get(nested)).rejects.not.toBeInstanceOf(StorageUnavailableError);
    await expect(backend.delete(nested)).resolves.toBeUndefined();
    expect(await backend.list(`${nested}/`)).toEqual([]);
  });
});

describe('FakeBackend', () => {
  it('counts every call, so a test can prove a fetch happened once', async () => {
    const fake = new FakeBackend({ driveNumber: 2 });
    await fake.put('a', Buffer.from('x'));
    await fake.get('a');
    await fake.get('a');
    expect(fake.puts).toBe(1);
    expect(fake.gets).toBe(2);
    expect(fake.requests).toBe(3);
  });

  it('refuses a put past its quota', async () => {
    const fake = new FakeBackend({ driveNumber: 2, quotaBytes: 4 });
    await expect(fake.put('a', Buffer.alloc(5))).rejects.toBeInstanceOf(StorageQuotaError);
  });

  it('fails every call while down', async () => {
    const fake = new FakeBackend({ driveNumber: 2 });
    await fake.put('a', Buffer.from('x'));
    fake.down = true;
    await expect(fake.get('a')).rejects.toThrow(/unavailable/i);
  });

  it('fails every call while gone', async () => {
    const fake = new FakeBackend({ driveNumber: 2 });
    fake.gone = true;
    await expect(fake.get('a')).rejects.toThrow(/gone/i);
  });

  it('fails every call while rate limited', async () => {
    const fake = new FakeBackend({ driveNumber: 2 });
    fake.rateLimited = true;
    await expect(fake.get('a')).rejects.toThrow(/rate limited/i);
  });

  it('refuses a call once the request budget is exhausted', async () => {
    const fake = new FakeBackend({ driveNumber: 2, requestBudget: 2 });
    await fake.put('a', Buffer.from('x')); // request 1
    await fake.get('a'); // request 2
    await expect(fake.get('a')).rejects.toBeInstanceOf(StorageUnavailableError); // request 3, over budget
  });

  it('counts a failed attempt against a down volume, not just successful ones', async () => {
    const fake = new FakeBackend({ driveNumber: 2 });
    fake.down = true;
    await expect(fake.get('a')).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(fake.get('a')).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(fake.get('a')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(fake.requests).toBe(3);
  });

  it('does not double-charge quota when overwriting an existing key', async () => {
    const fake = new FakeBackend({ driveNumber: 2, quotaBytes: 5 });
    await fake.put('a', Buffer.alloc(5));
    await expect(fake.put('a', Buffer.alloc(5))).resolves.toBeUndefined();
  });

  it('tracks egress bytes on get', async () => {
    const fake = new FakeBackend({ driveNumber: 2 });
    await fake.put('a', Buffer.from('hello'));
    await fake.get('a');
    expect(fake.egressBytes).toBe(5);
  });

  it('counts head calls', async () => {
    const fake = new FakeBackend({ driveNumber: 2 });
    await fake.put('a', Buffer.from('x'));
    await fake.head('a');
    expect(fake.heads).toBe(1);
  });

  it('counts list calls', async () => {
    const fake = new FakeBackend({ driveNumber: 2 });
    await fake.put('a', Buffer.from('x'));
    await fake.list('');
    expect(fake.lists).toBe(1);
  });
});
