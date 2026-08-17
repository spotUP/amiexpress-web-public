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
 * Manifest typing comes from repo-types.generated.ts, a GENERATED,
 * verbatim (byte-for-byte, not hand-retyped) copy of the ManifestDoor /
 * DoorRepoManifest interfaces from web/backend's door-repo-manifest.ts —
 * the single source of truth for the shape both the server and this
 * client agree on. See scripts/gen-repo-types.ts for why: Doors/door-manager
 * and web/backend are separate TypeScript compilation units (own tsconfig,
 * own rootDir), and door-repo-manifest.ts pulls in better-sqlite3 and
 * other server-only modules. A raw cross-package `import type` still
 * forces TypeScript to add that whole file (and its transitive graph) to
 * THIS package's program in order to resolve the types, which trips
 * TS6059 ("File is not under rootDir") once rootDir is set — needed here
 * to keep dist/ flat (sibling to app.js, matching `require('./repo-client')`)
 * and to keep backend server code from being duplicate-compiled into this
 * door's dist output. Regenerate repo-types.generated.ts
 * (`npm run gen:repo-types`, i.e. `npx tsx scripts/gen-repo-types.ts`)
 * whenever door-repo-manifest.ts's manifest shape changes upstream.
 */
const fs = __importStar(require("fs"));
const crypto = __importStar(require("crypto"));
const stream_1 = require("stream");
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
    const headers = {};
    if (cached?.etag) {
        headers['If-None-Match'] = cached.etag;
    }
    let response;
    try {
        response = await fetch(manifestUrl, { headers });
    }
    catch (err) {
        if (cached) {
            return cachedResult(cached);
        }
        throw new Error(`DOOR REPO: manifest fetch failed (${err.message}) and no cache exists at ${cfg.cacheFile}`);
    }
    if (response.status === 304) {
        if (cached) {
            return cachedResult(cached);
        }
        // Server thinks we hold a matching revision but we have no local
        // cache to serve — a stale/foreign cache file was deleted out from
        // under us. Loud failure, not a silently empty manifest.
        throw new Error(`DOOR REPO: server returned 304 Not Modified but no local cache exists at ${cfg.cacheFile}`);
    }
    if (!response.ok) {
        if (cached) {
            return cachedResult(cached);
        }
        throw new Error(`DOOR REPO: manifest fetch returned HTTP ${response.status} and no cache exists at ${cfg.cacheFile}`);
    }
    let manifest;
    try {
        manifest = (await response.json());
    }
    catch (err) {
        if (cached) {
            return cachedResult(cached);
        }
        throw new Error(`DOOR REPO: manifest response was not valid JSON (${err.message}) and no cache exists at ${cfg.cacheFile}`);
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
    let response;
    try {
        response = await fetch(archiveUrl);
    }
    catch (err) {
        throw new Error(`DOOR REPO: archive download failed for ${archiveName}: ${err.message}`);
    }
    if (!response.ok || !response.body) {
        throw new Error(`DOOR REPO: archive download failed for ${archiveName}: HTTP ${response.status}`);
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
        throw new Error(`DOOR REPO: archive download failed for ${archiveName}: ${err.message}`);
    }
    const actualSha256 = hash.digest('hex');
    if (actualSha256 !== expectedSha256) {
        safeUnlink(destPath);
        throw new Error(`DOOR REPO: CHECKSUM MISMATCH for ${archiveName}: expected sha256 ${expectedSha256}, got ${actualSha256}`);
    }
}
//# sourceMappingURL=repo-client.js.map