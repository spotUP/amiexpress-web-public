/**
 * Session Store Module
 *
 * Redis-backed session store with in-memory fallback
 * Handles BBS session persistence across multiple server instances
 */

import Redis from 'ioredis';
import { BBSSession } from '../bbs/session';

export class RedisSessionStore {
  private redis: Redis | null = null;
  private fallbackMap: Map<string, BBSSession> = new Map();
  private useRedis: boolean = false;
  private readonly SESSION_PREFIX = 'bbs:session:';
  private readonly SESSION_TTL = 3600; // 1 hour in seconds

  constructor() {
    // Try to connect to Redis if REDIS_URL is provided
    if (process.env.REDIS_URL) {
      try {
        this.redis = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            if (times > 3) {
              console.warn('⚠️  Redis connection failed after 3 retries, falling back to in-memory sessions');
              return null; // Stop retrying
            }
            return Math.min(times * 100, 2000); // Exponential backoff
          }
        });

        this.redis.on('connect', () => {
          console.log('✅ Redis connected - using Redis session store');
          this.useRedis = true;
        });

        this.redis.on('error', (error: Error) => {
          console.warn('⚠️  Redis error:', error.message);
          this.useRedis = false;
        });

        this.redis.on('close', () => {
          console.warn('⚠️  Redis connection closed - falling back to in-memory sessions');
          this.useRedis = false;
        });

      } catch (error) {
        console.warn('⚠️  Failed to initialize Redis:', error);
        this.redis = null;
        this.useRedis = false;
      }
    } else {
      console.log('ℹ️  No REDIS_URL provided - using in-memory sessions');
    }
  }

  async set(socketId: string, session: BBSSession): Promise<void> {
    if (this.useRedis && this.redis) {
      try {
        const key = this.SESSION_PREFIX + socketId;
        await this.redis.setex(key, this.SESSION_TTL, JSON.stringify(session));
      } catch (error) {
        console.error('Redis set error:', error);
        this.fallbackMap.set(socketId, session);
      }
    } else {
      this.fallbackMap.set(socketId, session);
    }
  }

  async get(socketId: string): Promise<BBSSession | undefined> {
    if (this.useRedis && this.redis) {
      try {
        const key = this.SESSION_PREFIX + socketId;
        const data = await this.redis.get(key);
        if (data) {
          return JSON.parse(data) as BBSSession;
        }
        return undefined;
      } catch (error) {
        console.error('Redis get error:', error);
        return this.fallbackMap.get(socketId);
      }
    } else {
      return this.fallbackMap.get(socketId);
    }
  }

  async delete(socketId: string): Promise<void> {
    if (this.useRedis && this.redis) {
      try {
        const key = this.SESSION_PREFIX + socketId;
        await this.redis.del(key);
      } catch (error) {
        console.error('Redis delete error:', error);
        this.fallbackMap.delete(socketId);
      }
    } else {
      this.fallbackMap.delete(socketId);
    }
  }

  async has(socketId: string): Promise<boolean> {
    if (this.useRedis && this.redis) {
      try {
        const key = this.SESSION_PREFIX + socketId;
        const exists = await this.redis.exists(key);
        return exists === 1;
      } catch (error) {
        console.error('Redis exists error:', error);
        return this.fallbackMap.has(socketId);
      }
    } else {
      return this.fallbackMap.has(socketId);
    }
  }

  async getAllKeys(): Promise<string[]> {
    if (this.useRedis && this.redis) {
      try {
        const keys = await this.redis.keys(this.SESSION_PREFIX + '*');
        return keys.map(key => key.replace(this.SESSION_PREFIX, ''));
      } catch (error) {
        console.error('Redis keys error:', error);
        return Array.from(this.fallbackMap.keys());
      }
    } else {
      return Array.from(this.fallbackMap.keys());
    }
  }

  async refreshTTL(socketId: string): Promise<void> {
    if (this.useRedis && this.redis) {
      try {
        const key = this.SESSION_PREFIX + socketId;
        await this.redis.expire(key, this.SESSION_TTL);
      } catch (error) {
        console.error('Redis expire error:', error);
      }
    }
    // In-memory sessions don't need TTL refresh (handled by cleanup)
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
