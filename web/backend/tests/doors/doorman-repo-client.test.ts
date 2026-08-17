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
import type { DoorRepoManifest } from '../../src/doors/door-repo-manifest';
import {
  fetchManifest,
  downloadArchive,
  type RepoClientConfig,
} from '../../../../Doors/door-manager/repo-client';

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
});
