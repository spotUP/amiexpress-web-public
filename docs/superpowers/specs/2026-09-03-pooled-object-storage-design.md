---
date: 2026-09-03
topic: Pooled object storage - a board's file areas live across several buckets, free tier or paid
tags: [storage, s3, file-areas, drives, doors, admin, architecture]
status: draft
---

# Pooled object storage - design

## Problem

A board's file areas are bounded by the disk under its container. On the
Hetzner host that runs this board, that disk is also what holds the Docker
images, the node logs and every door - it has already filled once and taken
the board down with it. Sysops running this software elsewhere have the same
ceiling and a smaller budget.

There is free object storage worth roughly 130-145 GB spread across providers
that all speak the S3 API. No single one of them is large enough to matter;
together they are more storage than most boards will ever need. A sysop who
outgrows that, or who wants a volume that will not vanish with a closed free
account, buys one - from the same list of providers, through the same API. The
board should be able to use all of them as one pool.

The admin has a Drive Setup page that would seem to be about exactly this. It
reaches nothing.

## What Drive Setup does today

`DriveConfigService` (`web/backend/src/services/config-services/drive-config.service.ts`)
parses `DRIVE.n` tooltypes out of `Drives.info`, falls back to the SQL mirror
when the file is missing, and serves `/api/config/drives` CRUD for
`DrivesPage.tsx`. Nothing else in the backend reads the drive list - the only
non-config reference in the tree is the route itself.

In AmiExpress the file has exactly one consumer. `express.e:17400-17424`
`freeDiskSpace()` walks `DRIVE.1..n`, sums `rFreeSpace()` over them, and
returns the total the board prints as "N available for uploading". It also
hard-errors when `Drives.info` is missing. Drives are not where files live;
they are how the board knows how much room it has.

This port already replaced that calculation. `file.handler.ts:764-790` computes
free space with `fs.statfsSync` (or `df`) against the upload area's own path,
under a comment noting that both of express.e's values collapse to one disk in
a single-filesystem web setup. So the page's data feeds a calculation nobody
performs any more.

Pooling buckets restores the original meaning: a drive is a place with a
capacity, and the board's free space is the sum across drives.

## Decisions

Settled with the sysop before this document:

1. **Purpose:** capacity for file areas, not backup and not a download CDN.
2. **Reach:** everything, including 68K doors, via a local cache.
3. **Authority:** the pool is authoritative; local disk is a cache.
4. **Writes:** write-back when the file handle closes.
5. **Config home:** Drive Setup becomes the storage page.
6. **Provider:** none. This BBS ships to many sysops, so the design targets the
   S3 API and treats any one provider as a row in a table.
7. **Durability:** one copy per file. The sysop carries that risk knowingly,
   and the admin has to make the exposure visible rather than pretend it away.
   A paid volume is the sane home for anything the board itself produced,
   which is what the per-area volume-class preference is for.

## Why not a FUSE mount

Mountpoint for Amazon S3 mounts a bucket as a filesystem, and this codebase is
unusually well suited to it: `DosLibrary` buffers a whole file in memory, `Seek`
moves a position inside that buffer, and `Close()` flushes it with a single
`amigafs.writeFileSync` (`DosLibrary.ts:866`). Every door write is therefore
create-truncate-write-sequentially-close, which is the one write pattern
Mountpoint supports (`--allow-overwrite`). Its documented limits - no random
writes, no read-while-writing, no file locking, no directory rename - collide
with almost nothing here; the port's only lockfile is `msgidnr.lck` in the
message base, and the single rename is `file-maintenance.handler.ts:664`.

It is still the wrong choice for this product. Mountpoint is AWS's client for
AWS's storage; the pool is deliberately not AWS. The general-purpose mounts
(rclone, geesefs, s3fs) vary in semantics per provider, need FUSE inside the
container, cannot run on a macOS development machine, and cannot be exercised
in CI. A sysop who wants a mount can still have one - a mounted directory is
just a path, and a local `DRIVE.n` will happily point at it - but the board
cannot depend on that.

