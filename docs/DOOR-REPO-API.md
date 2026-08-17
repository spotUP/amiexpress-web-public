# Door Repo API

A public, read-only HTTP API for browsing and downloading the AmiExpress door
catalog. It is designed to be usable from a real Amiga running an AmigaDOS
TCP/IP stack, not just from a modern HTTP client.

This document is the complete public reference. Every byte-exact example in
it was captured by executing the real server code against the real door
catalog (3301 doors at the time of writing) -- nothing here is invented.
Where the exact revision string differs between a local run and a live
deployment, that is called out explicitly.

## 1. Overview

The door repo is the catalog of door archives (games, utilities, BBS door
programs) available for an AmiExpress sysop to browse, search, and download
onto a real or emulated Amiga BBS. It is served over plain HTTP by the
amiexpress-web backend.

- **Base URL:** `https://bbs.uprough.net`
- **Plain HTTP is supported.** Every endpoint under `/api/door-repo/` also
  answers on `http://bbs.uprough.net` (no TLS required). This is deliberate:
  classic AmigaDOS TCP/IP stacks (AmiTCP, Miami, Roadshow) and 68020+ door
  clients frequently have no practical way to do TLS, so plain HTTP is a
  first-class, permanently supported access path, not a legacy fallback.
- **Deployment requirement.** The production host's reverse proxy (Caddy)
  must explicitly exempt the `/api/door-repo/` path prefix from its automatic
  HTTPS redirect (see `deploy/README.md`), or plain-HTTP requests 308-redirect
  to `https://` and this guarantee does not hold.
- **Read-only.** There are no write endpoints and no authentication. Every
  request in this document is a `GET`.
- **Curation happens in git, not over the API.** The catalog contents
  (which archives exist, their metadata, their categorization) are curated
  in the amiexpress-web git repository. This API only ever reflects what has
  already been committed there -- it has no mechanism to add, edit, or
  remove catalog entries.

### Endpoints at a glance

| Method | Path                              | Purpose                                   |
|--------|------------------------------------|--------------------------------------------|
| GET    | `/api/door-repo/manifest`          | JSON manifest of the catalog (filterable)  |
| GET    | `/api/door-repo/list.txt`          | Plain-text, byte-exact index (filterable)  |
| GET    | `/api/door-repo/archive/:name`     | Download one archive by its archive name   |
| GET    | `/api/door-repo/health`            | Lightweight liveness + door count          |

## 2. Quick start (Amiga, 68020+)

The simplest integration path for a 68K client with no JSON parser is:

1. Fetch `list.txt` over plain HTTP.
2. Parse the header line to learn the format version, revision, and door
   count.
3. Pick a row (by name, by `doorType`, or by searching descriptions).
4. Fetch the corresponding archive by `archiveName`.
5. Compute MD5 (or SHA256) over the downloaded bytes and compare against the
   value in the row you picked.

A literal AmiTCP-style `wget` fetch of the index:

```
wget http://bbs.uprough.net/api/door-repo/list.txt -O T:doorrepo.txt
```

The exact first line of a real response, captured from the running server
against the current catalog:

```
DOORREPO|1|unknown|3301
```

(The revision field reads `unknown` here because this was captured from a
local development build with no baked-in git SHA -- see section 6. A live
deployment reports its actual git commit SHA in that field instead.)

Then fetch one archive by name (using a real row from that same catalog,
`AETRIV10.LHA`, a trivia door):

```
wget http://bbs.uprough.net/api/door-repo/archive/AETRIV10.LHA -O T:AETRIV10.LHA
```

And verify it against the MD5 published for that row (`52ee1086c055fc1c82407dc0961ab04d`,
taken directly from the real `list.txt` row for this archive -- see section 3
for the full row).

## 3. `list.txt` format

`GET /api/door-repo/list.txt` -- also accepts the `?type=` and `?q=` filters
described in section 7.

This is the format intended for AmigaDOS-side clients that have no JSON
parser. It is byte-exact and deliberately simple to parse with `RANDOM` file
I/O or a plain text-file line reader.

