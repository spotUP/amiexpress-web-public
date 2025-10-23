/**
 * Rate Limiter Module
 *
 * Simple rate limiter for Socket.IO events
 * Prevents brute force attacks on login, registration, etc.
 */

class SocketRateLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;

    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  check(identifier: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (!record || now > record.resetTime) {
      // New window or expired window
      this.attempts.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return true;
    }

    if (record.count >= this.maxAttempts) {
      // Rate limit exceeded
      return false;
    }

    // Increment counter
    record.count++;
    return true;
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.attempts.entries()) {
      if (now > record.resetTime) {
        this.attempts.delete(key);
      }
    }
  }
}

// Create rate limiters for different events
export const loginRateLimiter = new SocketRateLimiter(5, 15 * 60 * 1000); // 5 attempts per 15 minutes
export const registerRateLimiter = new SocketRateLimiter(3, 60 * 60 * 1000); // 3 attempts per hour
