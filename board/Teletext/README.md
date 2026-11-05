# Teletext service packs

Each directory here is one teletext service the board can browse with the
`TELETEXT` door. A pack is a recovery plus a manifest:

```
Teletext/<service-id>/
  service.json          the manifest
  pages/P100-0000.tti   one page per file
  pages/P1a0-0000.t42   raw 42-byte packets, as the archives publish them
```

`pages/` is optional - an archive unpacked straight into the service
directory is read the same way.

## service.json

```json
{
  "id": "ceefax-1988",
  "title": "Ceefax 1988",
  "source": "https://example.invalid/the-archive-this-came-from",
  "credit": "who recovered it",
  "licence": "what its terms are",
  "homePage": "100",
  "subset": "english",
  "notes": "anything worth knowing about this recovery"
}
```

Only `title` really matters to a caller. `source` and `credit` matter to the
people whose work this is: teletext survives because enthusiasts pulled it
off home VHS tapes one frame at a time, and a pack that does not say where
it came from loses that.

`subset` is the G0 national option sub-set the service was written in
(`english`, `swedish_finnish`, `german`, `french`, `italian`,
`portuguese_spanish`, `czech_slovak`). Get it wrong and the thirteen
substituted positions print as `{|}[\]` where the letters belong.

## Page files

- **`.t42`** - raw teletext packets, 42 bytes per line, exactly what the
  recovery community publishes. Named `Pmpp-ssss.t42`: magazine, page,
  subpage. Both raw and PES-framed files are read, and the byte order is
  detected.
- **`.tti`** - the line-oriented text format teletext editors use. Control
  bytes are written transposed (`0x00-0x1F` as `0x80-0x9F`) and the `\xNN`
  escape form is accepted, which is what makes a `.tti` file readable and
  diffable. `Teletext/uprough-demo/pages/` is written this way and is the
  shortest worked example.

A file that will not parse is reported and skipped. It never costs the pack
its other pages - these recoveries are lossy by construction.

## Installing a real archive

```
npx tsx dev/scripts/teletext/import-archive.ts <source> --id <service-id> [options]
```

`<source>` may be an http(s) URL, a local `.zip`, `.7z`, directory, or a
single page file. `--help` lists every option.

What the published archives actually look like, which is what the importer
was built against:

- **teletext-restoration** (github.com/teletext-restoration) catalogues
  recoveries by year, 1978-2012. The files themselves are hosted as `.7z`
  at `temp.zxnet.co.uk/teletext-recoveries/`. Restored pages are named
  `Pmpp-ssss-hhmm-hhmm.t42`, with `-maybe` for a page the restorers were
  not certain about and `-nocrc` for one the broadcast carried no checksum
  for. The importer keeps those names and counts them for you: that is the
  recovery's own statement about its confidence, and flattening it would
  present a guess as a record.
- **Raw recoveries** are whole captures named
  `Channel-Date-Start-End-CRC32.t42` and hold many pages in one file. Import
  them the same way; the pages are separated by their header packets.
- **Nigel Reed's archive** (teletext.nigelreed.net) links the recovery sites
  and accepts `.t42` submissions.

A `.7z` is unpacked by shelling out to 7-Zip (`brew install sevenzip`, or
`apt install p7zip-full`). If no binary is found the importer says so and
tells you to unpack it yourself and point at the folder.

**Credit travels with the pages.** These recoveries exist because people
pulled them off their own VHS tapes one frame at a time. Any notes or
readme in the archive is kept as `RECOVERY-NOTES.txt` in the pack, and
`--credit` / `--source` go into the manifest. Fill them in.

## Where the code is

Nothing about the format lives in the door. The packet engine, the page
graph and the per-session renderer are all in `sdk/teletext`; the door is
only keys and views.