- **Encoding:** ISO-8859-1 (Latin-1), one byte per character. The response's
  `Content-Type` header is `text/plain; charset=ISO-8859-1`.
- **Line endings:** CRLF (`\r\n`) throughout, including a trailing CRLF after
  the last data row.
- **Header line** (always the first line):

  ```
  DOORREPO|1|<revision>|<count>
  ```

  where `1` is the fixed literal format version number for this line shape,
  `<revision>` is the repo revision string (see section 6), and `<count>` is
  the number of data rows that follow.

- **Data rows** (one per door, in `archive_name` ascending order,
  case-insensitive):

  ```
  <archiveName>|<doorType>|<archiveSize>|<md5>|<name>|<description>
  ```

| Field         | Type                     | Notes                                                                 |
|---------------|--------------------------|------------------------------------------------------------------------|
| `archiveName` | string                   | The archive's filename, e.g. `AETRIV10.LHA`. Also the download key for section 5. |
| `doorType`    | string                   | e.g. `XIM`, `DD`, `REXX`. See section 7 for the `?type=` filter.       |
| `archiveSize` | integer                  | Archive size in bytes. `0` if unknown.                                 |
| `md5`         | string, or empty         | Lowercase hex MD5 of the archive file. Empty string if the archive file is currently unreadable on the server (a null-checksum row still appears; only the download in section 5 fails). |
| `name`        | string, possibly empty   | Door name from the catalog metadata.                                   |
| `description` | string, possibly empty   | See truncation/collapsing rules below.                                 |

Field-level rules, applied to `name` and `description` (and to
`archiveName`, defensively):

- **Pipe escaping:** any literal `|` character inside a text field is
  replaced with `!` before the row is assembled, so the six pipe-delimited
  fields never get corrupted by a pipe that was part of the original text.
- **Line collapsing (description only):** CR, LF, and TAB runs inside the
  description are collapsed to a single space, so a multi-line source
  description always renders as one physical line in `list.txt`.
- **120-character truncation (description only):** after escaping and
  collapsing, the description is truncated to at most 120 characters.
- **Bytes outside ISO-8859-1 are replaced with '?'.** Source metadata is
  stored as Unicode text and can contain characters with no ISO-8859-1
  representation (accented letters in decomposed form, stray symbols,
  emoji). Each such character becomes exactly one `?` in the output --
  never a multi-byte fallback, silent truncation, or dropped character.

Real example of the pipe-escaping and truncation rules, captured end to end
for archive `24STDCAL.LHA`. The catalog's raw description contains literal
pipe characters (it is ASCII-art box-drawing that uses `|` for vertical
lines):

```
raw description (as returned by GET /manifest, unescaped):
|NEW    ____________   ____________  BRINGS| |ORDER  \    \      \  \           \    YOU| |       /     \     /\ /    \      /\      |
```

The corresponding `list.txt` row (pipes replaced with `!`, then truncated to
120 characters -- note the row is cut off mid-description because the
description field alone exceeds 120 characters after escaping):

```
24STDCAL.LHA|XIM|62882|f44bbb901422c344fd5c2ecb4dea88fd|.------------------------------------------.|!NEW    ____________   ____________  BRINGS! !ORDER  \    \      \  \           \    YOU! !       /     \     /\ /    \ 
```

Real example of the `?` substitution rule, captured for archive `H26VL.LHA`.
Its catalog `name` field is Unicode text using combining diacritics (an "a"
followed by a standalone COMBINING DIAERESIS character, U+0308, twice --
this is valid Unicode but has no single-byte ISO-8859-1 representation):

```
name field from GET /manifest (Unicode, unescaped): "Cp_na<U+0308>ha<U+0308>_Du!!"
```

(shown here as `<U+0308>` for two literal COMBINING DIAERESIS characters,
to keep this document itself pure ASCII -- the real JSON response contains
the actual Unicode code point at each position, not this escape notation)

The corresponding `list.txt` row substitutes `?` for each out-of-range
character:

```
H26VL.LHA|XIM|41974|ca325b47ec3561ca892cb1c2b15ec979|Cp_na?ha?_Du!!|___/   __/___  ___/  ___/___ O\____   /    \-\____   /    \-------------O /    _/    //  /     /    //   iN 1994
```

