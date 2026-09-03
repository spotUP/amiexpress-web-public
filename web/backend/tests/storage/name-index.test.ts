import { BackendRetryGate, NameIndex } from '../../src/storage/name-index';
import type { ObjectHead } from '../../src/storage/storage-backend';
import { StorageUnavailableError } from '../../src/storage/storage-backend';
import { FakeBackend } from './fake-backend';

/**
 * A volume whose list() breaks the way no adapter is supposed to let it -
 * not a StorageUnavailableError, just a bug (a malformed page, a null
 * dereference, an OOM). What the index has to remember is that the last
 * attempt FAILED, never that it failed with the type we were expecting.
 */
class BrokenListBackend extends FakeBackend {
  breakList = false;
  listAttempts = 0;

  async list(prefix: string): Promise<ObjectHead[]> {
    this.listAttempts++;
    if (this.breakList) {
      throw new TypeError("Cannot read properties of undefined (reading 'Contents')");
    }
    return super.list(prefix);
  }
}

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
    let clock = 0;
    const index = new NameIndex(backend, 'Files/', {
      staleAfterMs: 1000,
      errorRetryAfterMs: 1000,
      now: () => clock,
    });

    await expect(index.resolve('file.lha')).rejects.toBeInstanceOf(StorageUnavailableError);

    // The volume comes back, and once the throttle window has rolled over
    // the index tries again (it does not retry on every call while
    // unprimed and down - see the cold-start throttle tests below): it
    // must be able to resolve the real file, not have latched an empty
    // result while the volume was down.
    backend.down = false;
    clock += 1500;
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

  // --- CRITICAL: a stale miss must never degrade to "not found" while the
  // backend is known to be down - only the ATTEMPT is throttled, never the
  // honesty of the answer. ---

  it('(a) primed and down: every stale miss rejects, not just the first, and costs zero further requests', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    let clock = 0;
    const index = new NameIndex(backend, 'Files/', {
      staleAfterMs: 1000,
      errorRetryAfterMs: 1000,
      now: () => clock,
    });

    await index.resolve('ghost.lha'); // primes with a real listing
    expect(backend.lists).toBe(1);

    clock += 1500; // past the window
    backend.down = true;

    // The first stale miss after the outage begins attempts, and surfaces
    // the real failure.
    await expect(index.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    const requestsAfterFirstAttempt = backend.requests;

    // Still down, clock unmoved: every later stale miss must ALSO reject -
    // answering null here would be indistinguishable from "no such object"
    // to a caller sweeping a catalog, and would delete a good row. No
    // further requests are spent to know this; the throttle caps the
    // ATTEMPT rate, not the honesty of the answer.
    await expect(index.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(index.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(backend.requests).toBe(requestsAfterFirstAttempt); // no further attempts

    // Once another full window has passed since that attempt, one more
    // attempt is made - the throttle recovers, it does not wedge shut.
    clock += 1500;
    await expect(index.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(backend.requests).toBe(requestsAfterFirstAttempt + 1);
  });

  it('(b) primed and down: a hit still answers from the stale maps, no request spent', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/FILE.LHA', Buffer.from('x'));
    let clock = 0;
    const index = new NameIndex(backend, 'Files/', { staleAfterMs: 1000, now: () => clock });

    await index.resolve('file.lha'); // primes
    expect(backend.lists).toBe(1);

    clock += 1500; // past the window
    backend.down = true;

    // The object was real before the outage and nothing has said otherwise -
    // a hit is trusted regardless of age (invariant 4), and answering it
    // never touches the backend.
    expect(await index.resolve('file.lha')).toBe('Files/FILE.LHA');
    expect(backend.lists).toBe(1);
    expect(backend.requests).toBe(2); // the one setup put(), the one priming list()
  });

  it('(c) unprimed and down: every resolve() call rejects, and costs one attempt per retry window', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    backend.down = true;
    let clock = 0;
    const index = new NameIndex(backend, 'Files/', {
      staleAfterMs: 1000,
      errorRetryAfterMs: 100,
      now: () => clock,
    });

    await expect(index.resolve('anything')).rejects.toBeInstanceOf(StorageUnavailableError);
    const requestsAfterFirstAttempt = backend.requests;

    // Still unprimed, still down: the cold-start path is throttled exactly
    // like the stale-miss path above - without this, a cold-start outage
    // costs one list() per resolve() call, hit or miss, unbounded. The clock
    // is injected rather than real: this assertion is about the window, and
    // a test that only holds while three awaits happen to finish inside it
    // is measuring the machine, not the code.
    clock += 50; // inside the retry window
    await expect(index.resolve('anything')).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(index.resolve('anything')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(backend.requests).toBe(requestsAfterFirstAttempt); // no further attempts

    clock += 100; // past the retry window: exactly one more attempt, and it still rejects
    await expect(index.resolve('anything')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(backend.requests).toBe(requestsAfterFirstAttempt + 1);
  });

  it('(d) once the backend recovers and the window rolls over, a miss answers null again', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    let clock = 0;
    const index = new NameIndex(backend, 'Files/', {
      staleAfterMs: 1000,
      errorRetryAfterMs: 1000,
      now: () => clock,
    });

    await index.resolve('ghost.lha'); // primes
    clock += 1500;
    backend.down = true;
    await expect(index.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);

    clock += 1500; // window rolls over again
    backend.down = false; // the backend has genuinely recovered

    // A real, current answer - not the cached failure from before.
    expect(await index.resolve('ghost.lha')).toBeNull();
    expect(await index.resolve('ghost.lha')).toBeNull(); // stays null, no lingering error
  });

  // --- Recovery cadence: a believed-down backend is retried in SECONDS, while
  // a miss stays trusted for the full budget window. One number cannot mean
  // both. ---

  it('(e) unprimed and down: recovery is picked up after the short retry window, not the long stale one', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/FILE.LHA', Buffer.from('x'));
    backend.down = true;
    let clock = 0;
    const index = new NameIndex(backend, 'Files/', {
      staleAfterMs: 60 * 60 * 1000, // an hour: how long a MISS is trusted
      errorRetryAfterMs: 15 * 1000, // fifteen seconds: how long a FAILURE is trusted
      now: () => clock,
    });

    await expect(index.resolve('file.lha')).rejects.toBeInstanceOf(StorageUnavailableError);

    // The volume comes back a moment after that attempt. An index that has
    // never listed is wholly unusable until it can list - gating that retry
    // on the hour-long miss-trust window means this area answers "storage
    // unavailable" to a caller at the File: prompt for the rest of the hour
    // while the volume is healthy.
    backend.down = false;
    clock += 20 * 1000; // past the retry window, nowhere near the stale window

    expect(await index.resolve('file.lha')).toBe('Files/FILE.LHA');
  });

  it('(f) primed and down: a recovered volume answers again after the retry window, not an hour later', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    let clock = 0;
    const index = new NameIndex(backend, 'Files/', {
      staleAfterMs: 60 * 60 * 1000,
      errorRetryAfterMs: 15 * 1000,
      now: () => clock,
    });

    expect(await index.resolve('ghost.lha')).toBeNull(); // primes
    clock += 61 * 60 * 1000; // the miss has gone stale
    backend.down = true;
    await expect(index.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);

    backend.down = false;
    clock += 20 * 1000; // one retry window later, not one stale window later

    expect(await index.resolve('ghost.lha')).toBeNull();
    expect(backend.lists).toBe(2); // the priming listing, and the one that confirmed recovery
  });

  it('(g) the default retry window is seconds - the defaults a registry-built index gets recover promptly', async () => {
    // NameIndexRegistry constructs every index with the defaults, so whatever
    // they are is what a real area on a real board behaves like.
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/FILE.LHA', Buffer.from('x'));
    backend.down = true;
    let clock = 0;
    const index = new NameIndex(backend, 'Files/', { now: () => clock });

    await expect(index.resolve('file.lha')).rejects.toBeInstanceOf(StorageUnavailableError);

    backend.down = false;
    clock += 30 * 1000; // half a minute - deep inside the one-hour miss-trust default

    expect(await index.resolve('file.lha')).toBe('Files/FILE.LHA');
  });

  // --- Any failure is remembered, not only the expected type: the "not found
  // during an outage" hole must not be reachable through a type check. ---

  it('(h) a non-storage failure is remembered too - a later stale miss rejects instead of answering not-found', async () => {
    const backend = new BrokenListBackend({ driveNumber: 2 });
    let clock = 0;
    const index = new NameIndex(backend, 'Files/', {
      staleAfterMs: 1000,
      errorRetryAfterMs: 100,
      now: () => clock,
    });

    expect(await index.resolve('ghost.lha')).toBeNull(); // primes
    clock += 1500; // the miss has gone stale
    backend.breakList = true;

    // The attempt that actually ran surfaces the real bug, untouched.
    await expect(index.resolve('ghost.lha')).rejects.toBeInstanceOf(TypeError);
    expect(backend.listAttempts).toBe(2);

    // Inside the retry window the miss must STILL reject. Answering null here
    // is "there is no such file" for a file that is fine - the failure the
    // whole cached-error gate exists to prevent, reached through the type
    // check rather than through the throttle.
    const raised: unknown = await index.resolve('ghost.lha').catch((err: unknown) => err);
    expect(raised).toBeInstanceOf(StorageUnavailableError);
    // Raised fresh rather than re-throwing one shared mutable object to every
    // caller in the window; the original travels along untouched as `cause`.
    expect((raised as { cause?: unknown }).cause).toBeInstanceOf(TypeError);
    expect(backend.listAttempts).toBe(2); // no further attempt was spent to learn this
  });

  it('(i) a non-storage failure on the cold-start path is throttled too - not one listing per resolve()', async () => {
    const backend = new BrokenListBackend({ driveNumber: 2 });
    backend.breakList = true;
    let clock = 0;
    const index = new NameIndex(backend, 'Files/', {
      staleAfterMs: 1000,
      errorRetryAfterMs: 100,
      now: () => clock,
    });

    await expect(index.resolve('anything')).rejects.toBeInstanceOf(TypeError);
    await expect(index.resolve('anything')).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(index.resolve('anything')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(backend.listAttempts).toBe(1); // unbounded without this - one list() per call

    clock += 150; // past the retry window
    await expect(index.resolve('anything')).rejects.toBeInstanceOf(TypeError);
    expect(backend.listAttempts).toBe(2);
  });

  // --- An outage is per BACKEND: every area on one bucket shares one failure
  // gate, so N areas cost ONE attempt per window between them. ---

  it('(j) two areas on one down backend cost one listing attempt between them, not one each', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    let clock = 0;
    const gate = new BackendRetryGate({ errorRetryAfterMs: 100, now: () => clock });
    const files = new NameIndex(backend, 'Files/', { staleAfterMs: 1000, retryGate: gate, now: () => clock });
    const uploads = new NameIndex(backend, 'Uploads/', { staleAfterMs: 1000, retryGate: gate, now: () => clock });

    expect(await files.resolve('ghost.lha')).toBeNull(); // each primes its own prefix
    expect(await uploads.resolve('ghost.lha')).toBeNull();
    expect(backend.lists).toBe(2);

    clock += 1500; // both areas' listings have gone stale
    backend.down = true;

    // The first area to notice pays for the attempt and surfaces the real error.
    await expect(files.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    const requestsAfterFirstAttempt = backend.requests;

    // The second area must NOT re-learn the same fact at its own cost. One
    // bucket is down, not one prefix - with a gate per index this is where a
    // dozen conference areas each start their own 15-second retry cadence
    // against a 50,000-a-month ceiling.
    await expect(uploads.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(backend.requests).toBe(requestsAfterFirstAttempt);

    // And the cap is per window between them, not per area: one more attempt
    // once it rolls, whichever area happens to ask first.
    clock += 150;
    await expect(uploads.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(backend.requests).toBe(requestsAfterFirstAttempt + 1);
    await expect(files.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(backend.requests).toBe(requestsAfterFirstAttempt + 1);
  });

  it('(k) a success through one area releases every other area sharing the backend', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    let clock = 0;
    const gate = new BackendRetryGate({ errorRetryAfterMs: 100, now: () => clock });
    // Files/ re-checks its misses often; Uploads/ has a long miss-trust window,
    // so nothing it does below is its own listing - every answer it gives comes
    // from the gate it shares with Files/.
    const files = new NameIndex(backend, 'Files/', { staleAfterMs: 1000, retryGate: gate, now: () => clock });
    const uploads = new NameIndex(backend, 'Uploads/', { staleAfterMs: 1000000, retryGate: gate, now: () => clock });

    expect(await files.resolve('ghost.lha')).toBeNull();
    expect(await uploads.resolve('ghost.lha')).toBeNull();

    clock += 1500;
    backend.down = true;
    await expect(files.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);

    // Uploads/ own data is still well inside its trust window, so it makes no
    // attempt - but the backend is known down, and a miss must not answer
    // "no such file" on the strength of data it would not have re-checked.
    await expect(uploads.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    const requestsWhileDown = backend.requests;

    backend.down = false;
    clock += 150; // the retry window rolls

    // Files/ is the area that happens to look next, and its success is what
    // tells the whole backend it is healthy again.
    expect(await files.resolve('ghost.lha')).toBeNull();

    // Uploads/ answers immediately off the released gate - it neither waits
    // out a window of its own nor spends a request to find out.
    expect(await uploads.resolve('ghost.lha')).toBeNull();
    expect(backend.requests).toBe(requestsWhileDown + 1); // only Files/ re-listed
  });

  it('(l) an index built without a shared gate keeps its own - two of them cost two attempts', async () => {
    // The direct-construction path must not be forced through the registry,
    // and must not accidentally share state with anything else either.
    const backend = new FakeBackend({ driveNumber: 2 });
    backend.down = true;
    let clock = 0;
    const options = { staleAfterMs: 1000, errorRetryAfterMs: 100, now: () => clock };
    const files = new NameIndex(backend, 'Files/', options);
    const uploads = new NameIndex(backend, 'Uploads/', options);

    await expect(files.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(uploads.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(backend.requests).toBe(2); // its own gate each, as a lone index always had

    // And each throttles itself exactly as before.
    await expect(files.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(uploads.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(backend.requests).toBe(2);
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

describe('NameIndex.match', () => {
  /** The dialect download.handler uses for a filespec. */
  const wild = (pattern: string) => (name: string) =>
    new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(name);

  it('enumerates every key whose name the caller accepts', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/DEMO1.LHA', Buffer.from('x'));
    await backend.put('Files/DEMO2.LHA', Buffer.from('x'));
    await backend.put('Files/OTHER.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');

    expect((await index.match(wild('DEMO*.LHA'))).map(o => o.key)).toEqual([
      'Files/DEMO1.LHA',
      'Files/DEMO2.LHA',
    ]);
  });

  it('costs one listing, like resolve', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/A.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');

    await index.match(wild('*.LHA'));
    await index.match(wild('A*'));

    expect(backend.lists).toBe(1);
  });

  it('carries each object size, so a filespec can be printed without fetching', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/A.LHA', Buffer.from('1234567'));
    const index = new NameIndex(backend, 'Files/');

    const [found] = await index.match(wild('*.LHA'));

    expect(found.size).toBe(7);
    expect(backend.gets).toBe(0); // metadata only - no body was read
  });

  it('answers sizeOf for a resolved key, also without fetching', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/A.LHA', Buffer.from('1234567'));
    const index = new NameIndex(backend, 'Files/');

    const key = await index.resolve('a.lha');

    expect(index.sizeOf(key!)).toBe(7);
    expect(backend.gets).toBe(0);
  });

  it('takes the size given to note(), so a fresh upload prints its real size', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    const index = new NameIndex(backend, 'Files/');
    await index.match(wild('*.LHA'));
    index.note('Files/NEW.LHA', 42);

    expect((await index.match(wild('*.LHA')))[0].size).toBe(42);
  });

  it('forgets a size along with its key', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/A.LHA', Buffer.from('1234567'));
    const index = new NameIndex(backend, 'Files/');
    await index.match(wild('*.LHA'));

    index.forget('Files/A.LHA');

    expect(index.sizeOf('Files/A.LHA')).toBeUndefined();
  });

  it('is empty when the area holds nothing matching', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/A.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');

    expect(await index.match(wild('Z*.LHA'))).toEqual([]);
  });

  it('throws rather than answering empty when the volume is down', async () => {
    // An empty list during an outage reads to a caller as "the area holds
    // nothing" - the same lie a null resolve would be.
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/A.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/');
    backend.down = true;

    await expect(index.match(wild('*.LHA'))).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it('throws on a NON-empty result too, because a stale list may be short', async () => {
    // The quiet case: the listing succeeded once, the backend then failed, and
    // every match happens to be known. A plausible shorter set comes back with
    // nothing to say it is short - a set-shaped under-report, which is the
    // failure mode this whole subsystem exists to prevent.
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/A.LHA', Buffer.from('x'));
    const index = new NameIndex(backend, 'Files/', { staleAfterMs: 0 });
    expect((await index.match(wild('*.LHA'))).map(o => o.key)).toEqual(['Files/A.LHA']);

    backend.down = true;
    await expect(index.resolve('nope.lha')).rejects.toBeInstanceOf(StorageUnavailableError);

    await expect(index.match(wild('*.LHA'))).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it('sees an object noted after the listing', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    const index = new NameIndex(backend, 'Files/');
    await index.match(wild('*.LHA'));
    index.note('Files/NEW.LHA');

    expect((await index.match(wild('*.LHA'))).map(o => o.key)).toEqual(['Files/NEW.LHA']);
  });
});
