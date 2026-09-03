/**
 * One adapter for every S3-compatible provider.
 *
 * Cloudflare R2, Backblaze B2, Storj, Scaleway, Oracle, Filebase, iDrive e2,
 * Wasabi, Hetzner and MinIO differ only in an endpoint and a region, so the
 * board needs no per-provider code. The client is injected because a test that
 * needs the network is a test nobody runs.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { StorageVolume } from './volume-config';
import type { ObjectHead, StorageBackend } from './storage-backend';
import { StorageUnavailableError } from './storage-backend';

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
 * exceptions (`HeadObjectCommand` throws `NotFound`, `GetObjectCommand`
 * throws `NoSuchKey`), and additionally by status code: a non-AWS gateway is
 * not obliged to carry the modeled name on its 404, so a bare `$metadata.
 * httpStatusCode === 404` is absence too, regardless of what name (if any)
 * rode along with it.
 */
const MISSING_NAMES = new Set(['NotFound', 'NoSuchKey']);

function isMissing(error: unknown): boolean {
  const err = error as ErrorShape;
  if (MISSING_NAMES.has(err?.name ?? '')) return true;
  return err?.$metadata?.httpStatusCode === 404;
}

/**
 * A single PutObjectCommand request tops out at 5 GB on every S3-compatible
 * provider in the pool. Above that a caller needs multipart upload, which is
 * explicitly out of scope for this adapter - refusing by name here is safer
 * than letting a doomed request start.
 */
const MAX_SINGLE_PUT_BYTES = 5 * 1024 ** 3;

export class S3Backend implements StorageBackend {
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
   * Deliberately NOT split into a separate "fatal" bucket for credential or
   * configuration errors (SignatureDoesNotMatch, InvalidAccessKeyId, a bad
   * bucket policy, ...): those are exactly the errors a human needs to see
   * and fix, but nothing about receiving one tells a storage caller it is
   * safe to treat this volume as permanently gone rather than transiently
   * unavailable, and misclassifying that boundary is worse than treating a
   * misconfigured volume as unavailable until an operator notices the
   * StorageUnavailableError and looks at the drive's credentials.
   */
  private unavailable(error: unknown): never {
    const err = error as ErrorShape;
    const status = err?.$metadata?.httpStatusCode;
    const name = err?.name ?? 'unknown error';
    const detail = status !== undefined ? `${name} (${status})` : name;
    throw new StorageUnavailableError(this.driveNumber, `drive ${this.driveNumber}: ${detail}`);
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const out = (await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      )) as { ContentLength?: number; LastModified?: Date };
      return { key, size: out.ContentLength ?? 0, mtime: out.LastModified ?? new Date(0) };
    } catch (error) {
      // Transient first: a throttled or overloaded gateway can echo a stale
      // or generic body (a 503 whose payload happens to carry a NotFound
      // code) - the status/transient signal always outranks the name, or a
      // sysop deletes the catalog row for a file that is fine.
      if (isTransient(error)) this.unavailable(error);
      if (isMissing(error)) return null;
      this.unavailable(error);
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const out = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      )) as { Body?: { transformToByteArray(): Promise<Uint8Array> } };
      if (!out.Body) throw new Error(`empty body for ${key}`);
      return Buffer.from(await out.Body.transformToByteArray());
    } catch (error) {
      if (isTransient(error)) this.unavailable(error);
      // Absence has no null to return from a method typed Promise<Buffer> -
      // rethrown raw, matching LocalBackend (raw ENOENT) and FakeBackend (a
      // plain Error), so a caller catches "not found" the same way against
      // every backend.
      if (isMissing(error)) throw error;
      this.unavailable(error);
    }
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
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body }));
    } catch (error) {
      this.unavailable(error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (isTransient(error)) this.unavailable(error);
      // Deleting an object that is already gone is not an error - it is the
      // caller's desired end state, matching LocalBackend.
      if (isMissing(error)) return;
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
   * a provider that echoes the same token twice (which would otherwise loop
   * forever), by surfacing StorageUnavailableError instead of guessing.
   */
  async list(prefix: string): Promise<ObjectHead[]> {
    const out: ObjectHead[] = [];
    let token: string | undefined;
    for (;;) {
      let page: {
        Contents?: Array<{ Key?: string; Size?: number; LastModified?: Date }>;
        IsTruncated?: boolean;
        NextContinuationToken?: string;
      };
      try {
        page = (await this.client.send(
          new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token })
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
      if (next === token) {
        throw new StorageUnavailableError(
          this.driveNumber,
          `drive ${this.driveNumber}: listing "${prefix}" returned the same continuation token ` +
            'twice - refusing to loop forever'
        );
      }
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
  const client = new S3Client({
    endpoint: volume.endpoint,
    region: volume.region ?? 'auto',
    forcePathStyle: true, // MinIO and several free tiers require it; AWS tolerates it.
    credentials: { accessKeyId: volume.keyId, secretAccessKey: secret },
  });
  return new S3Backend(volume.driveNumber, volume.path, client as unknown as S3ClientLike);
}