### Append-only format-evolution promise

`list.txt` and the JSON manifest (section 4) will only ever grow new fields
by appending them. A client parsing `list.txt`:

- **MUST split each data row on `|` and read only the first six fields by
  position.** A future format revision may append a seventh, eighth, etc.
  field to the end of each data row. Existing fields never change position,
  meaning, or type.
- **MUST ignore any trailing fields it does not recognize.**
- **MUST treat the header line's version number (`DOORREPO|1|...`) as the
  authority for what fields to expect.** That number is bumped only when a
  field is appended; it is never bumped for a field removal or a
  meaning change of an existing field (see section 9).

## 4. JSON manifest

`GET /api/door-repo/manifest` -- also accepts `?type=` and `?q=` (section 7).

Returns a `DoorRepoManifest` JSON object:

```json
{
  "formatVersion": 1,
  "revision": "<repo revision string>",
  "generatedAt": "<ISO 8601 timestamp>",
  "doors": [ /* array of door objects */ ]
}
```

Each entry in `doors` has this shape:

| Field          | Type             | Notes                                                          |
|----------------|------------------|------------------------------------------------------------------|
| `archiveName`  | string           | Download key for section 5.                                     |
| `doorType`     | string           | e.g. `XIM`, `DD`, `REXX`.                                        |
| `name`         | string or null   |                                                                    |
| `author`       | string or null   |                                                                    |
| `releaseGroup` | string or null   |                                                                    |
| `category`     | string or null   |                                                                    |
| `description`  | string or null   | Raw text, not escaped or truncated (unlike the `list.txt` field). |
| `fileIdDiz`    | string or null   | Raw FILE_ID.DIZ contents, if any, newlines included.             |
| `archiveSize`  | integer or null  | Bytes.                                                            |
| `md5`          | string or null   | Lowercase hex. `null` if the archive file is currently unreadable on the server. |
| `sha256`       | string or null   | Lowercase hex. `null` under the same condition as `md5`.         |

Real full response, captured for one door (`AETRIV10.LHA`, filtered with
`?q=AETRIV10` for brevity -- the unfiltered response is the same shape with
3301 entries in `doors`):

```json
{
  "formatVersion": 1,
  "revision": "unknown",
  "generatedAt": "2026-08-17T10:16:09.642Z",
  "doors": [
    {
      "archiveName": "AETRIV10.LHA",
      "doorType": "XIM",
      "name": "*** /X Door Trivia ***",
      "author": null,
      "releaseGroup": null,
      "category": null,
      "description": null,
      "fileIdDiz": "*** /X Door Trivia ***\n",
      "archiveSize": 16080,
      "md5": "52ee1086c055fc1c82407dc0961ab04d",
      "sha256": "d918a826c5ea694ba2aca4a5e18f464f5947c59d85e6d1e15cc14341e805b367"
    }
  ]
}
```

Real response headers for the unfiltered `GET /manifest` (values other than
`content-length` and `generatedAt` are stable across requests until the
catalog changes):

```
X-Door-Repo-Revision: unknown
ETag: "unknown"
Content-Type: application/json; charset=utf-8
```

### ETag / conditional GET

Every `/manifest` response carries a strong `ETag` header whose value is
exactly the repo revision, quoted: `ETag: "<revision>"`. Conditional GET
follows standard HTTP semantics (RFC 7232) in full:

- Send `If-None-Match: "<revision>"` (or the value from a previous `ETag`
  header) on a repeat request. If the revision has not changed, the server
  responds `304 Not Modified` with an empty body.
- A weak validator (`If-None-Match: W/"<revision>"`) still matches -- this
  server's ETags are strong, but RFC 7232's weak-comparison rule for
  `If-None-Match` means a weak candidate from an intermediate cache or proxy
  is honored.
- A comma-separated list of candidates is honored: a match anywhere in the
  list triggers `304`.
- The wildcard `If-None-Match: *` always matches (any current
  representation) and triggers `304`.