## Architecture

A new subsystem, `web/backend/src/storage/`:

- **`StorageBackend`** - the interface: `head`, `get`, `put`, `delete`, `list`.
  `S3Backend` implements it with `@aws-sdk/client-s3`, which takes an
  `endpoint`, so Cloudflare R2, Backblaze B2, Storj, Scaleway, Oracle,
  Filebase, IDrive e2 and MinIO are all one adapter. `LocalBackend` is the
  default passthrough.
- **`VolumeSet`** - the configured drives: for each, its backend, a
  sysop-declared quota, an egress posture, and measured usage, request count
  and egress for the month.
- **`Placement`** - chooses the volume for a new object. Requires room, skips a
  volume at its request ceiling, fills free volumes before paid ones, and
  breaks ties towards free egress. A file area may name a preferred volume
  class, so a sysop who pays for one volume can keep the board's own files
  there and leave re-downloadable archives on the free tiers. It does not track
  how often a file is read; nothing moves between volumes after it is written.
- **`FileCache`** - owns one local directory and decides what is resident. Two
  entry points, deliberately: `ensureLocal(path): Promise<string>` for the
  BBS's async handlers, and `ensureLocalSync(path): string` for the emulator,
  which blocks on the same deasync pump `BsdSocketLibrary.recv()` already uses.
  The synchronous door is legal only inside the emulator thread; that is the
  unit's contract.
- **`NameIndex`** - per remote area, maps a caller's spelling to the real
  object key.
- **`RemoteAreas`** - answers "is this real path inside a remote-backed area".

### The seam is not amigafs

`web/backend/src/utils/amigafs.ts` is the case-insensitive filesystem facade -
25 functions, 51 consumers, every path-based read and write in the port. It is
the obvious place to put a cache and the wrong one: it is synchronous, so a
fetch inside it would put blocking network I/O on the Express event loop and
stall the whole board while one caller's file downloads.

Instead the two callers that already know whether they are asynchronous
materialise the file first. The transfer and listing handlers `await`;
`DosLibrary.Open` blocks inside the emulator, where blocking is already how
the socket library works. `amigafs` stays pure, and its case-insensitive
resolution keeps working because it only ever sees cached local files.

## Data flow

**Listing.** No bytes move. Where the port stats the disk to answer "does this
exist and how big is it" - `batch-download.handler.ts:280-286`,
`fs.existsSync` and `fs.statSync` after `amigafs.resolvePath` - a remote area
answers from `StorageBackend.head` and the `FileEntry` rows.

**Download.** `resolveFile()` returns its descriptor only after
`await cache.ensureLocal(key)`, so `fullPath` is a real cached file and Zmodem
streams from it unchanged. A cold first fetch happens during the beat where
the board already prints its transfer banner; the second download is free.

**Upload.** The caller's Zmodem always writes into the node's local playpen; a
truncated temp file is recoverable and a truncated object is not. FILE_ID.DIZ
extraction runs on that local copy. The move into the area - today
`fsp.rename(srcPath, destPath)` at `file-maintenance.handler.ts:664` - forks: a
local area renames as now, a remote area puts the object, records the volume
on the catalog row, unlinks the playpen copy and hands the file to the cache
as already-resident.

**Door open.** `DosLibrary.Open` resolves `realPath` at `:696`; if that path is
inside a remote area it calls `cache.ensureLocalSync(realPath)` before the
existing `amigafs.readFileSync` at `:718`. The door sees an ordinary file.

**Door close, and every other write.** `Close()` keeps flushing through
`amigafs.writeFileSync` at `:866` to the cached path; the cache then puts the
object and marks the entry clean. In the emulator that put blocks, so when
`Close()` returns the object is durable and the door can reopen and read back
what it wrote - the guarantee a local disk gives it.

**Free space.** The upload gate at `file.handler.ts:780` sums the pool instead
of stating the local disk, which is `freeDiskSpace()`'s original meaning.

