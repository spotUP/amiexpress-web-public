/**
 * One adapter for every S3-compatible provider.
 *
 * Cloudflare R2, Backblaze B2, Storj, Scaleway, Oracle, Filebase, iDrive e2,
 * Wasabi, Hetzner and MinIO differ only in an endpoint and a region, so the
 * board needs no per-provider code. The client is injected because a test that
 * needs the network is a test nobody runs.
 */
import type {
  DeleteObjectCommand as DeleteObjectCommandType,
  GetObjectCommand as GetObjectCommandType,
  HeadObjectCommand as HeadObjectCommandType,
  ListObjectsV2Command as ListObjectsV2CommandType,
  PutObjectCommand as PutObjectCommandType,
  S3Client as S3ClientType,
} from '@aws-sdk/client-s3';

/**
 * The AWS SDK is loaded ON FIRST USE, not on import.
 *
 * `@aws-sdk/client-s3` plus its `@smithy` runtime is 41 MB across 7,217
 * files, costs 800ms to require and 27 MB of RSS. A statically imported
 * module pays all of that at boot on EVERY board - and a board with no
 * `s3://` volume in Drives.info never constructs an S3 client at all, which
 * is every board that has not opted into pooled storage.
 *
 * Both call sites (`VolumeSet.fromBoard` and `DriveConfigService`) take
 * `createS3Backend` as a default parameter - a reference, never invoked at
 * import time - so nothing here runs until a pooled volume is really opened.
 */
type S3Sdk = typeof import('@aws-sdk/client-s3');
type SmithyHandler = typeof import('@smithy/node-http-handler');

let s3Sdk: S3Sdk | null = null;
let smithy: SmithyHandler | null = null;

function loadS3Sdk(): S3Sdk {
  // require, not await import: this keeps createS3Backend synchronous, so no
  // caller has to become async for a lazy load.
  return (s3Sdk ??= require('@aws-sdk/client-s3') as S3Sdk);
}

function loadSmithy(): SmithyHandler {
  return (smithy ??= require('@smithy/node-http-handler') as SmithyHandler);
}
import type { StorageVolume } from './volume-config';
import type { ObjectHead, StorageBackend } from './storage-backend';
import { StorageUnavailableError } from './storage-backend';

/**
 * Task 12 review, finding 1: with no timeout configured, `NodeHttpHandler`
 * defaults `requestTimeout` to 0 - no timeout at all - and a socket that
 * never gets a TCP handshake back (a blackholed endpoint, a security group
 * dropping the packet on the floor) hangs on the OS's own TCP timeout,
 * typically well past a minute, multiplied by the SDK's own retry count.
 * `flushPending()` (file-cache.ts) awaits this per pending entry, serially,
 * with no timeout of its own - fifty staged uploads against a dead endpoint
 * would have meant the board never accepting a caller, silently, with a
 * green process and nothing in the log. `refreshStorageContext`
 * (storage/index.ts) now refuses to let that block anything it runs after,
 * but the client itself should still not be capable of hanging a single
 * request this long - a caller-facing fetch (`ensureLocalSync`,
 * `writeBackSync`) has its OWN 30s budget (`DEFAULT_SYNC_TIMEOUT_MS`) that a
 * single unbounded HTTP attempt could blow through on its own.
 */
const CONNECTION_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;

export interface S3ClientLike {
  send(command: unknown): Promise<unknown>;
}

/**
 * The shape every AWS SDK v3 (and @smithy) service exception carries:
 * `$metadata.httpStatusCode` on modeled errors, plus optionally a raw Node
 * network error's `.code`. Established by reading
 * `@smithy/service-error-classification`'s own `isThrottlingError` /
 * `isTransientError`, not assumed - see the module doc below.
 */
interface ErrorShape {
  name?: string;
  code?: string;
  $metadata?: { httpStatusCode?: number };
}

