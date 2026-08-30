"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchManifest = fetchManifest;
exports.downloadArchive = downloadArchive;
exports.learnPattern = learnPattern;
exports.fetchDoorDetail = fetchDoorDetail;
/**
 * repo-client: DOORMAN-side HTTP client for the central door-repo API
 * (web/backend/src/server/door-repo.routes.ts).
 *
 * Two operations:
 *
 *   fetchManifest()   GET /api/door-repo/manifest with an ETag-based
 *                      conditional request. The API's ETag is a strong
 *                      validator equal to its repo revision string (see
 *                      door-repo.routes.ts) and every response also
 *                      confirms it via the X-Door-Repo-Revision header, but
 *                      this client tracks state purely via the standard
 *                      ETag/If-None-Match pair so it works unmodified
 *                      against any RFC 7232-conformant server:
 *                        200 -> persist {etag, cachedAt, manifest} as JSON
 *                               to cfg.cacheFile, return fresh
 *                               (fromCache:false).
 *                        304 -> return the cached manifest (fromCache:true).
 *                        network error / bad JSON -> fall back to the
 *                               cache if a usable one exists
 *                               (fromCache:true); otherwise throw loudly.
 *                               A door-repo client must never silently
 *                               hand DOORMAN an empty catalog.
 *                      Sends `Cache-Control: max-age=0` on every request --
 *                      Node's fetch() otherwise adds `Cache-Control: no-cache`
 *                      by default, which the server correctly treats as
 *                      "never 304", permanently defeating the ETag mechanism
 *                      (see fetchManifest's own inline comment for the full
 *                      analysis and why max-age=0 was chosen over
 *                      `cache: 'force-cache'`).
 *
 *   downloadArchive()  GET /api/door-repo/archive/:archiveName, streaming
 *                      the response body straight to destPath while
 *                      hashing it, then verifying the digest against
 *                      expectedSha256 (no md5 fallback — sha256 is the
 *                      strong, collision-resistant digest and is all this
 *                      client trusts). A checksum mismatch deletes
 *                      destPath and throws, naming both digests. A partial
 *                      file is never left behind on any failure path
 *                      (network error, non-2xx response, mid-stream
 *                      failure, or checksum mismatch all clean up).
 *
 * Cache-file path is ALWAYS supplied by the caller via
 * RepoClientConfig.cacheFile — this module never guesses or derives a
 * path itself (Task 6 passes `<resolveBbsRoot()>/door-repo-cache.json`).
 *
 * Manifest typing comes from repo-types.generated.ts, a GENERATED mirror
 * of the ManifestDoor / DoorRepoManifest interfaces owned by the standalone
 * door server's contract (amiexpress-doorserver/contract/manifest-types.ts —
 * that repo is now the single source of truth for the shape both the server
 * and this client agree on, not web/backend). Doors/door-manager and that
 * contract live in separate checkouts, so this is a committed mirror rather
 * than a cross-repo import; web/backend/tests/doors/contract-mirror-staleness.test.ts
 * fails loudly if this mirror drifts from the door server's contract
 * whenever that checkout is present alongside this one. Regenerate with
 * `npx tsx scripts/gen-contract-types.ts <path-to-this-file>` from the
 * amiexpress-doorserver checkout whenever its contract shape changes.
 */