- `Cache-Control: no-cache` on the request forces revalidation and returns
  `200` even when `If-None-Match` would otherwise match exactly -- this is
  the standard end-to-end-reload override (RFC 9111).

Real captured 304 response (second request, `If-None-Match` set to the ETag
from the first response):

```
status: 304
X-Door-Repo-Revision: unknown
ETag: "unknown"
body: (empty)
```

## 5. Archive download

`GET /api/door-repo/archive/:archiveName`

`:archiveName` is the exact `archiveName` value from a manifest or
`list.txt` row (e.g. `AETRIV10.LHA`). Matching is case-insensitive.

On success (`200`), the response is the raw archive bytes with these
headers:

| Header               | Meaning                                                        |
|-----------------------|------------------------------------------------------------------|
| `Content-Length`      | Exact byte count of the archive, taken from the same file handle that streams the body (no size/body mismatch is possible). |
| `Content-Type`        | Always `application/octet-stream`.                               |
| `X-Archive-MD5`       | Lowercase hex MD5 of the archive bytes.                          |
| `X-Archive-SHA256`    | Lowercase hex SHA256 of the archive bytes.                       |
| `X-Door-Repo-Revision`| The repo revision, same value as `/manifest` and `/health`. Present on every `/api/door-repo/*` response, including error responses. |

Real captured headers for `GET /api/door-repo/archive/AETRIV10.LHA`:

```
status: 200
Content-Length: 16080
Content-Type: application/octet-stream
X-Archive-MD5: 52ee1086c055fc1c82407dc0961ab04d
X-Archive-SHA256: d918a826c5ea694ba2aca4a5e18f464f5947c59d85e6d1e15cc14341e805b367
X-Door-Repo-Revision: unknown
```

Note these are the exact same `md5`/`sha256` values published for this
archive in section 4's manifest entry and section 3's `list.txt` row -- all
three sources are backed by the same checksum computation.

### 404: unknown or unavailable archive

If `:archiveName` does not match any catalog entry, or the catalog entry
exists but its archive file is not currently present/readable on the
server, the response is `404` with a plain-text body:

```
NOT FOUND: <archiveName>\r\n
```

Real captured example for a nonexistent archive name:

```
status: 404
Content-Type: text/plain; charset=utf-8
body: "NOT FOUND: DOES_NOT_EXIST_XYZ.LHA\r\n"
```

A malformed or path-traversal-shaped `:archiveName` (e.g. a URL-encoded
`../../etc/passwd`) behaves identically: it simply fails to match any
catalog entry and 404s the same way, with the same body shape. The archive
name is never used to build a filesystem path directly -- it is only ever
used as a lookup key into the catalog, and the catalog's own stored path is
what gets opened.

## 6. Update detection

Every `/api/door-repo/*` response carries an `X-Door-Repo-Revision` header,
and `/health` and `/manifest` both surface the same value in their JSON
bodies (`revision`). This value changes exactly when the deployed catalog
changes (it is the deployed image's git commit SHA in a live deployment; see
the caveat below for local development).

Two ways to detect that the catalog has changed since you last fetched it:

1. **Plain-text / header-based clients:** remember the `<revision>` field
   from the `list.txt` header line (or the `X-Door-Repo-Revision` header on
   any response) and compare it to the value on your next fetch. A changed
   value means the catalog changed; re-fetch `list.txt` (or `/manifest`) in
   full.
2. **JSON / HTTP-aware clients:** use conditional GET against `/manifest` as
   described in section 4 -- send `If-None-Match` with the last-seen `ETag`
   and treat a `304` as "no change, nothing to re-fetch."

Local development caveat: the revision string is read from a file
(`/app/.git-sha`) written into the server's container image at build time.
A local development server with no such file falls back to the literal
string `"unknown"` -- which is what every example in this document shows,
since they were all captured from a local run. A live deployment always
reports its real git commit SHA in this field instead.

## 7. Filters

Both `GET /manifest` and `GET /list.txt` accept the same two optional query
parameters, and they compose (both may be given together):