/**
 * Names used as a FALLBACK only, for a provider that does not report
 * `$metadata.httpStatusCode` (a bare `Error` thrown by a mock, a hand-rolled
 * shim in front of a non-AWS S3-compatible endpoint). The primary signal is
 * the status code below - reading the installed `@aws-sdk/client-s3` version
 * (3.x, `@smithy/service-error-classification`) shows the real SDK itself
 * classifies retryable errors mostly by `$metadata.httpStatusCode` (429, or
 * 500/502/503/504) and only falls back to a name list for the errors that
 * cannot carry a status - a raw socket failure has no HTTP response at all.
 * This set is the union of that library's THROTTLING_ERROR_CODES and
 * TRANSIENT_ERROR_CODES with the names S3 itself is documented to return for
 * a 500/503 (InternalError, ServiceUnavailable) and the legacy SDK v2 name
 * (NetworkingError) some S3-compatible gateways still emit.
 */
const TRANSIENT_NAMES = new Set([
  // S3-specific 5xx names.
  'ServiceUnavailable',
  'InternalError',
  // @smithy/service-error-classification THROTTLING_ERROR_CODES.
  'BandwidthLimitExceeded',
  'EC2ThrottledException',
  'LimitExceededException',
  'PriorRequestNotComplete',
  'ProvisionedThroughputExceededException',
  'RequestLimitExceeded',
  'RequestThrottled',
  'RequestThrottledException',
  'SlowDown',
  'ThrottledException',
  'Throttling',
  'ThrottlingException',
  'TooManyRequestsException',
  'TransactionInProgressException',
  // @smithy/service-error-classification TRANSIENT_ERROR_CODES.
  'TimeoutError',
  'RequestTimeout',
  'RequestTimeoutException',
  // Legacy AWS SDK v2 name, still seen from some S3-compatible gateways.
  'NetworkingError',
]);

/** HTTP status codes @smithy/service-error-classification treats as transient. */
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * Node's own `net`/`http` error codes for a connection that never produced a
 * response at all - the SDK has nothing to classify because there is no
 * `$metadata` yet. Matches @smithy/service-error-classification's
 * NODEJS_TIMEOUT_ERROR_CODES + NODEJS_NETWORK_ERROR_CODES.
 */
const TRANSIENT_NODE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
]);

function isTransient(error: unknown): boolean {
  const err = error as ErrorShape;
  const status = err?.$metadata?.httpStatusCode;
  if (status !== undefined && TRANSIENT_STATUS_CODES.has(status)) return true;
  if (TRANSIENT_NAMES.has(err?.name ?? '')) return true;
  if (TRANSIENT_NODE_CODES.has(err?.code ?? '')) return true;
  return false;
}

/**
 * Errors that mean "it is genuinely not there", not "ask again later" and not
 * "the volume could not honestly answer". Checked by NAME for the modeled S3
 * exceptions - `HeadObjectCommand` throws `NotFound`, `GetObjectCommand`
 * throws `NoSuchKey`.
 */
const MISSING_NAMES = new Set(['NotFound', 'NoSuchKey']);

/**
 * Names that also ride on a 404 but mean the whole bucket or route is
 * unreachable, not that one key is missing: a renamed/deleted bucket, a bad
 * bucket name, or a redirect a caller didn't follow. These must NEVER be
 * read as per-key absence - `isMissingForHead`'s status-only fallback below
 * exists for gateways that skip the modeled name on a real per-key 404, and
 * would otherwise turn a whole-drive outage into "every key on this drive is
 * absent", which is the catalog-deleting outcome at drive scale instead of
 * file scale.
 */
const BUCKET_LEVEL_NAMES = new Set(['NoSuchBucket', 'InvalidBucketName', 'PermanentRedirect']);

/** get() and delete(): absence only by the modeled name - no status fallback. */
function isMissingByName(error: unknown): boolean {
  const err = error as ErrorShape;
  return MISSING_NAMES.has(err?.name ?? '');
}

/**
 * head() only: a non-AWS gateway need not carry the modeled `NotFound` name
 * on a genuine per-key 404, so a bare `$metadata.httpStatusCode === 404` is
 * absence there too - UNLESS the name identifies a bucket-level failure
 * (see BUCKET_LEVEL_NAMES), in which case it is never absence regardless of
 * status code.
 */
