/**
 * What a provider card says about its free storage.
 *
 * Scaleway's free storage is not a flat 75 GB: "750 GB for 90 days, then 75 GB"
 * (the sysop, 2026-10-04). The card and the quota hint both read the
 * catalogue's own wording when it has one, and fall back to the size.
 */
import { describe, expect, it } from 'vitest';
import { freeTierText, GB, type StorageProvider } from '../src/pages/storage-providers';

function provider(overrides: Partial<StorageProvider>): StorageProvider {
  return {
    id: 'x',
    label: 'X',
    endpointTemplate: null,
    endpointFieldLabel: '',
    regionFieldLabel: '',
    regionFromEndpointField: false,
    defaultRegion: 'us-east-1',
    volumeClass: 'FREE',
    freeQuotaBytes: 0,
    egress: 'FREE',
    minimumRetentionDays: 0,
    note: '',
    setup: {
      signupUrl: 'https://example.com',
      docsUrl: 'https://example.com',
      account: [],
      bucket: [],
      key: [],
      keyIdField: 'k',
      secretField: 's',
      secretShownOnce: true,
      endpointHint: '',
    },
    ...overrides,
  };
}

describe('freeTierText', () => {
  it('shows Scaleway as 750 GB for 90 days, then 75 GB', () => {
    expect(
      freeTierText(provider({ freeQuotaBytes: 75 * GB, freeTier: '750 GB for 90 days, then 75 GB' })),
    ).toBe('750 GB for 90 days, then 75 GB');
  });

  it('falls back to the free size, and to nothing without a free tier', () => {
    expect(freeTierText(provider({ freeQuotaBytes: 10 * GB }))).toBe('10 GB');
    expect(freeTierText(provider({ freeQuotaBytes: 0 }))).toBe('');
  });
});
