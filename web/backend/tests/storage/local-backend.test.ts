import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalBackend } from '../../src/storage/local-backend';
import { StorageQuotaError } from '../../src/storage/storage-backend';
import { FakeBackend } from './fake-backend';

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
});
