import type { ObjectHead, StorageBackend } from '../../src/storage/storage-backend';
import { StorageQuotaError, StorageUnavailableError } from '../../src/storage/storage-backend';

/**
 * The backend every storage test runs against - no network, and it models the
 * things that actually break: a quota, a monthly request budget, egress, and a
 * volume that is down, throttled or gone for good.
 */
export class FakeBackend implements StorageBackend {
  readonly driveNumber: number;
  private readonly objects = new Map<string, Buffer>();
  private readonly quotaBytes?: number;
  private readonly requestBudget?: number;

  gets = 0;
  puts = 0;
  heads = 0;
  lists = 0;
  requests = 0;
  egressBytes = 0;

  down = false;
  rateLimited = false;
  gone = false;

  constructor(opts: { driveNumber: number; quotaBytes?: number; requestBudget?: number }) {
    this.driveNumber = opts.driveNumber;
    this.quotaBytes = opts.quotaBytes;
    this.requestBudget = opts.requestBudget;
  }

  get usedBytes(): number {
    let total = 0;
    for (const body of this.objects.values()) total += body.length;
    return total;
  }

  /**
   * Charges one request against the meter, then applies faults and the
   * budget - in that order.
   *
   * The attempt is counted first, before any throw: a caller retrying
   * against a down volume made three real requests and burned three
   * requests against the budget, even though every one failed, so `requests`
   * must show 3, not 0. Faults are checked before the budget so a volume
   * that is down reports as down, not as merely out of requests.
   */
  private charge(): void {
    this.requests++;
    if (this.gone) throw new StorageUnavailableError(this.driveNumber, 'volume is gone');
    if (this.down) throw new StorageUnavailableError(this.driveNumber, 'volume is unavailable');
    if (this.rateLimited) throw new StorageUnavailableError(this.driveNumber, 'volume is rate limited');
    if (this.requestBudget !== undefined && this.requests > this.requestBudget) {
      throw new StorageUnavailableError(this.driveNumber, 'request budget exhausted');
    }
  }

  async head(key: string): Promise<ObjectHead | null> {
    this.charge();
    this.heads++;
    const body = this.objects.get(key);
    return body ? { key, size: body.length, mtime: new Date(0) } : null;
  }

  async get(key: string): Promise<Buffer> {
    this.charge();
    this.gets++;
    const body = this.objects.get(key);
    if (!body) throw new Error(`no such object: ${key}`);
    this.egressBytes += body.length;
    return body;
  }

  async put(key: string, body: Buffer): Promise<void> {
    this.charge();
    // Overwriting an existing key replaces it rather than adding to it, so
    // the size it is about to stop occupying must be credited back before
    // the quota check - otherwise re-uploading the same key twice charges
    // it once for real and once as a phantom, which a real bucket never
    // does.
    const replaced = this.objects.get(key)?.length ?? 0;
    if (this.quotaBytes !== undefined && this.usedBytes - replaced + body.length > this.quotaBytes) {
      throw new StorageQuotaError(this.driveNumber, 'quota exceeded');
    }
    this.puts++;
    this.objects.set(key, Buffer.from(body));
  }

  async delete(key: string): Promise<void> {
    this.charge();
    this.objects.delete(key);
  }

  async list(prefix: string): Promise<ObjectHead[]> {
    this.charge();
    this.lists++;
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, body]) => ({ key, size: body.length, mtime: new Date(0) }));
  }
}
