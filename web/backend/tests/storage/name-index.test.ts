import { NameIndex } from '../../src/storage/name-index';
import { StorageUnavailableError } from '../../src/storage/storage-backend';
import { FakeBackend } from './fake-backend';

describe('NameIndex', () => {
  it('resolves the caller spelling to the real key', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/FILE.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');
    expect(await index.resolve('file.lha')).toBe('Files/FILE.LHA');
  });

  it('lists once, however many lookups follow', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/A.LHA', Buffer.from('x'));
    await backend.put('Files/B.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');
    await index.resolve('a.lha');
    await index.resolve('b.lha');
    await index.resolve('a.lha');
    expect(backend.lists).toBe(1);
  });

  it('knows about a new object without re-listing', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    const index = new NameIndex(backend, 'Files/');
    await index.resolve('anything'); // primes the index
    await backend.put('Files/NEW.LHA', Buffer.from('x'));
    index.note('Files/NEW.LHA');
    expect(await index.resolve('new.lha')).toBe('Files/NEW.LHA');
    expect(backend.lists).toBe(1);
  });

  it('forgets a deleted object', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/OLD.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');
    expect(await index.resolve('old.lha')).toBe('Files/OLD.LHA');
    index.forget('Files/OLD.LHA');
    expect(await index.resolve('old.lha')).toBeNull();
  });

  it('answers null for a name nobody uploaded', async () => {
    const index = new NameIndex(new FakeBackend({ driveNumber: 2 }), 'Files/');
    expect(await index.resolve('ghost.lha')).toBeNull();
  });

  // --- Decision 1: an unavailable volume must never look like an empty area ---

  it('propagates unavailability from refresh instead of caching an empty area', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/FILE.LHA', Buffer.from('x'));
    backend.down = true;
    const index = new NameIndex(backend, 'Files/');

    await expect(index.resolve('file.lha')).rejects.toBeInstanceOf(StorageUnavailableError);

    // The volume comes back: the index must still be able to resolve the
    // real file, not have latched an empty result while the volume was down.
    backend.down = false;
    expect(await index.resolve('file.lha')).toBe('Files/FILE.LHA');
  });

  it('keeps serving the last good listing when a later refresh fails', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/FILE.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');
    expect(await index.resolve('file.lha')).toBe('Files/FILE.LHA');

    backend.down = true;
    await expect(index.refresh()).rejects.toBeInstanceOf(StorageUnavailableError);

    backend.down = false;
    // Still answers correctly from the prior good listing, and did not
    // silently re-list to recover - the failed refresh left it primed.
    expect(await index.resolve('file.lha')).toBe('Files/FILE.LHA');
    expect(backend.lists).toBe(1);
  });

  // --- Decision 2: note()/forget() before the index has ever been primed ---

  it('a note taken before priming does not survive the real refresh that follows', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/REAL.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');

    // Called before anything has primed the index - must not be trusted
    // over the backend's actual contents.
    index.note('Files/PHANTOM.LHA');

    expect(await index.resolve('real.lha')).toBe('Files/REAL.LHA');
    expect(await index.resolve('phantom.lha')).toBeNull();
    expect(backend.lists).toBe(1);
  });

  it('a forget issued before priming does not hide an object that is still there', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/STILL.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');

    index.forget('Files/STILL.LHA'); // called before anything has ever primed the index

    expect(await index.resolve('still.lha')).toBe('Files/STILL.LHA');
  });

  // --- Decision 3: same lowercased name, two real keys - pick one deterministically ---

  it('resolves a case collision deterministically - the ordinally greatest key wins', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/file.lha', Buffer.from('x'));
    await backend.put('Files/FILE.LHA', Buffer.from('y'));
    const index = new NameIndex(backend, 'Files/');
    // 'file.lha' > 'FILE.LHA' in ordinal (byte) comparison, since lowercase
    // letters sort after uppercase ones.
    expect(await index.resolve('file.lha')).toBe('Files/file.lha');
  });

  it('the case-collision winner does not depend on write or listing order', async () => {
    const backendA = new FakeBackend({ driveNumber: 2 });
    await backendA.put('Files/FILE.LHA', Buffer.from('y'));
    await backendA.put('Files/file.lha', Buffer.from('x'));
    const indexA = new NameIndex(backendA, 'Files/');

    const backendB = new FakeBackend({ driveNumber: 3 });
    await backendB.put('Files/file.lha', Buffer.from('x'));
    await backendB.put('Files/FILE.LHA', Buffer.from('y'));
    const indexB = new NameIndex(backendB, 'Files/');

    expect(await indexA.resolve('file.lha')).toBe(await indexB.resolve('file.lha'));
  });
});
