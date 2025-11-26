const DEFAULT_CONNECTION_WINDOW_MS = 10_000; // 10 seconds
const DEFAULT_CONNECTION_LIMIT = 8;
const DEFAULT_FAILURE_WINDOW_MS = 30_000; // 30 seconds
const DEFAULT_FAILURE_LIMIT = 4;
const DEFAULT_BAN_DURATION_MS = 15 * 60_000; // 15 minutes

type TimestampList = number[];

export class IpBanManager {
  private connectionAttempts = new Map<string, TimestampList>();
  private failureAttempts = new Map<string, TimestampList>();
  private bans = new Map<string, number>();

  allowConnection(ip: string): boolean {
    if (!ip || ip === 'unknown') return true;
    const now = Date.now();
    if (this.isCurrentlyBanned(ip, now)) {
      return false;
    }

    const attempts = this.connectionAttempts.get(ip) || [];
    attempts.push(now);
    const pruneBefore = now - DEFAULT_CONNECTION_WINDOW_MS;
    const recent = attempts.filter((ts) => ts >= pruneBefore);
    this.connectionAttempts.set(ip, recent);

    if (recent.length >= DEFAULT_CONNECTION_LIMIT) {
      this.bans.set(ip, now + DEFAULT_BAN_DURATION_MS);
      console.warn(`[Security] ${ip} exceeded ${DEFAULT_CONNECTION_LIMIT} connections in ${DEFAULT_CONNECTION_WINDOW_MS / 1000}s; applied ${DEFAULT_BAN_DURATION_MS / 60000}m ban.`);
      return false;
    }

    return true;
  }

  recordFailure(ip: string): boolean {
    if (!ip || ip === 'unknown') return true;
    const now = Date.now();
    if (this.isCurrentlyBanned(ip, now)) {
      return false;
    }

    const fails = this.failureAttempts.get(ip) || [];
    fails.push(now);
    const pruneBefore = now - DEFAULT_FAILURE_WINDOW_MS;
    const recent = fails.filter((ts) => ts >= pruneBefore);
    this.failureAttempts.set(ip, recent);

    if (recent.length >= DEFAULT_FAILURE_LIMIT) {
      this.bans.set(ip, now + DEFAULT_BAN_DURATION_MS);
      console.warn(`[Security] ${ip} recorded ${DEFAULT_FAILURE_LIMIT} authentication failures in ${DEFAULT_FAILURE_WINDOW_MS / 1000}s; applied ${DEFAULT_BAN_DURATION_MS / 60000}m ban.`);
      return false;
    }

    return true;
  }

  resetFailures(ip: string): void {
    if (!ip) return;
    this.failureAttempts.delete(ip);
  }

  isCurrentlyBanned(ip: string, now: number = Date.now()): boolean {
    const banUntil = this.bans.get(ip);
    if (!banUntil) return false;
    if (now >= banUntil) {
      this.bans.delete(ip);
      return false;
    }
    return true;
  }

  getBanExpiration(ip: string): number | null {
    return this.bans.get(ip) || null;
  }
}

export const ipBanManager = new IpBanManager();