const fs = __importStar(require("fs"));
const crypto = __importStar(require("crypto"));
const stream_1 = require("stream");
// ─── Request timeouts ───────────────────────────────────────────────────
//
// Neither call had any AbortSignal before this fix, so a slow/hung/hostile
// DOOR_REPO_URL had no real bound: undici's own header/body timeouts sit
// around ~300s each, AND a slow-drip server (a few bytes every few seconds)
// resets the body timer on every chunk, so they never fire. Worse, app.ts's
// install handler sets `this.installing = true` before calling
// downloadArchive and only clears it in a `finally` once the call settles —
// with no bound on that call, a hung archive download locks the install
// action for the rest of the DOORMAN session with no visible cause.
//
// MANIFEST_TIMEOUT_MS (20s): the manifest is a single small JSON payload
// (door-repo.routes.ts serves it straight from the repo's manifest.json,
// no per-request archive I/O) -- a healthy server answers in well under a
// second. 20s sits inside the brief's 15-30s band: long enough to absorb a
// loaded/cold-starting server without a false timeout, short enough that
// the browse view's "Loading central door-repo catalog..." never reads as
// hung to the sysop.
//
// ARCHIVE_TIMEOUT_MS (120s): archives in this repo run to a few MB (see
// repo-client.ts's own doc comment above). This client runs on the BBS
// host, not over dial-up, so the constraint is "central repo is slow or
// half-dead," not link speed. Even at a deliberately pessimistic 50 KB/s
// (a saturated/throttled shared host), a 5 MB archive finishes in ~100s;
// 120s leaves headroom above that while still giving a hung install a firm,
// user-visible bound instead of undici's ~300s soft ceiling.
const MANIFEST_TIMEOUT_MS = 20000;
const ARCHIVE_TIMEOUT_MS = 120000;
// Deliberately NOT `err instanceof Error`: AbortSignal.timeout() rejects
// with a DOMException, and across a VM-sandboxed realm boundary (observed
// under Jest's testEnvironment: 'node', which runs each test file in its
// own vm context) `instanceof` can fail even though `.name` reads back
// correctly -- the DOMException was constructed against a different
// realm's Error/DOMException prototype chain than the one this check runs
// against. Reading `.name` as a plain property sidesteps that entirely.
function isTimeoutError(err) {
    return typeof err === 'object' && err !== null && 'name' in err && err.name === 'TimeoutError';
}
// ─── Cache file I/O ─────────────────────────────────────────────────────
//
// Corrupted/unreadable cache -> treated as "no cache" everywhere (never a
// half-trusted partial read): a missing file, a JSON parse failure, or a
// parsed value missing the fields this client needs are all folded into
// the same `null` return so every call site has exactly one fallback path.
function readCache(cacheFile) {
    let raw;
    try {
        raw = fs.readFileSync(cacheFile, 'utf8');
    }
    catch {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.manifest || typeof parsed.cachedAt !== 'string') {
            return null;
        }
        return {
            etag: typeof parsed.etag === 'string' ? parsed.etag : null,
            cachedAt: parsed.cachedAt,
            manifest: parsed.manifest,
        };
    }
    catch {
        return null;
    }
}
function writeCache(cacheFile, entry) {
    fs.writeFileSync(cacheFile, JSON.stringify(entry), 'utf8');
}
function cachedResult(cached) {
    return { manifest: cached.manifest, fromCache: true, cachedAt: cached.cachedAt };
}
// ─── fetchManifest ──────────────────────────────────────────────────────
async function fetchManifest(cfg) {
    const cached = readCache(cfg.cacheFile);
    const manifestUrl = `${cfg.url}/api/door-repo/manifest`;
    const timeoutMs = cfg.manifestTimeoutMs ?? MANIFEST_TIMEOUT_MS;
    // 'Cache-Control': 'max-age=0' forces revalidation on every request --
    // required because Node's global fetch() (undici) sends
    // `Cache-Control: no-cache` + `Pragma: no-cache` on EVERY outgoing
    // request by default, with no way to opt out short of overriding
    // Cache-Control ourselves. door-repo.routes.ts correctly (RFC 9111
    // s5.2.1.4) treats an incoming `no-cache` as "must revalidate end to
    // end", so it can NEVER return 304 to an unmodified fetch() call --
    // silently defeating the whole point of sending If-None-Match (found by
    // Task 10's real-client/real-server E2E test; see task-5-report.md's
    // fix-round-2 section for the full root-cause analysis and the options
    // considered).
    //
    // `max-age=0` says "revalidate before using anything older than 0
    // seconds" -- combined with If-None-Match below, that IS a standard
    // conditional-revalidation request, so door-repo.routes.ts's 304 branch
    // runs normally. Chosen over `cache: 'force-cache'` (the other option
    // confirmed to suppress the no-cache header): force-cache's Fetch-spec
    // semantics are "serve from a local cache without asking the server if
    // something fresh is cached" -- undici doesn't implement a real cache
    // store today, so in PRACTICE it always hits the network (verified with
    // a standalone probe: a server declaring `Cache-Control: max-age=3600`
    // still saw every repeated fetch() reach it), but relying on that is
    // relying on an implementation gap, not a guarantee -- a future undici
    // version implementing real caching for force-cache would then silently
    // serve a stale manifest with no revalidation, the exact failure mode
    // this module must never allow. `max-age=0` has no such risk: its
    // documented meaning IS "must revalidate", independent of whether the
    // client ever grows a real cache. Undici still tacks on
    // `Pragma: no-cache` alongside our Cache-Control override, but the
    // `fresh` npm module backing Express's `req.fresh` (what
    // door-repo.routes.ts uses) only inspects `cache-control`, never
    // `pragma` (confirmed by reading its source) -- harmless.
    const headers = { 'Cache-Control': 'max-age=0' };
    if (cached?.etag) {
        headers['If-None-Match'] = cached.etag;
    }
    let response;
    try {
        response = await fetch(manifestUrl, { headers, signal: AbortSignal.timeout(timeoutMs) });
    }
    catch (err) {
        if (cached) {
            return cachedResult(cached);
        }
        if (isTimeoutError(err)) {
            // Distinct, own-worded failure -- a sysop seeing this should read
            // "the repo is slow/unreachable," not confuse it with a checksum
            // mismatch or a 404, so this is never folded into the generic
            // network-error message below.
            throw new Error(`DOOR REPO: manifest fetch to ${manifestUrl} timed out after ${timeoutMs / 1000}s ` +
                `and no cache exists at ${cfg.cacheFile}`);
        }
        throw new Error(`DOOR REPO: manifest fetch to ${manifestUrl} failed (${err.message}) and no cache exists at ${cfg.cacheFile}`);
    }
    if (response.status === 304) {
        if (cached) {
            return cachedResult(cached);
        }
        // Server thinks we hold a matching revision but we have no local
        // cache to serve — a stale/foreign cache file was deleted out from
        // under us. Loud failure, not a silently empty manifest.
        throw new Error(`DOOR REPO: server returned 304 Not Modified for ${manifestUrl} but no local cache exists at ${cfg.cacheFile}`);
    }
    if (!response.ok) {
        if (cached) {
            return cachedResult(cached);
        }
        throw new Error(`DOOR REPO: manifest fetch to ${manifestUrl} returned HTTP ${response.status} and no cache exists at ${cfg.cacheFile}`);
    }
    let manifest;
    try {
        manifest = (await response.json());
    }
    catch (err) {
        if (cached) {
            return cachedResult(cached);
        }
        throw new Error(`DOOR REPO: manifest response from ${manifestUrl} was not valid JSON (${err.message}) and no cache exists at ${cfg.cacheFile}`);
    }
    const etag = response.headers.get('etag');
    const cachedAt = new Date().toISOString();
    writeCache(cfg.cacheFile, { etag, cachedAt, manifest });
    return { manifest, fromCache: false, cachedAt };
}
// ─── downloadArchive ────────────────────────────────────────────────────
//
// Streams straight to destPath while hashing (no full-buffer-in-memory
// step), verifies afterward, and always leaves destPath either absent or
// byte-exact — never a half-written file. `for await...of` on the Node
// Readable is used (rather than attaching a 'data' listener before an
// independent pipeline()/pipe() call) specifically to avoid the flowing-
// mode race where a 'data' listener switches the stream to flowing before
// a separate consumer attaches, silently dropping the chunks emitted in
// between.
//
// NOT affected by fetchManifest's Cache-Control/no-cache defect: this
// function sends no If-None-Match, no conditional headers of any kind, and
// GET /api/door-repo/archive/:archiveName (door-repo.routes.ts) has no
// ETag/conditional-GET logic at all -- it always streams the current file
// with a fresh Content-Length/checksums on every request, unconditionally.
// Node's default `Cache-Control: no-cache` on the outgoing request is
// simply never inspected by that handler, so there is nothing here for the
// undici-default-header issue to interact with, correctly or incorrectly.
// Checked explicitly (not assumed) when fixing fetchManifest above.
function safeUnlink(destPath) {
    try {
        fs.unlinkSync(destPath);
    }
    catch {
        // Never existed, or already removed — nothing to clean up.
    }
}
async function downloadArchive(cfg, archiveName, destPath, expectedSha256) {
    const archiveUrl = `${cfg.url}/api/door-repo/archive/${encodeURIComponent(archiveName)}`;
    const timeoutMs = cfg.archiveTimeoutMs ?? ARCHIVE_TIMEOUT_MS;
    // AbortSignal.timeout(timeoutMs) bounds BOTH the initial request
    // and body streaming: per the fetch spec (confirmed against Node's undici
    // with a slow-drip probe server), a signal passed to fetch() stays
    // attached to the returned Response and aborts an in-progress body read
    // too, so a server that sends headers then stalls mid-stream is caught
    // here just like one that never responds at all -- there is no separate
    // "resets the timer on every chunk" gap the way undici's own body timeout
    // has.
    const archiveSignal = AbortSignal.timeout(timeoutMs);
    let response;
    try {
        response = await fetch(archiveUrl, { signal: archiveSignal });
    }
    catch (err) {
        if (isTimeoutError(err)) {
            throw new Error(`DOOR REPO: archive download for ${archiveName} timed out after ${timeoutMs / 1000}s (${archiveUrl})`);
        }
        throw new Error(`DOOR REPO: archive download failed for ${archiveName} (${archiveUrl}): ${err.message}`);
    }
    if (!response.ok || !response.body) {
        throw new Error(`DOOR REPO: archive download failed for ${archiveName} (${archiveUrl}): HTTP ${response.status}`);
    }
    const hash = crypto.createHash('sha256');
    const nodeStream = stream_1.Readable.fromWeb(response.body);
    const fileStream = fs.createWriteStream(destPath);
    try {
        // fileStream.on('error', ...) is attached for the FULL duration of the
        // transfer (not just while awaiting backpressure) so an async write
        // failure that fires between chunks -- e.g. ENOENT because destPath's
        // parent directory doesn't exist, EACCES, ENOSPC -- is caught here and
        // converted into a promise rejection. Without a permanent listener, a
        // WriteStream 'error' event with no listener throws inside Node's
        // EventEmitter machinery and crashes the process instead of failing
        // just this download.
        await new Promise((resolve, reject) => {
            let settled = false;
            const fail = (err) => {
                if (settled)
                    return;
                settled = true;
                fileStream.destroy();
                reject(err);
            };
            fileStream.on('error', fail);
            (async () => {
                for await (const chunk of nodeStream) {
                    const buf = chunk;
                    hash.update(buf);
                    if (!fileStream.write(buf)) {
                        await new Promise((res, rej) => {
                            fileStream.once('drain', res);
                            fileStream.once('error', rej);
                        });
                    }
                }
                fileStream.end(() => {
                    if (!settled) {
                        settled = true;
                        resolve();
                    }
                });
            })().catch(fail);
        });
    }
    catch (err) {
        safeUnlink(destPath);
        if (isTimeoutError(err)) {
            // Mid-stream abort: the same AbortSignal that bounds the initial
            // request also cuts off a stalled body read (see the comment above
            // the fetch() call), so a slow-drip server that starts sending then
            // stops gets the same clearly-worded timeout failure -- and the
            // partial file it left behind is still removed, same as every other
            // failure path here.
            throw new Error(`DOOR REPO: archive download for ${archiveName} timed out after ${timeoutMs / 1000}s (${archiveUrl})`);
        }
        throw new Error(`DOOR REPO: archive download failed for ${archiveName} (${archiveUrl}): ${err.message}`);
    }
    const actualSha256 = hash.digest('hex');
    if (actualSha256 !== expectedSha256) {
        safeUnlink(destPath);
        throw new Error(`DOOR REPO: CHECKSUM MISMATCH for ${archiveName}: expected sha256 ${expectedSha256}, got ${actualSha256}`);
    }
}
// ─── learnPattern ────────────────────────────────────────────────────
/**
 * Teach the central classifier a new junk pattern. Used by DOORMAN's
 * StripView when the sysop marks a file as ad/junk that the classifier
 * missed. The pattern is an exact filename glob (e.g. "7hE-EdGE.nfo").
 *
 * Requires DOORREPO_LEARN_KEY to be set on the doorserver; silently
 * succeeds (returns { ok: false }) when the server has no learn key
 * configured, so DOORMAN never blocks on a server that does not opt in.
 */
