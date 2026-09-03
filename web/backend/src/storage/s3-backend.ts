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

/** Errors that mean "it is genuinely not there", not "ask again later". */
const MISSING = new Set(['NotFound', 'NoSuchKey']);

function isTransient(error: unknown): boolean {
  const err = error as ErrorShape;
  const status = err?.$metadata?.httpStatusCode;
  if (status !== undefined && TRANSIENT_STATUS_CODES.has(status)) return true;
  if (TRANSIENT_NAMES.has(err?.name ?? '')) return true;
  if (TRANSIENT_NODE_CODES.has(err?.code ?? '')) return true;
  return false;
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

  /** The volume cannot answer right now vs. any other failure a caller must see raw. */
  private rethrow(error: unknown): never {
    if (isTransient(error)) {
      const name = (error as ErrorShape)?.name ?? 'unknown error';
      throw new StorageUnavailableError(this.driveNumber, `drive ${this.driveNumber}: ${name}`);
    }
    throw error;
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const out = (await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      )) as { ContentLength?: number; LastModified?: Date };
      return { key, size: out.ContentLength ?? 0, mtime: out.LastModified ?? new Date(0) };
    } catch (error) {
      if (MISSING.has((error as ErrorShape)?.name ?? '')) return null;
      this.rethrow(error);
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
      this.rethrow(error);
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
      this.rethrow(error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      this.rethrow(error);
    }
  }

  async list(prefix: string): Promise<ObjectHead[]> {
    const out: ObjectHead[] = [];
    let token: string | undefined;
    try {
      do {
        const page = (await this.client.send(
          new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token })
        )) as {
          Contents?: Array<{ Key?: string; Size?: number; LastModified?: Date }>;
          IsTruncated?: boolean;
          NextContinuationToken?: string;
        };
        for (const item of page.Contents ?? []) {
          if (!item.Key) continue;
          out.push({ key: item.Key, size: item.Size ?? 0, mtime: item.LastModified ?? new Date(0) });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    } catch (error) {
      this.rethrow(error);
    }
    return out;
  }
}

export function createS3Backend(volume: StorageVolume, secret: string): S3Backend {
  if (!volume.keyId) throw new Error(`DRIVE.${volume.driveNumber} has no KEYID`);
  const client = new S3Client({
    endpoint: volume.endpoint,
    region: volume.region ?? 'auto',
    forcePathStyle: true, // MinIO and several free tiers require it; AWS tolerates it.
    credentials: { accessKeyId: volume.keyId, secretAccessKey: secret },
  });
  return new S3Backend(volume.driveNumber, volume.path, client as unknown as S3ClientLike);
}