## Failure handling

Single copy makes "unreachable right now" and "gone for ever" two distinct
states, and neither may be confused with "no such file".

- **Volume down or rate-limited.** Reads retry with backoff, then fail as
  *unavailable*. The catalog entry stays, the caller is told the file cannot be
  fetched right now, the admin marks the volume degraded. A fetch failure must
  never fall into the existing not-found path - that is how a sysop deletes
  catalog rows for files that were fine.
- **Volume gone.** Because the catalog records volume-per-object, the admin can
  list what died with a closed account, mark those entries missing and export
  the list. That report is the whole mitigation single-copy gets, so it ships
  with the feature.
- **Quota exhaustion.** Placement writes where there is room; the upload gate
  refuses a caller before the transfer starts rather than at the byte where the
  last volume filled.
- **Request and egress budgets.** Per-volume monthly counters. Oracle's 50,000
  requests a month is a harder limit than its 10 GB, and B2's free egress is
  three times what is stored. The per-area `NameIndex` exists so listings cost
  one call per area per change instead of one per lookup.
- **The cache.** Clean entries evict LRU; dirty entries are pinned, and if the
  cache disk fills with them the upload becomes blocking. A failed put keeps
  the local copy and leaves the entry pending. The cache is never allowed to
  delete the only copy of anything, and a pending journal survives restart so a
  crash mid-upload resumes.
- **Partial uploads.** A put either completes or leaves no object, so a
  truncated archive never appears complete. A single put carries up to 5 GB,
  which is above anything a file area holds; past that the put refuses by name
  rather than truncating, and multipart is a later addition.
- **Two nodes on one file.** Last close wins - the semantics the local disk
  gives today. S3 offers no locking to improve on it.

## Configuration

`Drives.info` keeps its shape and gains sub-keys. `express.e` reads `DRIVE.n`
by number and ignores tooltypes it does not know, so the file stays readable by
a real AmiExpress binary:

```
DRIVE.1=BBS:Files
DRIVE.2=s3://uprough-cold
DRIVE.2.ENDPOINT=https://s3.eu-central-003.backblazeb2.com
DRIVE.2.REGION=eu-central-003
DRIVE.2.QUOTA=10G
DRIVE.2.EGRESS=3X
DRIVE.2.CLASS=FREE
DRIVE.2.KEYID=00512...

DRIVE.3=s3://uprough-paid
DRIVE.3.ENDPOINT=https://s3.eu-central-1.wasabisys.com
DRIVE.3.QUOTA=2T
DRIVE.3.EGRESS=METERED
DRIVE.3.CLASS=PAID
DRIVE.3.RETENTION=90D
DRIVE.3.KEYID=WAS...
```

`CLASS` drives the fill order (free first, then paid) and `RETENTION` is what
lets the admin warn before a delete that will still be billed.

A local path stays a local path, so a board that configures no bucket is
unchanged.

**The secret is not in `Drives.info`.** That file sits under the board root
where every door can read it and every backup carries it. The key lives in
`Storage/<volume>.key`, one line, `0600`, written the way
`door-launch-token.ts:44-52` writes `DoorRepo.token`, including its tolerance
for filesystems without POSIX modes. `BBS_STORAGE_<n>_SECRET` overrides it, so
a sysop can keep secrets out of the data dir entirely.

**Flags store their negative** (`DRIVE.n.NOCACHE`, never `DRIVE.n.CACHE`): a
tooltype absent on every existing board must read as the safe default.

**Drive Setup, rebuilt.** Each row is a volume - type, free or paid, used
against quota, request and egress budget for the month, any minimum-retention
period, a degraded badge, a test-connection button, and what lives on this
volume, which single-copy makes mandatory. The
API never returns a secret: write-only field, masked display, sysop-only routes
on the existing auth. Design-system components only.

## Testing

A `FakeBackend` implements `StorageBackend` in memory, so every test runs
without a network. It models what breaks: quota, monthly request counter,
egress counter, and induced down / rate-limited / slow / gone states.