async function learnPattern(cfg, pattern, learnKey, archiveName, filePath) {
    if (!learnKey)
        return { ok: false };
    const url = `${cfg.url}/api/door-repo/learn`;
    const body = { pattern };
    if (archiveName)
        body.archiveName = archiveName;
    if (filePath)
        body.filePath = filePath;
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Learn-Key': learnKey,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        });
    }
    catch {
        return { ok: false };
    }
    if (!response.ok) {
        return { ok: false };
    }
    try {
        return (await response.json());
    }
    catch {
        return { ok: false };
    }
}
const DETAIL_TIMEOUT_MS = 15000;
function str(value) {
    return typeof value === 'string' && value.length > 0 ? value : null;
}
/** Everything the repo knows about one archive, or null when the server has
 *  no such row, cannot be reached, or answers with something that is not
 *  this shape. Never throws: every caller is a UI action that must degrade
 *  to "the repo could not tell us", not take the door down. */
async function fetchDoorDetail(cfg, archiveName) {
    const url = `${cfg.url}/api/door-repo/doors/${encodeURIComponent(archiveName)}`;
    let response;
    try {
        response = await fetch(url, {
            headers: { 'Cache-Control': 'max-age=0' },
            signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
        });
    }
    catch {
        return null;
    }
    if (!response.ok)
        return null;
    let body;
    try {
        body = await response.json();
    }
    catch {
        return null;
    }
    if (!body || typeof body !== 'object')
        return null;
    const row = body;
    // A 200 that is not a door row (a proxy's error page, a redirect landing
    // on the SPA) has no archiveName -- treated as "no such door" rather than
    // rendered as an empty one.
    const name = str(row.archiveName);
    if (!name)
        return null;
    const rawFiles = Array.isArray(row.files) ? row.files : [];
    const files = [];
    for (const f of rawFiles) {
        if (!f || typeof f !== 'object')
            continue;
        const file = f;
        const filePath = str(file.path);
        if (!filePath)
            continue;
        files.push({
            path: filePath,
            size: typeof file.size === 'number' ? file.size : 0,
            isJunk: file.isJunk === true,
        });
    }
    return {
        archiveName: name,
        name: str(row.name),
        version: str(row.version),
        description: str(row.description),
        category: str(row.category),
        author: str(row.author),
        releaseGroup: str(row.releaseGroup),
        fileIdDiz: str(row.fileIdDiz),
        docFilename: str(row.docFilename),
        doc: str(row.doc),
        suggestedTooltypes: str(row.suggestedTooltypes),
        // The row's own junkCount is the catalog's count; the file list is what
        // is actually flagged right now. Prefer the live rows when they came.
        junkCount: files.length > 0
            ? files.filter(f => f.isJunk).length
            : (typeof row.junkCount === 'number' ? row.junkCount : 0),
        hasDoc: row.hasDoc === true || str(row.doc) !== null,
        md5: str(row.md5),
        sha256: str(row.sha256),
        files,
    };
}
//# sourceMappingURL=repo-client.js.map