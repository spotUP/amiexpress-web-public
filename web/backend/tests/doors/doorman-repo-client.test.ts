/**
 * DOORMAN repo-client: talks to the central door-repo HTTP API
 * (web/backend/src/server/door-repo.routes.ts) from the door-manager door.
 * Two responsibilities:
 *
 *   fetchManifest()   GETs /api/door-repo/manifest with an ETag-based
 *                      conditional request (If-None-Match from a local
 *                      cache file). 200 -> persist {etag, cachedAt,
 *                      manifest} and return fresh; 304 -> return the
 *                      cached manifest; network/parse failure -> fall back
 *                      to the cache if one exists, else throw loudly (never
 *                      a silent empty manifest).
 *
 *   downloadArchive()  streams /api/door-repo/archive/:archiveName to a
 *                      caller-supplied destPath, then sha256-verifies the
 *                      written bytes against an expected digest (no md5
 *                      fallback). A mismatch deletes destPath and throws,
 *                      naming both digests; a partial file is never left
 *                      behind on any failure path.
 *
 * global fetch is mocked via jest.spyOn(globalThis, 'fetch') per the task
 * brief (Node's built-in fetch is a plain, configurable globalThis
 * property here, unlike swc's frozen per-module export getters that force
 * the jest.doMock workaround elsewhere in this test suite for `fs`/
 * checksums spies — see door-repo-routes.test.ts's comments on that).
 *
 * Cache-file path is ALWAYS supplied by the test (never guessed by the
 * module under test) per the brief.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import * as http from 'http';
import type { AddressInfo } from 'net';
import type { DoorRepoManifest } from '../../src/doors/door-repo-manifest';
import {
  fetchManifest,
  downloadArchive,
  type RepoClientConfig,
} from '../../../../Doors/door-manager/repo-client';
import { resolveDoorRepoMode } from '../../../../Doors/door-manager/repoDataSource';

function sampleManifest(revision: string): DoorRepoManifest {
  return {
    formatVersion: 1,
    revision,
    generatedAt: '2026-08-17T00:00:00.000Z',
    doors: [
      {
        archiveName: 'SOME_DOOR.LHA',
        doorType: 'XIM',
        name: 'Some Door',
        author: 'Someone',
        releaseGroup: null,
        category: 'Games',
        description: 'A test door',
        fileIdDiz: null,
        archiveSize: 1234,
        md5: 'deadbeef',
        sha256: 'cafebabe',
        junkCount: 0,
        hasDoc: false,
      },
    ],
  };
}

interface CacheFileShape {
  etag: string | null;
  cachedAt: string;
  manifest: DoorRepoManifest;
}

function fakeResponse(opts: {
  ok: boolean;
  status: number;
  etag?: string | null;
  jsonBody?: unknown;
  jsonThrows?: boolean;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'etag' ? opts.etag ?? null : null),
    },
    json: async () => {
      if (opts.jsonThrows) {
        throw new SyntaxError('Unexpected token in JSON');
      }
      return opts.jsonBody;
    },
  } as unknown as Response;
}

function bufferToWebStream(buf: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(buf));
      controller.close();
    },
  });
}

function fakeDownloadResponse(opts: { ok: boolean; status: number; body?: Buffer }): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    body: opts.body ? bufferToWebStream(opts.body) : null,
  } as unknown as Response;
}

// Real (not mocked) http.Server that accepts the TCP connection and the
// request but never writes a response -- the deterministic construction the
// task brief calls for to exercise the actual AbortSignal.timeout() wiring
// end to end, instead of only asserting on message text. manifestTimeoutMs/
// archiveTimeoutMs (RepoClientConfig test-only overrides) keep these tests
// fast: the suite never waits out the real 20s/120s production defaults.
function startStallingServer(): Promise<{ server: http.Server; url: string }> {
  return new Promise(resolve => {
    const server = http.createServer(() => {
      // Intentionally never calls res.write()/res.end() -- simulates a
      // hung or hostile DOOR_REPO_URL.
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise(resolve => server.close(() => resolve()));
}

describe('doorman repo-client', () => {
  let tmpDir: string;
  let cacheFile: string;
  let cfg: RepoClientConfig;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-repo-client-'));
    cacheFile = path.join(tmpDir, 'door-repo-cache.json');
    cfg = { url: 'http://repo.example.test', cacheFile };
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedCache(entry: CacheFileShape): void {
    fs.writeFileSync(cacheFile, JSON.stringify(entry), 'utf8');
  }

  describe('fetchManifest', () => {
    it('fresh 200: writes the cache file and returns fromCache:false', async () => {
      const manifest = sampleManifest('rev-fresh');
      fetchSpy.mockResolvedValue(
        fakeResponse({ ok: true, status: 200, etag: '"rev-fresh"', jsonBody: manifest })
      );

      const result = await fetchManifest(cfg);

      expect(result.fromCache).toBe(false);
      expect(result.manifest).toEqual(manifest);
      expect(typeof result.cachedAt).toBe('string');
      expect(result.cachedAt).not.toBeNull();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl] = fetchSpy.mock.calls[0]!;
      expect(calledUrl).toBe('http://repo.example.test/api/door-repo/manifest');

      const written = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as CacheFileShape;
      expect(written.etag).toBe('"rev-fresh"');
      expect(written.manifest).toEqual(manifest);
      expect(written.cachedAt).toBe(result.cachedAt);
    });

    it('does not send If-None-Match when no cache exists yet', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ ok: true, status: 200, etag: '"rev-1"', jsonBody: sampleManifest('rev-1') })
      );

      await fetchManifest(cfg);

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['If-None-Match']).toBeUndefined();
    });

    // Regression guard for the fix-round-2 defect (see repo-client.ts's
    // fetchManifest doc comment + task-5-report.md): Node's global fetch()
    // sends `Cache-Control: no-cache` on every outgoing request by default,
    // which the server correctly treats as "must revalidate", so it can
    // NEVER return 304 unless this header overrides that default. This is
    // a plain mocked-fetch unit test (fast suite) specifically so a future
    // regression -- e.g. someone "cleaning up" this header away -- is
    // caught here immediately, not only by the slower real-server E2E
    // suite (doorman-repo-e2e.test.ts) that originally found the bug.
    it('sends Cache-Control: max-age=0 on every manifest request (forces server-side revalidation instead of relying on Node fetch default no-cache)', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ ok: true, status: 200, etag: '"rev-1"', jsonBody: sampleManifest('rev-1') })
      );

      await fetchManifest(cfg);

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['Cache-Control']).toBe('max-age=0');
    });

    it('sends If-None-Match from the cached etag on a subsequent call', async () => {
      const cached = sampleManifest('rev-old');
      seedCache({ etag: '"rev-old"', cachedAt: '2020-01-01T00:00:00.000Z', manifest: cached });
      fetchSpy.mockResolvedValue(fakeResponse({ ok: false, status: 304 }));

      await fetchManifest(cfg);

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['If-None-Match']).toBe('"rev-old"');
    });

    it('304: returns the cached manifest with fromCache:true and its cachedAt', async () => {
      const cached = sampleManifest('rev-cached');
      seedCache({ etag: '"rev-cached"', cachedAt: '2020-01-01T00:00:00.000Z', manifest: cached });
      fetchSpy.mockResolvedValue(fakeResponse({ ok: false, status: 304 }));

      const result = await fetchManifest(cfg);

      expect(result.fromCache).toBe(true);
      expect(result.cachedAt).toBe('2020-01-01T00:00:00.000Z');
      expect(result.manifest).toEqual(cached);
    });

    it('network error with a cache present returns the cache', async () => {
      const cached = sampleManifest('rev-offline');
      seedCache({ etag: '"rev-offline"', cachedAt: '2021-06-06T00:00:00.000Z', manifest: cached });
      fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await fetchManifest(cfg);

      expect(result.fromCache).toBe(true);
      expect(result.cachedAt).toBe('2021-06-06T00:00:00.000Z');
      expect(result.manifest).toEqual(cached);
    });

    it('network error with NO cache throws', async () => {
      fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(fetchManifest(cfg)).rejects.toThrow();
    });

    it('corrupted-cache JSON is treated as no cache (network error still throws)', async () => {
      fs.writeFileSync(cacheFile, '{ this is not valid json ]]]', 'utf8');
      fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(fetchManifest(cfg)).rejects.toThrow();
    });

    it('JSON parse failure on the response falls back to cache when present', async () => {
      const cached = sampleManifest('rev-parseerr');
      seedCache({ etag: '"rev-parseerr"', cachedAt: '2022-02-02T00:00:00.000Z', manifest: cached });
      fetchSpy.mockResolvedValue(fakeResponse({ ok: true, status: 200, jsonThrows: true }));

      const result = await fetchManifest(cfg);

      expect(result.fromCache).toBe(true);
      expect(result.manifest).toEqual(cached);
    });

    // Defensive branch: the server only 304s in response to an
    // If-None-Match we sent from a cache we hold, so this should be
    // unreachable in practice -- but if the local cache file vanished
    // between building the header and the response landing (deleted mid-
    // flight, a genuine race), fetchManifest must still fail loudly
    // instead of silently returning an empty/undefined manifest.
    it('304 with NO local cache throws (server thinks we hold a matching revision but we do not)', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ ok: false, status: 304 }));

      await expect(fetchManifest(cfg)).rejects.toThrow();
    });

    // Distinct branch from the network-error case: fetch() resolved fine,
    // the server just responded with a non-2xx/non-304 status (e.g. a 500
    // from an overloaded repo host). Same "throw when no cache exists"
    // contract, but reached via response.ok === false rather than a
    // rejected fetch() promise.
    it('non-200/non-304 HTTP status (500) with NO cache throws', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ ok: false, status: 500 }));

      await expect(fetchManifest(cfg)).rejects.toThrow();
    });

    it('non-200/non-304 HTTP status (500) with a cache present falls back to the cache', async () => {
      const cached = sampleManifest('rev-500fallback');
      seedCache({ etag: '"rev-500fallback"', cachedAt: '2023-03-03T00:00:00.000Z', manifest: cached });
      fetchSpy.mockResolvedValue(fakeResponse({ ok: false, status: 500 }));

      const result = await fetchManifest(cfg);

      expect(result.fromCache).toBe(true);
      expect(result.cachedAt).toBe('2023-03-03T00:00:00.000Z');
      expect(result.manifest).toEqual(cached);
    });
  });

  describe('downloadArchive', () => {
    it('verifies sha256 and, on mismatch, deletes the file and throws naming both digests', async () => {
      const destPath = path.join(tmpDir, 'BAD_DOOR.LHA');
      const bytes = Buffer.from('these are not the bytes you expected');
      const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      const wrongExpected = 'f'.repeat(64);

      fetchSpy.mockResolvedValue(fakeDownloadResponse({ ok: true, status: 200, body: bytes }));

      await expect(
        downloadArchive(cfg, 'BAD_DOOR.LHA', destPath, wrongExpected)
      ).rejects.toThrow(new RegExp(`${wrongExpected}.*${actualSha256}|${actualSha256}.*${wrongExpected}`, 's'));

      expect(fs.existsSync(destPath)).toBe(false);
    });

    it('download success leaves the file with exact bytes', async () => {
      const destPath = path.join(tmpDir, 'GOOD_DOOR.LHA');
      const bytes = Buffer.from('the exact bytes of a real archive, byte for byte');
      const expectedSha256 = crypto.createHash('sha256').update(bytes).digest('hex');

      fetchSpy.mockResolvedValue(fakeDownloadResponse({ ok: true, status: 200, body: bytes }));

      await downloadArchive(cfg, 'GOOD_DOOR.LHA', destPath, expectedSha256);

      const written = fs.readFileSync(destPath);
      expect(Buffer.compare(written, bytes)).toBe(0);
    });

    it('rejects cleanly (does not crash the process) when destPath\'s parent directory does not exist', async () => {
      const destPath = path.join(tmpDir, 'no-such-subdir', 'GHOST_DOOR.LHA');
      const bytes = Buffer.from('irrelevant, the write will fail before verification');
      fetchSpy.mockResolvedValue(fakeDownloadResponse({ ok: true, status: 200, body: bytes }));

      await expect(downloadArchive(cfg, 'GHOST_DOOR.LHA', destPath, 'irrelevant')).rejects.toThrow();
      expect(fs.existsSync(destPath)).toBe(false);
    });

    it('requests the archive URL for the given archiveName', async () => {
      const destPath = path.join(tmpDir, 'URL_DOOR.LHA');
      const bytes = Buffer.from('x');
      const expectedSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      fetchSpy.mockResolvedValue(fakeDownloadResponse({ ok: true, status: 200, body: bytes }));

      await downloadArchive(cfg, 'URL_DOOR.LHA', destPath, expectedSha256);

      const [calledUrl] = fetchSpy.mock.calls[0]!;
      expect(calledUrl).toBe('http://repo.example.test/api/door-repo/archive/URL_DOOR.LHA');
    });
  });

  // I4: no request timeout anywhere in the repo client. A hung/slow/hostile
  // DOOR_REPO_URL used to have no real bound (undici's own ~300s
  // header/body timeouts are reset by a slow-drip server on every chunk),
  // and app.ts's install handler only clears `this.installing` once the
  // downloadArchive() call settles -- so a hung download locked the install
  // action for the rest of the DOORMAN session. These tests use a real,
  // deliberately-stalling http.Server (never mocked fetch) with a short
  // injected manifestTimeoutMs/archiveTimeoutMs so the actual
  // AbortSignal.timeout() wiring is proven, not just the message text, and
  // the suite still runs in well under a second.
  describe('request timeouts (I4)', () => {
    it('fetchManifest: a server that never responds rejects with a timeout-specific message, distinct from a generic network-error message, within the injected bound', async () => {
      const { server, url } = await startStallingServer();
      try {
        const stallCfg: RepoClientConfig = { url, cacheFile, manifestTimeoutMs: 200 };
        const started = Date.now();
        await expect(fetchManifest(stallCfg)).rejects.toThrow(/timed out after 0\.2s/);
        expect(Date.now() - started).toBeLessThan(5000);
      } finally {
        await closeServer(server);
      }
    });

    it('fetchManifest: a server that never responds falls back to the cache when one exists, instead of throwing', async () => {
      const cached = sampleManifest('rev-stall-cache');
      seedCache({ etag: '"rev-stall-cache"', cachedAt: '2024-04-04T00:00:00.000Z', manifest: cached });
      const { server, url } = await startStallingServer();
      try {
        const stallCfg: RepoClientConfig = { url, cacheFile, manifestTimeoutMs: 200 };
        const result = await fetchManifest(stallCfg);
        expect(result.fromCache).toBe(true);
        expect(result.cachedAt).toBe('2024-04-04T00:00:00.000Z');
        expect(result.manifest).toEqual(cached);
      } finally {
        await closeServer(server);
      }
    });

    it('downloadArchive: a server that never responds aborts with a timeout-specific message and leaves NO partial file on disk', async () => {
      const { server, url } = await startStallingServer();
      const destPath = path.join(tmpDir, 'STALLED_DOOR.LHA');
      try {
        const stallCfg: RepoClientConfig = { url, cacheFile, archiveTimeoutMs: 200 };
        const started = Date.now();
        await expect(
          downloadArchive(stallCfg, 'STALLED_DOOR.LHA', destPath, 'irrelevant')
        ).rejects.toThrow(/timed out after 0\.2s/);
        expect(Date.now() - started).toBeLessThan(5000);
        expect(fs.existsSync(destPath)).toBe(false);
      } finally {
        await closeServer(server);
      }
    });
  });
});

// ─── Minor finding: trailing-slash base URL + error text names the URL ────

describe('resolveDoorRepoMode base URL normalization', () => {
  it('strips a trailing slash from DOOR_REPO_URL', () => {
    expect(resolveDoorRepoMode({ DOOR_REPO_URL: 'http://repo.example.test/' })).toEqual({
      kind: 'consumer',
      url: 'http://repo.example.test',
      learnKey: null,
    });
  });

  it('strips multiple trailing slashes from DOOR_REPO_URL', () => {
    expect(resolveDoorRepoMode({ DOOR_REPO_URL: 'http://repo.example.test///' })).toEqual({
      kind: 'consumer',
      url: 'http://repo.example.test',
      learnKey: null,
    });
  });

  it('leaves a URL with no trailing slash unchanged', () => {
    expect(resolveDoorRepoMode({ DOOR_REPO_URL: 'http://repo.example.test' })).toEqual({
      kind: 'consumer',
      url: 'http://repo.example.test',
      learnKey: null,
    });
  });
});

describe('doorman repo-client: URL construction + error text', () => {
  let tmpDir: string;
  let cacheFile: string;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-repo-client-url-'));
    cacheFile = path.join(tmpDir, 'door-repo-cache.json');
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('a trailing-slash DOOR_REPO_URL, once normalized by resolveDoorRepoMode, produces a correctly-joined manifest request URL (no double slash)', async () => {
    const mode = resolveDoorRepoMode({ DOOR_REPO_URL: 'http://repo.example.test/' });
    if (mode.kind !== 'consumer') throw new Error('expected consumer mode');
    const cfg: RepoClientConfig = { url: mode.url, cacheFile };

    fetchSpy.mockResolvedValue(
      fakeResponse({ ok: true, status: 200, etag: '"rev-1"', jsonBody: sampleManifest('rev-1') })
    );

    await fetchManifest(cfg);

    const [calledUrl] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe('http://repo.example.test/api/door-repo/manifest');
  });

  it('a non-2xx manifest response with no cache reports the attempted URL in the error text (not just the cache file path)', async () => {
    const cfg: RepoClientConfig = { url: 'http://repo.example.test', cacheFile };
    fetchSpy.mockResolvedValue(fakeResponse({ ok: false, status: 500 }));

    await expect(fetchManifest(cfg)).rejects.toThrow('http://repo.example.test/api/door-repo/manifest');
  });
});