Unit: placement picks a volume with room and skips one at its request ceiling;
the cache evicts clean LRU, pins dirty, and replays its journal after a
simulated crash; the name index resolves `file.lha` to `FILE.LHA` and refreshes
on put and delete.

Through the real entry points, because a passing unit test is not reach:

- Download drives `batch-download.handler`'s resolve-and-send against a remote
  area: bytes reach the socket, the backend saw exactly one `get`, a second
  download sees zero.
- Upload drives the upload handler: the transfer lands in the playpen, the
  object is put, the catalog row records the volume, the playpen copy is gone.
- A door drives `DosLibrary` Open/Read/Close on a remote path through the
  emulator harness: it reads the bytes, `Close()` uploads, a re-open reads back
  what it wrote.
- The free-space gate reports the pool sum and still refuses below the 2 MB
  floor.

Failure tests pin the user-visible strings: a down volume reads as unavailable
and not as not-found; a full pool refuses before the transfer starts; a failed
put keeps the local copy and a restart re-uploads it.

A MinIO-in-docker suite covers real S3 semantics, opt-in behind an env var the
way the corpus tests are. Everything else runs in the normal glob.

## Volumes a sysop can use, as of 2026-09-03

All sysop-declared in configuration, never hardcoded - these numbers move. The
adapter is the same for every row: they all speak the S3 API.

### Free tiers

| Provider | Free storage | Egress | Notes |
|---|---|---|---|
| Scaleway | 75 GB (EU) | included | largest single tier, card required |
| Storj | 25 GB | 25 GB/mo | S3 gateway |
| Cloudflare R2 | 10 GB | unlimited free | 1M class-A, 10M class-B ops/mo |
| Backblaze B2 | 10 GB | 3x stored/mo | Frankfurt region available |
| Oracle Always Free | 10 GB | 10 GB/mo | never expires, 50k requests/mo |
| Filebase | 5 GB | free | IPFS/Sia backed |
| IDrive e2 | 10 GB | - | consumer-leaning |

### Paid volumes

A sysop who outgrows the free tiers, or who wants a volume that will not
disappear with a closed account, adds a paid one to the same pool. For a BBS
the deciding number is egress, not storage: a board exists to serve downloads,
and the storage rate is a rounding error next to a per-GB egress bill.

| Provider | Storage | Egress | Minimum retention | Notes |
|---|---|---|---|---|
| Backblaze B2 | ~$6.95/TB/mo | free to 3x stored, then $0.01/GB | none | cheapest with real free egress |
| Wasabi | ~$7.99/TB/mo | included, capped at stored volume | **90 days** | early delete still bills |
| Hetzner | ~EUR 5.94/TB/mo | included allowance | none | same datacentre as this board |
| Cloudflare R2 | ~$15/TB/mo | **zero** | none | best when downloads dominate |
| Amazon S3 | ~$23/TB/mo | $0.09/GB | 30 days on IA classes | the expensive default |
| Google Cloud | ~$20/TB/mo | $0.12/GB | class-dependent | |

Two traps worth carrying into the admin UI:

- **Minimum retention is a bill, not a policy.** Deleting a file from Wasabi
  before 90 days still costs its 90 days. A sysop pruning an old file area on a
  retention-bound volume should be told so before the delete, not after the
  invoice.
- **"Free egress" usually has a fair-use ceiling.** B2's is three times stored
  volume; Wasabi's is the stored volume itself. The per-volume egress counter
  from the failure section is what makes that visible before a provider raises
  it.

Consumer drives (Google Drive, MEGA, pCloud) add capacity but each needs its
own adapter and OAuth, and their terms are hostile to this use. A later volume
type, not this design.

## Out of scope

- More than one copy of a file. Decided against; the admin's per-volume
  contents report is what stands in for it.
- Consumer drive providers.
- Moving anything but file areas. Screens, message bases, user data and the
  `Doors/` tree stay on local disk.
- Automatic tiering by age or temperature. An area is local or remote.
