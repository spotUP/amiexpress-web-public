import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatClockTime,
  formatCount,
  formatDuration,
  formatMinutes,
  formatRelativeTime,
} from '../lib/format';

describe('formatBytes', () => {
  it('shows whole bytes without a decimal point', () => {
    expect(formatBytes(0)).toBe('0 bytes');
    expect(formatBytes(512)).toBe('512 bytes');
  });

  it('steps up a unit at 1024 and keeps one decimal where it says something', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('returns 0 bytes rather than NaN for a missing count', () => {
    expect(formatBytes(Number.NaN)).toBe('0 bytes');
    expect(formatBytes(-5)).toBe('0 bytes');
  });
});

describe('formatDuration', () => {
  it('drops to the two largest units that matter', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(150)).toBe('2m 30s');
    expect(formatDuration(3900)).toBe('1h 5m');
    expect(formatDuration(90000)).toBe('1d 1h');
  });

  it('treats a zero or negative duration as 0s', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(-1)).toBe('0s');
  });
});

describe('formatMinutes', () => {
  it('reads node time remaining the way a sysop states it', () => {
    expect(formatMinutes(75)).toBe('1h 15m');
    expect(formatMinutes(0)).toBe('0s');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-08-27T12:00:00Z');

  it('describes recent activity in the unit it happened in', () => {
    expect(formatRelativeTime('2026-08-27T11:59:40Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-08-27T11:57:00Z', now)).toBe('3m ago');
    expect(formatRelativeTime('2026-08-27T10:00:00Z', now)).toBe('2h ago');
    expect(formatRelativeTime('2026-08-22T12:00:00Z', now)).toBe('5d ago');
  });

  it('returns an empty string instead of Invalid Date for missing input', () => {
    expect(formatRelativeTime(null, now)).toBe('');
    expect(formatRelativeTime(undefined, now)).toBe('');
    expect(formatRelativeTime('', now)).toBe('');
    expect(formatRelativeTime('not a timestamp', now)).toBe('');
  });
});

describe('formatClockTime', () => {
  it('returns an empty string for an unparseable timestamp', () => {
    expect(formatClockTime('not a timestamp')).toBe('');
  });
});

describe('formatCount', () => {
  it('separates thousands and shows a dash for a missing number', () => {
    expect(formatCount(12345)).toBe('12,345');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(null)).toBe('-');
    expect(formatCount(undefined)).toBe('-');
  });
});
