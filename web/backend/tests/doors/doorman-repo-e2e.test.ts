/**
 * doorman-repo-e2e: end-to-end consumer flow against a REAL, locally-started
 * HTTP server — Task 10 of the door-repo API plan, repointed for the
 * door-repo phase-2 split (Task 3 fix round 1).
 *
 * Before the split, this test bound the REAL client (Doors/door-manager/
 * repo-client.ts: fetchManifest/downloadArchive) directly to the REAL
 * sqlite-backed doorRepoRouter, both over a real socket, no mocks on either
 * side. That sqlite-backed router no longer exists — door-repo.routes.ts is
 * now a byte-exact proxy to DOOR_SERVER_URL (the standalone door server).
 *
 * So this test now wires THREE real pieces instead of two:
 *
 *   repo-client.ts  --http-->  the real BBS app (src/server/app.ts),
 *                               DOOR_SERVER_URL pointed at...
 *                     --http-->  a small stub Express server that serves
 *                               what the old local router used to serve
 *                               (a manifest + one real archive on disk).
 *
 * This is STRICTLY BETTER coverage than the pre-split version: it now also
 * exercises door-repo.routes.ts's proxy — real Content-Length framing,
 * real ETag/If-None-Match forwarding and the 304 short-circuit, and real
 * archive-byte streaming — all through the same code path a real DOORMAN
 * install talks to in production, not just the client library against a
 * server that no longer exists.
 *
 * The stub's manifest/archive routes are deliberately hand-rolled JSON/
 * bytes (not door-repo-manifest.ts's buildManifest()) — this suite proves
 * the CLIENT<->PROXY<->UPSTREAM round trip, not the standalone door
 * server's own catalog logic, which is that project's own test suite's
 * job.
 *
 * Requires a fresh require() of src/server/app.ts (the mount decision runs
 * once at module-load time) via jest.resetModules() + process.env
 * manipulation, same pattern as tests/server/door-repo-mount.test.ts.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import express, { Express } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import type { RepoClientConfig } from '../../../../Doors/door-manager/repo-client';
import type { DoorRepoManifest } from '../../../../Doors/door-manager/repo-types.generated';

describe('doorman repo-client E2E against the real proxy and a stub upstream', () => {
  let tmpDir: string;
  let stubServer: Server;
  let bbsServer: Server;
  let baseUrl: string; // the BBS app — what the client is configured with
  let realArchiveContent: Buffer;
  const ORIGINAL_ENV = { ...process.env };
  const REVISION = 'e2e-rev-1';

  // Real fetchManifest/downloadArchive — loaded via jest.resetModules() +
  // require() alongside the BBS app below so both sides of the flow come
  // from the SAME require pass (avoids any stale-module surprises from
  // resetModules() being called elsewhere in the suite run).
  let fetchManifest: typeof import('../../../../Doors/door-manager/repo-client').fetchManifest;
  let downloadArchive: typeof import('../../../../Doors/door-manager/repo-client').downloadArchive;

  beforeAll(async () => {
    jest.resetModules();

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-repo-e2e-'));

    realArchiveContent = Buffer.from(
      'door-repo-e2e-test-archive-contents\r\nreal bytes for real checksum verification\r\n' +
        crypto.randomBytes(64).toString('hex')
    );

    const manifest: DoorRepoManifest = {
      formatVersion: 1,
      revision: REVISION,
      generatedAt: new Date().toISOString(),
      doors: [
        // The real archive fetched/downloaded below.
        {
          archiveName: 'E2E_REAL_DOOR.LHA',
          doorType: 'XIM',
          name: 'E2E Real Door',
          author: 'E2E Author',
          releaseGroup: 'E2EGroup',
          category: 'Games',
          description: 'A real archive on disk for the e2e flow',
          fileIdDiz: 'E2E file_id.diz',
          archiveSize: realArchiveContent.length,
          md5: crypto.createHash('md5').update(realArchiveContent).digest('hex'),
          sha256: crypto.createHash('sha256').update(realArchiveContent).digest('hex'),
          junkCount: 0,
          hasDoc: false,
        },
        // A catalog entry whose archive was never written to disk — just
        // proves the manifest round-trips a mixed catalog; not otherwise
        // exercised.
        {
          archiveName: 'E2E_MISSING_DOOR.LHA',
          doorType: 'DD',
          name: 'E2E Missing Door',
          author: null,
          releaseGroup: null,
          category: 'Utils',
          description: 'A door whose archive is absent',
          fileIdDiz: null,
          archiveSize: 999,
          md5: null,
          sha256: null,
          junkCount: 0,
          hasDoc: false,
        },
      ],
    };

    // ─── Stub upstream: what the standalone door server would answer ────
    const stub = express();
    stub.get('/api/door-repo/manifest', (req, res) => {
      res.set('ETag', `"${REVISION}"`);
      res.set('X-Door-Repo-Revision', REVISION);
      if (req.headers['if-none-match'] === `"${REVISION}"`) {
        res.status(304).end();
        return;
      }
      res.json(manifest);
    });
    stub.get('/api/door-repo/archive/:name', (req, res) => {
      if (req.params.name === 'E2E_REAL_DOOR.LHA') {
        res.set('Content-Type', 'application/octet-stream');
        res.send(realArchiveContent);
        return;
      }
      res.status(404).set('Content-Type', 'text/plain').send(`NOT FOUND: ${req.params.name}\r\n`);
    });

    await new Promise<void>((resolve, reject) => {
      stubServer = stub.listen(0, '127.0.0.1', () => resolve());
      stubServer.once('error', reject);
    });
    const stubUrl = `http://127.0.0.1:${(stubServer.address() as AddressInfo).port}`;

    // ─── The real BBS app, proxying to the stub above ────────────────────
    process.env.DOOR_SERVER_URL = stubUrl;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('../../src/server/app') as { app: Express };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const repoClient = require('../../../../Doors/door-manager/repo-client') as typeof import('../../../../Doors/door-manager/repo-client');
    fetchManifest = repoClient.fetchManifest;
    downloadArchive = repoClient.downloadArchive;

    await new Promise<void>((resolve, reject) => {
      bbsServer = app.listen(0, '127.0.0.1', () => resolve());
      bbsServer.once('error', reject);
    });
    baseUrl = `http://127.0.0.1:${(bbsServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      bbsServer.close((err) => (err ? reject(err) : resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      stubServer.close((err) => (err ? reject(err) : resolve()));
    });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function freshClientConfig(cacheFileName: string): RepoClientConfig {
    return { url: baseUrl, cacheFile: path.join(tmpDir, cacheFileName) };
  }

  it('fetchManifest: a fresh request returns fromCache:false and persists the cache to disk', async () => {
    const cfg = freshClientConfig('cache-fresh.json');

    const result = await fetchManifest(cfg);

    expect(result.fromCache).toBe(false);
    expect(result.manifest.formatVersion).toBe(1);
    expect(result.manifest.doors).toHaveLength(2);
    const door = result.manifest.doors.find((d) => d.archiveName === 'E2E_REAL_DOOR.LHA');
    expect(door).toBeDefined();
    expect(door!.sha256).toBe(crypto.createHash('sha256').update(realArchiveContent).digest('hex'));
    expect(door!.md5).toBe(crypto.createHash('md5').update(realArchiveContent).digest('hex'));

    expect(fs.existsSync(cfg.cacheFile)).toBe(true);
    const cached = JSON.parse(fs.readFileSync(cfg.cacheFile, 'utf8')) as { etag: string; manifest: unknown };
    expect(cached.etag).toBeTruthy();
    expect(cached.manifest).toEqual(result.manifest);
  });

  // repo-client.ts's fetchManifest() sends an explicit `Cache-Control:
  // max-age=0` request header (see its own inline comment for why, and
  // task-5-report.md's fix-round-2 section for the root-cause analysis of
  // why that was needed at all: Node's fetch() otherwise sends
  // `Cache-Control: no-cache` on every request by default, which a
  // correct RFC 9111 server treats as "never 304"). The BBS proxy does not
  // forward Cache-Control upstream at all (door-repo.routes.ts's
  // FORWARDED_REQUEST_HEADERS), so the stub above only ever sees
  // If-None-Match — simpler than the original sqlite router's
  // `req.fresh`-based check, but exercises the same client-visible
  // contract: a matching If-None-Match gets a 304.
  it('fetchManifest: a refetch through the real client sends If-None-Match, reaches the proxied 304 path, and returns fromCache:true', async () => {
    const cfg = freshClientConfig('cache-304.json');

    const first = await fetchManifest(cfg);
    expect(first.fromCache).toBe(false);
    const persistedEtag = (JSON.parse(fs.readFileSync(cfg.cacheFile, 'utf8')) as { etag: string }).etag;
    expect(persistedEtag).toBeTruthy();

    // A second call through the SAME unmodified fetchManifest() now comes
    // back fromCache:true -- the real, intended end-to-end behavior.
    const second = await fetchManifest(cfg);
    expect(second.fromCache).toBe(true);
    expect(second.cachedAt).toBe(first.cachedAt);
    expect(second.manifest).toEqual(first.manifest);

    // Independent confirmation the PROXY forwards a 304 unchanged (already
    // unit-tested in door-repo-proxy.test.ts; re-verified here end-to-end
    // through the real BBS app and a real stub upstream): a raw fetch of
    // the exact same URL with the exact same If-None-Match value, using
    // `cache: 'force-cache'` to suppress undici's default Cache-Control
    // injection, DOES get a real 304 back through the real proxy.
    const manifestUrl = `${baseUrl}/api/door-repo/manifest`;
    const rawConditional = await fetch(manifestUrl, {
      headers: { 'If-None-Match': persistedEtag },
      cache: 'force-cache',
    });
    expect(rawConditional.status).toBe(304);
  });

  it('downloadArchive: downloads the real archive through the proxy and verifies it against the manifest sha256', async () => {
    const cfg = freshClientConfig('cache-download.json');
    const manifestResult = await fetchManifest(cfg);
    const door = manifestResult.manifest.doors.find((d) => d.archiveName === 'E2E_REAL_DOOR.LHA');
    expect(door).toBeDefined();
    expect(door!.sha256).toBeTruthy();

    const destPath = path.join(tmpDir, 'downloaded-real-door.lha');

    await downloadArchive(cfg, 'E2E_REAL_DOOR.LHA', destPath, door!.sha256!);

    expect(fs.existsSync(destPath)).toBe(true);
    const written = fs.readFileSync(destPath);
    expect(Buffer.compare(written, realArchiveContent)).toBe(0);

    fs.rmSync(destPath, { force: true });
  });

  it('downloadArchive: a deliberately wrong expected sha256 throws naming both digests and leaves no file behind', async () => {
    const cfg = freshClientConfig('cache-corrupt.json');
    const manifestResult = await fetchManifest(cfg);
    const door = manifestResult.manifest.doors.find((d) => d.archiveName === 'E2E_REAL_DOOR.LHA');
    expect(door).toBeDefined();
    const actualSha256 = door!.sha256!;
    const wrongExpected = 'f'.repeat(64);
    expect(wrongExpected).not.toBe(actualSha256);

    const destPath = path.join(tmpDir, 'corrupted-real-door.lha');

    await expect(
      downloadArchive(cfg, 'E2E_REAL_DOOR.LHA', destPath, wrongExpected)
    ).rejects.toThrow(new RegExp(`${wrongExpected}.*${actualSha256}|${actualSha256}.*${wrongExpected}`, 's'));

    expect(fs.existsSync(destPath)).toBe(false);
  });
});