function isMissingForHead(error: unknown): boolean {
  const err = error as ErrorShape;
  const name = err?.name ?? '';
  if (MISSING_NAMES.has(name)) return true;
  if (BUCKET_LEVEL_NAMES.has(name)) return false;
  return err?.$metadata?.httpStatusCode === 404;
}

/**
 * A single PutObjectCommand request tops out at 5 GB on every S3-compatible
 * provider in the pool. Above that a caller needs multipart upload, which is
 * explicitly out of scope for this adapter - refusing by name here is safer
 * than letting a doomed request start.
 */
const MAX_SINGLE_PUT_BYTES = 5 * 1024 ** 3;

/**
 * Names that mean a human needs to look at this drive's credentials or
 * configuration, not that the volume is briefly down. These still come out
 * of `unavailable()` as StorageUnavailableError - see that method's doc for
 * why a separate return class is not the fix - but a StorageUnavailableError
 * with no other signal is silent forever if the underlying cause never
 * self-heals, and `SignatureDoesNotMatch` does not self-heal by retrying.
 * Logged once, at error level, purely for an operator reading the container
 * log; nothing about the return type changes.
 */
const CREDENTIAL_OR_CONFIG_NAMES = new Set([
  'SignatureDoesNotMatch',
  'InvalidAccessKeyId',
  'AccessDenied',
  'NoSuchBucket',
  'PermanentRedirect',
]);

/**
 * Re-arming, NOT sticky - matches the pattern `usable-areas.ts` uses for its
 * own "don't repeat, but don't go silent forever" warnings. A sustained bad
 * secret used to log this line on EVERY failing call - every `D`, every `U`,
 * every listing - which floods the log on a disk-constrained board (this one
 * has hit ENOSPC twice this year) exactly when disk space matters most. Long
 * enough not to flood; short enough that a sysop who just fixed one drive's
 * secret still finds out promptly about the next thing that goes wrong.
 */
const CREDENTIAL_WARNING_REARM_MS = 5 * 60 * 1000;

/** Attaches the original failure as `.cause` without widening the error's public shape. */
function withCause<E extends Error>(error: E, cause: unknown): E {
  return Object.assign(error, { cause });
}

export class S3Backend implements StorageBackend {
  /** When each failure NAME last got its one-line operator log - see `unavailable`. */
  private readonly lastCredentialWarningAt = new Map<string, number>();

  constructor(
    public readonly driveNumber: number,
    private readonly bucket: string,
    private readonly client: S3ClientLike
  ) {}

