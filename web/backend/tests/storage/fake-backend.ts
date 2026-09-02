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

  private charge(): void {
    if (this.gone) throw new StorageUnavailableError(this.driveNumber, 'volume is gone');
    if (this.down) throw new StorageUnavailableError(this.driveNumber, 'volume is unavailable');
    if (this.rateLimited) throw new StorageUnavailableError(this.driveNumber, 'volume is rate limited');
    this.requests++;
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
    if (this.quotaBytes !== undefined && this.usedBytes + body.length > this.quotaBytes) {
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
