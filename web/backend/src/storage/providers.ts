/**
 * The object-storage providers a sysop can pick from, and what each one needs.
 *
 * One adapter serves all of them - `S3Backend` with a configurable endpoint -
 * so the only thing that differs is the endpoint's SHAPE and the terms of the
 * account. Those terms are a bill, not a detail: R2 charges nothing for
 * egress while S3 charges $0.09/GB, and Wasabi bills a deleted file for its
 * full 90 days. The admin picks a provider rather than typing all of it.
 *
 * Figures come from the design spec's free-tier and paid tables
 * (docs/superpowers/specs/2026-09-03-pooled-object-storage-design.md).
 */
export interface StorageProvider {
  /** Stable id, written to DRIVE.n.PROVIDER so the page can show the choice back. */
  id: string;
  label: string;
  /**
   * Endpoint with `{}` where the sysop's own value goes, or null when the
   * provider has no fixed shape (MinIO is self-hosted, local needs none).
   */
  endpointTemplate: string | null;
  /** What the `{}` is, in the sysop's words. Empty when there is nothing to fill. */
  endpointFieldLabel: string;
  defaultRegion: string;
  /** FREE tiers are the point of the pool; PAID is a deliberate choice. */
  volumeClass: 'FREE' | 'PAID';
  /** Free storage in bytes, as a starting QUOTA. 0 when there is no free tier. */
  freeQuotaBytes: number;
  /** FREE means downloads cost nothing; METERED means every GB served is billed. */
  egress: 'FREE' | 'METERED';
  /** Days a deleted object still bills for. 0 for none. */
  minimumRetentionDays: number;
  /** The one line that decides it for a BBS. */
  note: string;
}

const GB = 1024 * 1024 * 1024;

export const STORAGE_PROVIDERS: StorageProvider[] = [
  {
    id: 'r2',
    label: 'Cloudflare R2',
    endpointTemplate: 'https://{}.r2.cloudflarestorage.com',
    endpointFieldLabel: 'Account ID',
    defaultRegion: 'auto',
    volumeClass: 'FREE',
    freeQuotaBytes: 10 * GB,
    egress: 'FREE',
    minimumRetentionDays: 0,
    note: 'Zero egress cost - the best fit for a board that exists to serve downloads.',
  },
  {
    id: 'scaleway',
    label: 'Scaleway',
    endpointTemplate: 'https://s3.{}.scw.cloud',
    endpointFieldLabel: 'Region (fr-par, nl-ams, pl-waw)',
    defaultRegion: 'fr-par',
    volumeClass: 'FREE',
    freeQuotaBytes: 75 * GB,
    egress: 'FREE',
    minimumRetentionDays: 0,
    note: 'Largest free tier at 75 GB (EU). A card is required to open the account.',
  },
  {
    id: 'storj',
    label: 'Storj',
    endpointTemplate: 'https://gateway.storjshare.io',
    endpointFieldLabel: '',
    defaultRegion: 'us-east-1',
    volumeClass: 'FREE',
    freeQuotaBytes: 25 * GB,
    egress: 'METERED',
    minimumRetentionDays: 0,
    note: '25 GB free with 25 GB/month of egress, through the S3 gateway.',
  },
  {
    id: 'b2',
    label: 'Backblaze B2',
    endpointTemplate: 'https://s3.{}.backblazeb2.com',
    endpointFieldLabel: 'Region (eu-central-003, us-west-004)',
    defaultRegion: 'eu-central-003',
    volumeClass: 'FREE',
    freeQuotaBytes: 10 * GB,
    egress: 'FREE',
    minimumRetentionDays: 0,
    note: 'Free egress up to three times what you store. Frankfurt region available.',
  },
  {
    id: 'oracle',
    label: 'Oracle Always Free',
    endpointTemplate: 'https://{}.compat.objectstorage.eu-frankfurt-1.oraclecloud.com',
    endpointFieldLabel: 'Namespace',
    defaultRegion: 'eu-frankfurt-1',
    volumeClass: 'FREE',
    freeQuotaBytes: 10 * GB,
    egress: 'METERED',
    minimumRetentionDays: 0,
    note: 'Never expires. 10 GB/month egress and 50,000 requests.',
  },
  {
    id: 'idrive',
    label: 'IDrive e2',
    endpointTemplate: 'https://{}.idrivee2.com',
    endpointFieldLabel: 'Endpoint prefix',
    defaultRegion: 'us-east-1',
    volumeClass: 'FREE',
    freeQuotaBytes: 10 * GB,
    egress: 'METERED',
    minimumRetentionDays: 0,
    note: 'Consumer-leaning, 10 GB free.',
  },
  {
    id: 'filebase',
    label: 'Filebase',
    endpointTemplate: 'https://s3.filebase.com',
    endpointFieldLabel: '',
    defaultRegion: 'us-east-1',
    volumeClass: 'FREE',
    freeQuotaBytes: 5 * GB,
    egress: 'FREE',
    minimumRetentionDays: 0,
    note: 'IPFS/Sia backed, 5 GB free.',
  },
  {
    id: 'wasabi',
    label: 'Wasabi',
    endpointTemplate: 'https://s3.{}.wasabisys.com',
    endpointFieldLabel: 'Region (eu-central-1, us-east-1)',
    defaultRegion: 'eu-central-1',
    volumeClass: 'PAID',
    freeQuotaBytes: 0,
    egress: 'FREE',
    minimumRetentionDays: 90,
    note: 'Egress included, but a file deleted early still bills for its full 90 days.',
  },
  {
    id: 's3',
    label: 'Amazon S3',
    endpointTemplate: 'https://s3.{}.amazonaws.com',
    endpointFieldLabel: 'Region (eu-central-1, us-east-1)',
    defaultRegion: 'eu-central-1',
    volumeClass: 'PAID',
    freeQuotaBytes: 0,
    egress: 'METERED',
    minimumRetentionDays: 30,
    note: 'The expensive default: $0.09/GB of egress on top of storage.',
  },
  {
    id: 'minio',
    label: 'MinIO / self-hosted',
    endpointTemplate: 'https://{}',
    endpointFieldLabel: 'Host (minio.example.net:9000)',
    defaultRegion: 'us-east-1',
    volumeClass: 'FREE',
    freeQuotaBytes: 0,
    egress: 'FREE',
    minimumRetentionDays: 0,
    note: 'Your own server. No quota unless you set one.',
  },
];

export function providerById(id: string): StorageProvider | undefined {
  return STORAGE_PROVIDERS.find(p => p.id === id);
}

/** Fill a provider's endpoint template with the sysop's one value. */
export function buildEndpoint(provider: StorageProvider, fill: string): string | null {
  if (!provider.endpointTemplate) return null;
  if (!provider.endpointTemplate.includes('{}')) return provider.endpointTemplate;
  return provider.endpointTemplate.replace('{}', fill.trim());
}
