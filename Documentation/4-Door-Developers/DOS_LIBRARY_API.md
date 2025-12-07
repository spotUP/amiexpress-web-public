# dos.library API Reference (Summary)
**Detailed mapping between dos.library calls and express.e lives in the archive (`archive/AMIEXPRESS_DOOR_SOURCES_ANALYSIS.md`, `archive/DOOR_IO_SYSTEM.md`).**

## 1. Purpose
- AmiExpress doors rely on `dos.library` for file operations, path lookups, and directory scans; our TypeScript emulation exposes the same functionality through `FileSystem` abstractions.
- `dirX` parsing now mirrors dos.library’s behavior: art lines go into the continuation block, data lines fill the file metadata, and the data structure remains aligned with express.e.

## 2. Key Behaviors
- Directory scans supply `DiskObject` info exactly as `Dir1` entries expect; the file listing purposely stops after 80 columns and uses 33-space continuation blocks for art.
- Uploads call the same sequence of commands (Open, Read, Write, Close), and the backend now creates missing Dir files automatically, matching the original dos library’s tolerance for absent directories.
- Logging and error codes follow the same semantics (invalid upload session, missing Dir file, command collisions). If a door sees `102` or `202`, the underlying reason is now reflected in the logs.

## 3. Reference Materials
- If you need byte-level dos.* mapping, consult `archive/DOS_LIBRARY_API.md` (the previous long-form doc) and `archive/AMIEXPRESS_DOOR_SOURCES_ANALYSIS.md` which break down the actual binaries.
- For file scanning or ASCII art concerns, use the `Documentation/7-Reference Sources/petscii-bbs-2.1/` exports and cross-check with `dir-file.util.ts` to see how the art detection works.

Keep these summaries in mind; the archive contains actual disassembly and binary references while this file explains how to read or extend the APIs.
