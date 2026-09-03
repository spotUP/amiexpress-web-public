/**
 * What every storage volume can do, and nothing more.
 *
 * Five calls, because five is what the board needs and every extra one is
 * another thing an adapter for the next provider has to get right.
 */
export interface ObjectHead {
  key: string;
  size: number;
  mtime: Date;
}

export interface StorageBackend {
  readonly driveNumber: number;
  head(key: string): Promise<ObjectHead | null>;
  get(key: string): Promise<Buffer>;
  put(key: string, body: Buffer): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<ObjectHead[]>;
}

/**
 * The volume is there but cannot answer right now - down, rate-limited, out of
 * requests. NEVER to be turned into "file not found" by a caller: a sysop who
 * is shown "not found" deletes the catalog row for a file that was fine.
 */
export class StorageUnavailableError extends Error {
  constructor(public readonly driveNumber: number, message: string) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

/**
 * driveNumber is undefined for a pool-level refusal - "nothing in the pool has
 * room" is not any one drive's fault, and DRIVE numbering starts at 1, so a
 * sentinel 0 would read as a real (if wrong) drive to a caller that maps it
 * straight to `byNumber()`. A single-volume quota failure (LocalBackend.put,
 * FakeBackend.put) still names its drive.
 */
export class StorageQuotaError extends Error {
  constructor(public readonly driveNumber: number | undefined, message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}
