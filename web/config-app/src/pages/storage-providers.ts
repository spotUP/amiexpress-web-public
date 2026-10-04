/**
 * The storage provider catalogue as the admin reads it.
 *
 * Every figure and every instruction here is served by
 * GET /api/config/storage-providers from web/backend/src/storage/providers.ts -
 * this file only declares the shape and the two small sums the Drives page
 * and the setup wizard both do with it, so neither re-implements them.
 */

/** How to get from "no account" to "a key for one bucket", in the provider's own words. */
export interface ProviderSetupGuide {
  /** Where an account is opened (opens in a new tab). */
  signupUrl: string;
  /** The provider's own guide, for anything the steps below leave out. */
  docsUrl: string;
  account: string[];
  bucket: string[];
  key: string[];
  /** The console's name for the value that goes in "Key ID". */
  keyIdField: string;
  /** The console's name for the value that goes in "Secret". */
  secretField: string;
  /** Whether the console shows the secret once only, at creation. */
  secretShownOnce: boolean;
  /** Where the console shows the value the endpoint field asks for. Empty when there is no field. */
  endpointHint: string;
}

export interface StorageProvider {
  id: string;
  label: string;
  endpointTemplate: string | null;
  endpointFieldLabel: string;
  /**
   * A second value the endpoint needs, its `{region}` (Oracle: the tenancy's
   * home region). Empty when the template has no `{region}`.
   */
  regionFieldLabel: string;
  /** Whether the endpoint field's value IS the signing region (B2, Scaleway, Wasabi, Amazon S3). */
  regionFromEndpointField: boolean;
  defaultRegion: string;
  volumeClass: 'FREE' | 'PAID';
  freeQuotaBytes: number;
  /** The free storage in words, where a size alone would mislead (Scaleway's trial). */
  freeTier?: string;
  egress: 'FREE' | 'METERED' | '3X';
  minimumRetentionDays: number;
  note: string;
  setup: ProviderSetupGuide;
}

export const GB = 1024 * 1024 * 1024;

/** Quota presets, so a size is a button rather than a byte count to work out. */
export const QUOTA_CHOICES: Array<{ label: string; bytes: number }> = [
  { label: '5 GB', bytes: 5 * GB },
  { label: '10 GB', bytes: 10 * GB },
  { label: '25 GB', bytes: 25 * GB },
  { label: '75 GB', bytes: 75 * GB },
  { label: 'No limit', bytes: 0 },
];

/**
 * The free storage as the card and the quota hint say it: the catalogue's own
 * words when it has them, else the size. Empty when there is no free tier.
 */
export function freeTierText(provider: StorageProvider): string {
  if (provider.freeTier) return provider.freeTier;
  return provider.freeQuotaBytes > 0 ? `${Math.round(provider.freeQuotaBytes / GB)} GB` : '';
}

/** The endpoint: the sysop's value in the template's `{}`, and the region in its `{region}`. */
export function completeEndpoint(provider: StorageProvider | undefined, fill: string, region = ''): string {
  if (!provider?.endpointTemplate) return '';
  return provider.endpointTemplate
    .replace('{region}', region.trim() || provider.defaultRegion)
    .replace('{}', fill.trim());
}

/**
 * The region a request is signed for. Where the endpoint field is the region
 * (s3.<region>.backblazeb2.com), the two must agree - a bucket in us-west-004
 * signed for the default eu-central-003 is refused - so the field wins; a
 * provider with its own region field (Oracle) signs for that.
 */
export function regionFor(provider: StorageProvider, fill: string, region = ''): string {
  if (provider.regionFromEndpointField && fill.trim()) return fill.trim();
  if (provider.regionFieldLabel && region.trim()) return region.trim();
  return provider.defaultRegion;
}