| Parameter | Behavior                                                                                   |
|-----------|-----------------------------------------------------------------------------------------------|
| `?type=`  | Exact, case-sensitive match against `doorType` (e.g. `XIM`, `DD`, `REXX`).                    |
| `?q=`     | Case-insensitive substring match against `archiveName`, `name`, `author`, `releaseGroup`, `description`, and the catalog's internal install-target field. Matches if the substring appears in *any* of those fields. |

Real example: `GET /api/door-repo/manifest?type=DD` against the live
catalog returned 10 doors; one of them (picked here for a clean,
human-readable `name` field -- the actual first row in `archiveName` order
is a different, ASCII-art-named entry):

```json
{
  "archiveName": "AVH-BC01.LHA",
  "doorType": "DD",
  "name": "AVH-BaudCheck v0.1",
  "author": null,
  "releaseGroup": "AVH",
  "category": "DD-Reference",
  "archiveSize": 9256,
  "md5": "d184a28e733083b9de6b2f9352065abc",
  "sha256": "d219ce1b071797e47a13725eb498b946d12647b61eb67e9e9c49ecd1a4f5624a"
}
```

(`description` and `fileIdDiz` omitted above for brevity -- they are present
in the real response and are ASCII-art banner text, unrelated to the filter
demonstration.)

Real example: `GET /api/door-repo/list.txt?type=DD` against the same
catalog produced the header line:

```
DOORREPO|1|unknown|10
```

Real example: `GET /api/door-repo/manifest?q=trivia` matched exactly one
door, `AETRIV10.LHA` (the same door used throughout sections 2-5) -- `q`
matched because the substring `trivia` appears in its `name` field
(`*** /X Door Trivia ***`).

## 8. Checksum verification walkthrough

Every archive is published with both an MD5 and a SHA256 checksum, computed
over the exact bytes of the archive file. **MD5 is the minimum a client
should verify** -- it is fast to compute even on 68K hardware and is
sufficient to catch a truncated or corrupted download. **SHA256 is also
available** for any client or workflow that wants stronger integrity
verification.

Steps:

1. Fetch the archive's row from `list.txt` (or its entry from `/manifest`)
   and note its `md5` (and, if you want it, `sha256`) field.
2. Fetch `GET /api/door-repo/archive/<archiveName>`.
3. Compute MD5 (and/or SHA256) over the full response body.
4. Compare against the value from step 1. They must match exactly
   (lowercase hex, both sides).

As a cross-check, the archive download response also carries the same
checksums as response headers (`X-Archive-MD5`, `X-Archive-SHA256`; section
5), computed independently at download time from the same file. If a
client's locally computed checksum, the catalog-row checksum, and the
download's response-header checksum ever disagree, that indicates either a
corrupted download in transit or a stale/inconsistent catalog entry on the
server -- worth reporting either way.

For the worked example used throughout this document (`AETRIV10.LHA`):
catalog-row `md5` = `52ee1086c055fc1c82407dc0961ab04d`, and the same value
was independently returned in the `X-Archive-MD5` header on the actual
archive download in section 5. Both were captured from the same live run of
the real server, confirming they agree in practice, not just in
specification.

## 9. Stability promise

- **`formatVersion`** (in the JSON manifest) and the leading version number
  in the `list.txt` header line (`DOORREPO|1|...`) are bumped only when the
  format changes in a way a naive parser could not safely ignore. As of this
  writing, both are `1`.
- **Fields are append-only.** New fields may be added -- to the end of each
  `list.txt` data row, or as new keys in each JSON door object -- without a
  version bump, as long as existing fields keep their position, name,
  meaning, and type. A conforming parser MUST ignore trailing fields (or
  unrecognized JSON keys) it does not know about, exactly as instructed in
  section 3.
- **No field is ever removed or repurposed without a major version bump.**
  Removing a field, changing what an existing field means, or changing an
  existing field's type is a breaking change and will always come with an
  incremented `formatVersion` / header version number, announced ahead of
  the change taking effect on the live API.
- **Endpoint paths and HTTP semantics (status codes, header names, the
  read-only nature of the API) are considered stable** and are not expected
  to change independent of a documented, versioned format change.