  /**
   * Wraps ANY failure that is not absence as "the volume cannot answer right
   * now" - matching LocalBackend, which wraps every non-ENOENT/ENOTDIR
   * failure as StorageUnavailableError. A caller written against the
   * StorageBackend contract has exactly two things to branch on (absence, and
   * StorageUnavailableError); a third, unclassified "raw SDK error" branch is
   * not part of that contract and is where a 403 from a caller that lacks
   * ListBucket - which looks exactly like "missing" until you read the status
   * code - used to slip through as an uncaught exception instead of a safe
   * "try again" signal.
   *
   * Deliberately NOT split into a separate "fatal" return class for
   * credential or configuration errors (SignatureDoesNotMatch,
   * InvalidAccessKeyId, a bad bucket policy, ...): a caller cannot do
   * anything safe with "fatal" that it cannot already do with "unavailable" -
   * both mean "do not read this as absence, and do not treat this volume as
   * healthy right now." These errors do not self-heal by retrying - a wrong
   * secret stays wrong - but that is an operator problem, not a caller
   * branching problem, so it is surfaced by logging (see
   * CREDENTIAL_OR_CONFIG_NAMES) and by keeping the underlying message and
   * `.cause` on the thrown error, not by adding a class every caller would
   * have to learn to check for.
   */
  private unavailable(error: unknown): never {
    const err = error as ErrorShape & { message?: string };
    const status = err?.$metadata?.httpStatusCode;
    const name = err?.name ?? 'unknown error';
    const label = status !== undefined ? `${name} (${status})` : name;
    const detail = err?.message ? `${label}: ${err.message}` : label;
    if (CREDENTIAL_OR_CONFIG_NAMES.has(name)) {
      const now = Date.now();
      const last = this.lastCredentialWarningAt.get(name);
      if (last === undefined || now - last >= CREDENTIAL_WARNING_REARM_MS) {
        this.lastCredentialWarningAt.set(name, now);
        // eslint-disable-next-line no-console -- operator-facing container log, not BBS session output.
        console.error(
          `[S3Backend] drive ${this.driveNumber} storage failure looks like a credential or ` +
            `configuration problem, not a transient one, and will not self-heal by retrying: ${detail}`
        );
      }
    }
    throw withCause(
      new StorageUnavailableError(this.driveNumber, `drive ${this.driveNumber}: ${detail}`),
      error
    );
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const out = (await this.client.send(
        new (loadS3Sdk().HeadObjectCommand)({ Bucket: this.bucket, Key: key })
      )) as { ContentLength?: number; LastModified?: Date };
      return { key, size: out.ContentLength ?? 0, mtime: out.LastModified ?? new Date(0) };
    } catch (error) {
      // Transient first: a throttled or overloaded gateway can echo a stale
      // or generic body (a 503 whose payload happens to carry a NotFound
      // code) - the status/transient signal always outranks the name, or a
      // sysop deletes the catalog row for a file that is fine.
      if (isTransient(error)) this.unavailable(error);
      if (isMissingForHead(error)) return null;
      this.unavailable(error);
    }
  }

  async get(key: string): Promise<Buffer> {
    // Only the network call is wrapped - this adapter's OWN post-response
    // errors (no Body on the response, transformToByteArray failing) must
    // not be reclassified as StorageUnavailableError and retried forever;
    // list() already gets this right by mapping outside its try.
    let out: { Body?: { transformToByteArray(): Promise<Uint8Array> } };
    try {
      out = (await this.client.send(
        new (loadS3Sdk().GetObjectCommand)({ Bucket: this.bucket, Key: key })
      )) as typeof out;
    } catch (error) {
      if (isTransient(error)) this.unavailable(error);
      // Absence has no null to return from a method typed Promise<Buffer> -
      // rethrown raw, matching LocalBackend (raw ENOENT) and FakeBackend (a
      // plain Error), so a caller catches "not found" the same way against
      // every backend. Checked by name only - no status-only 404 fallback
      // here, so a bucket-level 404 (NoSuchBucket, a bad route) falls through
      // to unavailable() instead of being misread as "this key is missing".
      if (isMissingByName(error)) throw error;
      this.unavailable(error);
    }
    if (!out.Body) throw new Error(`empty body for ${key}`);
    return Buffer.from(await out.Body.transformToByteArray());
  }

  async put(key: string, body: Buffer): Promise<void> {
    if (body.length > MAX_SINGLE_PUT_BYTES) {
      throw new Error(
        `drive ${this.driveNumber}: object ${key} is ${body.length} bytes, over the ` +
          `${MAX_SINGLE_PUT_BYTES}-byte single-request PutObject limit - multipart upload ` +
          'is not implemented by this adapter'
      );
    }
    try {
      await this.client.send(new (loadS3Sdk().PutObjectCommand)({ Bucket: this.bucket, Key: key, Body: body }));
    } catch (error) {
      this.unavailable(error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new (loadS3Sdk().DeleteObjectCommand)({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (isTransient(error)) this.unavailable(error);
      // Deleting an object that is already gone is not an error - it is the
      // caller's desired end state, matching LocalBackend. Checked by name
      // only, same reasoning as get(): a bucket-level 404 must not read as
      // "this key was already deleted".
      if (isMissingByName(error)) return;
      this.unavailable(error);
    }
  }

  /**
   * Recursive by design (Task 2 decision): a real ListObjectsV2 call with a
   * prefix and no delimiter returns the whole subtree, so no Delimiter is
   * ever sent here.
   *
   * Pages until the bucket stops truncating. `IsTruncated: true` with no
   * `NextContinuationToken` is a bucket lying about there being more to
   * fetch - returning what was collected so far would be a short listing
   * with no signal, and under one-copy-per-file a short listing feeding a
   * reconciler deletes rows for files that exist. Refuses that, and refuses
   * a provider that reuses ANY token already seen this call (not just the
   * immediately preceding one - a two-step cycle A -> B -> A is still a
   * cycle), by surfacing StorageUnavailableError instead of looping forever.
   */
  async list(prefix: string): Promise<ObjectHead[]> {
    const out: ObjectHead[] = [];
    let token: string | undefined;
    const seenTokens = new Set<string>();
    for (;;) {
      let page: {
        Contents?: Array<{ Key?: string; Size?: number; LastModified?: Date }>;
        IsTruncated?: boolean;
        NextContinuationToken?: string;
      };
      try {
        page = (await this.client.send(
          new (loadS3Sdk().ListObjectsV2Command)({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token })
        )) as typeof page;
      } catch (error) {
        this.unavailable(error);
      }
      for (const item of page.Contents ?? []) {
        if (!item.Key) continue;
        out.push({ key: item.Key, size: item.Size ?? 0, mtime: item.LastModified ?? new Date(0) });
      }
      if (!page.IsTruncated) break;
      const next = page.NextContinuationToken;
      if (!next) {
        throw new StorageUnavailableError(
          this.driveNumber,
          `drive ${this.driveNumber}: listing "${prefix}" was truncated with no continuation ` +
            'token - refusing to return a short listing'
        );
      }
      if (seenTokens.has(next)) {
        throw new StorageUnavailableError(
          this.driveNumber,
          `drive ${this.driveNumber}: listing "${prefix}" reused a continuation token ("${next}") ` +
            'it had already seen - refusing to loop forever'
        );
      }
      seenTokens.add(next);
      token = next;
    }
    return out;
  }
}

export function createS3Backend(volume: StorageVolume, secret: string): S3Backend {
  if (volume.kind !== 's3') {
    throw new Error(`DRIVE.${volume.driveNumber} is not an s3:// volume (kind is "${volume.kind}")`);
  }
  if (!volume.keyId) throw new Error(`DRIVE.${volume.driveNumber} has no KEYID`);
  if (!secret) throw new Error(`DRIVE.${volume.driveNumber} has no secret`);
  if (!volume.endpoint) throw new Error(`DRIVE.${volume.driveNumber} has no ENDPOINT`);
  if (volume.path.includes('/')) {
    // volume.path is what follows `s3://` in Drives.info verbatim. Only a
    // bare bucket name is a valid Bucket for every request this adapter
    // sends - `s3://bucket/prefix` would silently become the invalid bucket
    // name "bucket/prefix" instead of bucket "bucket" with a key prefix.
    throw new Error(
      `DRIVE.${volume.driveNumber} target "${volume.path}" is not a bare bucket name - ` +
        's3://bucket is supported, s3://bucket/prefix is not'
    );
  }
  const client = new (loadS3Sdk().S3Client)({
    endpoint: volume.endpoint,
    region: volume.region ?? 'auto',
    forcePathStyle: true, // MinIO and several free tiers require it; AWS tolerates it.
    credentials: { accessKeyId: volume.keyId, secretAccessKey: secret },
    // See the CONNECTION_TIMEOUT_MS/REQUEST_TIMEOUT_MS note above this
    // function - no caller-facing path may inherit an unbounded wait on a
    // dead or blackholed endpoint.
    requestHandler: new (loadSmithy().NodeHttpHandler)({
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      requestTimeout: REQUEST_TIMEOUT_MS,
    }),
  });
  return new S3Backend(volume.driveNumber, volume.path, client as unknown as S3ClientLike);
}
