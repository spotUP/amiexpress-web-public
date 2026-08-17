/**
 * GENERATED FILE -- DO NOT EDIT BY HAND.
 *
 * Extracted verbatim from ../../web/backend/src/doors/door-repo-manifest.ts by scripts/gen-repo-types.ts.
 * Regenerate with: npx tsx scripts/gen-repo-types.ts
 * (run whenever door-repo-manifest.ts's manifest shape changes upstream)
 */

export interface ManifestDoor {
  archiveName: string;
  doorType: string;
  name: string | null;
  author: string | null;
  releaseGroup: string | null;
  category: string | null;
  description: string | null;
  fileIdDiz: string | null;
  archiveSize: number | null;
  md5: string | null;
  sha256: string | null;
}

export interface DoorRepoManifest {
  formatVersion: 1;
  revision: string;
  generatedAt: string;
  doors: ManifestDoor[];
}
