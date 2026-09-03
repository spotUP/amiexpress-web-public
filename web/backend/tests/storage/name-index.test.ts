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

  // --- Unavailability during refresh() must never look like an empty area ---

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

  // --- note()/forget() before the index has ever been primed ---

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

  // --- CRITICAL fix: note()/forget() landing while a refresh() is in flight ---

  it('replays a note() that lands mid-refresh instead of losing it to the listing that predates it', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    const index = new NameIndex(backend, 'Files/');

    const refreshing = index.refresh(); // list() is in flight, not yet resolved
    index.note('Files/NEW.LHA'); // an upload landed before the listing's snapshot commits
    await refreshing;

    expect(await index.resolve('new.lha')).toBe('Files/NEW.LHA');
    expect(backend.lists).toBe(1); // no extra listing was needed to pick it up
  });

  it('replays a forget() that lands mid-refresh instead of losing it to the listing that predates it', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/OLD.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');
    await index.resolve('old.lha'); // primed once already, lists === 1

    const refreshing = index.refresh(); // re-list in flight, still sees OLD.LHA
    index.forget('Files/OLD.LHA'); // a delete landed before this listing's snapshot commits
    await refreshing;

    expect(await index.resolve('old.lha')).toBeNull();
  });

  // --- Important #2: concurrent first lookups on an unprimed index ---

  it('two concurrent first lookups on an unprimed index cause only one listing', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/FILE.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');

    const [a, b] = await Promise.all([index.resolve('file.lha'), index.resolve('file.lha')]);

    expect(a).toBe('Files/FILE.LHA');
    expect(b).toBe('Files/FILE.LHA');
    expect(backend.lists).toBe(1);
  });

  it('a refresh() failure does not stick - the next refresh() tries again', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/FILE.LHA', Buffer.from('x'));
    backend.down = true;
    const index = new NameIndex(backend, 'Files/');

    await expect(index.refresh()).rejects.toBeInstanceOf(StorageUnavailableError);

    backend.down = false;
    await index.refresh(); // must not still be "in flight" from the failed attempt
    expect(await index.resolve('file.lha')).toBe('Files/FILE.LHA');
    // `requests` counts every charge() call, including the setup put() and
    // both refresh attempts; `lists` counts only the one that actually
    // listed. A stuck in-flight promise would have rejoined the failed
    // attempt instead of making a real second one, and requests would read
    // one lower than this.
    expect(backend.requests).toBe(3); // put, failed list, successful list
    expect(backend.lists).toBe(1);
  });

  // --- Important #3: exact spelling beats the case-insensitive tie-break ---

  it('resolve() returns the exact-spelling match ahead of the ordinal tie-break, even when a case sibling also exists', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/file.lha', Buffer.from('x'));
    await backend.put('Files/FILE.LHA', Buffer.from('y'));
    const index = new NameIndex(backend, 'Files/');

    expect(await index.resolve('FILE.LHA')).toBe('Files/FILE.LHA');
    expect(await index.resolve('file.lha')).toBe('Files/file.lha');
  });

  it('falls back to the ordinal tie-break only when neither exact spelling is present', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/file.lha', Buffer.from('x'));
    await backend.put('Files/FILE.LHA', Buffer.from('y'));
    const index = new NameIndex(backend, 'Files/');

    // 'File.Lha' matches neither key byte-for-byte, so there is no exact
    // hit and the deterministic ordinal winner ('file.lha' > 'FILE.LHA')
    // answers.
    expect(await index.resolve('File.Lha')).toBe('Files/file.lha');
  });

  it('the tie-break winner does not depend on write or listing order', async () => {
    const backendA = new FakeBackend({ driveNumber: 2 });
    await backendA.put('Files/FILE.LHA', Buffer.from('y'));
    await backendA.put('Files/file.lha', Buffer.from('x'));
    const indexA = new NameIndex(backendA, 'Files/');

    const backendB = new FakeBackend({ driveNumber: 3 });
    await backendB.put('Files/file.lha', Buffer.from('x'));
    await backendB.put('Files/FILE.LHA', Buffer.from('y'));
    const indexB = new NameIndex(backendB, 'Files/');

    expect(await indexA.resolve('File.Lha')).toBe(await indexB.resolve('File.Lha'));
  });

  it('forget() removes only the key that was forgotten, not a same-named case sibling', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/file.lha', Buffer.from('x'));
    await backend.put('Files/FILE.LHA', Buffer.from('y'));
    const index = new NameIndex(backend, 'Files/');
    await index.resolve('file.lha'); // primes

    index.forget('Files/FILE.LHA');

    // The exact FILE.LHA object is gone, but a caller typing that exact
    // spelling still finds the surviving file.lha sibling through the
    // tie-break - forgetting one case variant must not make the whole name
    // unresolvable when another variant is still really there.
    expect(await index.resolve('FILE.LHA')).toBe('Files/file.lha');
    expect(await index.resolve('file.lha')).toBe('Files/file.lha'); // untouched sibling, still exact
    expect(await index.resolve('File.Lha')).toBe('Files/file.lha'); // tie-break now has only one candidate
  });

  it('note() does not silently overwrite the deterministic tie-break winner', async () => {
    // Regression for the earlier design, where note() stored a single
    // "winner" per lowered name and a later write for the OTHER case
    // variant clobbered it outright, rather than adding a second candidate
    // the tie-break could still choose between.
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/file.lha', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');
    await index.resolve('file.lha'); // primes with only the lowercase key

    await backend.put('Files/FILE.LHA', Buffer.from('y'));
    index.note('Files/FILE.LHA');

    // Both are still resolvable by their own exact spelling.
    expect(await index.resolve('file.lha')).toBe('Files/file.lha');
    expect(await index.resolve('FILE.LHA')).toBe('Files/FILE.LHA');
  });

  // --- Important #5: keyed on the path relative to the prefix, not the basename ---

  it('keys on the path relative to the prefix, so a nested file and a flat file of the same name stay distinct', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('flat'));
    await backend.put('Conf1/Files/old/DEMO.LHA', Buffer.from('nested'));
    const index = new NameIndex(backend, 'Conf1/Files/');

    expect(await index.resolve('DEMO.LHA')).toBe('Conf1/Files/DEMO.LHA');
    expect(await index.resolve('old/DEMO.LHA')).toBe('Conf1/Files/old/DEMO.LHA');
  });

  // --- Important #4: a MISS re-lists past the staleness window; hits never do ---

  it('a miss past the staleness window forces one re-list before answering not-found', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    let clock = 0;
    const index = new NameIndex(backend, 'Files/', { staleAfterMs: 1000, now: () => clock });

    expect(await index.resolve('ghost.lha')).toBeNull();
    expect(backend.lists).toBe(1);

    clock += 1500; // past the window
    await backend.put('Files/GHOST.LHA', Buffer.from('x')); // something else wrote the bucket meanwhile

    expect(await index.resolve('ghost.lha')).toBe('Files/GHOST.LHA');
    expect(backend.lists).toBe(2); // the stale miss forced exactly one more listing
  });

  it('a miss inside the staleness window does not re-list', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    let clock = 0;
    const index = new NameIndex(backend, 'Files/', { staleAfterMs: 1000, now: () => clock });

    expect(await index.resolve('ghost.lha')).toBeNull();
    expect(backend.lists).toBe(1);

    clock += 500; // still inside the window
    expect(await index.resolve('ghost.lha')).toBeNull();
    expect(backend.lists).toBe(1); // no extra listing
  });

  it('a down backend past the staleness window costs one list attempt, not one per subsequent miss', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    let clock = 0;
    const index = new NameIndex(backend, 'Files/', { staleAfterMs: 1000, now: () => clock });

    await index.resolve('ghost.lha'); // primes with a real listing
    expect(backend.lists).toBe(1);

    clock += 1500; // past the window
    backend.down = true;

    // The first stale miss after the outage begins still attempts, and
    // still surfaces the real failure.
    await expect(index.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    const requestsAfterFirstAttempt = backend.requests;

    // Still down, clock unmoved: without a lastAttemptAt separate from the
    // last SUCCESS, refreshedAt would never advance while down and every
    // one of these would attempt (and fail) again on its own.
    expect(await index.resolve('ghost.lha')).toBeNull();
    expect(await index.resolve('ghost.lha')).toBeNull();
    expect(backend.requests).toBe(requestsAfterFirstAttempt); // no further attempts

    // Once another full window has passed since that attempt, one more
    // attempt is made - the throttle recovers, it does not wedge shut.
    clock += 1500;
    await expect(index.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(backend.requests).toBe(requestsAfterFirstAttempt + 1);
  });

  // --- Important: the gap between the drain and the in-flight flag clearing ---

  it('does not lose a note() landing between the buffered-op drain and the in-flight flag actually clearing', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    const index = new NameIndex(backend, 'Files/');

    const p = index.refresh(); // suspends at await backend.list()
    index.note('Files/A.LHA'); // buffered while genuinely in flight, replayed on commit
    await Promise.resolve(); // one microtask - lands after a same-tick drain, not before
    index.note('Files/B.LHA'); // must not be silently swallowed by an already-drained buffer
    await p;

    expect(await index.resolve('a.lha')).toBe('Files/A.LHA');
    expect(await index.resolve('b.lha')).toBe('Files/B.LHA');
  });

  // --- Important, latent: resolve() must normalise its argument the same way stored keys are ---

  it('resolves the same object whether the caller passes a bare name or the full key including the prefix', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Conf1/Files/FILE.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Conf1/Files/');

    expect(await index.resolve('FILE.LHA')).toBe('Conf1/Files/FILE.LHA');
    expect(await index.resolve('Conf1/Files/FILE.LHA')).toBe('Conf1/Files/FILE.LHA');
  });
});
