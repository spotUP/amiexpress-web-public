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
exports.CACHE_FILE = void 0;
exports.withDeadline = withDeadline;
exports.readCache = readCache;
exports.writeCache = writeCache;
exports.bodyForThisCall = bodyForThisCall;
/**
 * One deadline for the whole fetch, and the last answer kept on disk.
 *
 * The 68K viewer held a PETSCII login for 58 SECONDS on 2026-09-15 with a
 * `TIMEOUT=5` in its own config, because a socket timeout is an INACTIVITY
 * timer - it restarts on every byte, and the retries stack on top of it. A
 * caller does not care which phase was slow; he cares that the board stopped.
 *
 * So the rule here is a wall clock: from the moment the door asks, the
 * scenewall has `timeoutSeconds` to produce an answer, retries and all. When
 * it does not, the door draws the LAST answer it got rather than an error -
 * yesterday's list is worth more to a caller than a red line, and it is what
 * the door would have shown him a minute earlier anyway.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** Where the last good answer is kept, beside the door. */
exports.CACHE_FILE = 'glc.lastgood.json';
/**
 * Race a fetch against the clock.
 *
 * The promise is not cancelled - it cannot be, in general - but it is
 * ABANDONED: whatever it eventually settles to is ignored, and the caller has
 * already been given the cache. `onLate` exists so a late answer can still be
 * written to the cache for the next caller, which is where a slow scenewall
 * pays for itself.
 */
async function withDeadline(fetch, timeoutSeconds, onLate) {
    let timer;
    let settled = false;
    const expiry = new Promise((resolve) => {
        timer = setTimeout(() => {
            settled = true;
            resolve(null);
        }, Math.max(1, timeoutSeconds) * 1000);
        // A door must not hold the process open on account of its own timer.
        if (typeof timer.unref === 'function')
            timer.unref();
    });
    const attempt = fetch().then((body) => {
        if (settled && onLate)
            onLate(body);
        return settled ? null : body;
    }, () => null);
    try {
        return await Promise.race([attempt, expiry]);
    }
    finally {
        settled = true;
        if (timer)
            clearTimeout(timer);
    }
}
/** The last answer this door got, or null when it has never had one. */
function readCache(doorDir) {
    try {
        const body = fs.readFileSync(path.join(doorDir, exports.CACHE_FILE), 'utf8');
        return body.trim().length > 0 ? body : null;
    }
    catch {
        return null;
    }
}
/**
 * Keep this answer for the next caller.
 *
 * Written through a temporary file: a door killed mid-write would otherwise
 * leave a truncated cache, and the next caller would see a parse error
 * instead of yesterday's list.
 */
function writeCache(doorDir, body) {
    const target = path.join(doorDir, exports.CACHE_FILE);
    const temp = `${target}.tmp`;
    try {
        fs.writeFileSync(temp, body, 'utf8');
        fs.renameSync(temp, target);
    }
    catch {
        try {
            fs.unlinkSync(temp);
        }
        catch { /* nothing to clean up */ }
    }
}
/** The body to draw, and where it came from. */
async function bodyForThisCall(fetch, timeoutSeconds, doorDir) {
    const fresh = await withDeadline(fetch, timeoutSeconds, (late) => writeCache(doorDir, late));
    if (fresh !== null && fresh.trim().length > 0) {
        writeCache(doorDir, fresh);
        return { body: fresh, source: 'network' };
    }
    const cached = readCache(doorDir);
    return cached ? { body: cached, source: 'cache' } : { body: null, source: 'nothing' };
}
//# sourceMappingURL=fetch-deadline.js.map