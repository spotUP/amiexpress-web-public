---
date: 2026-09-07
topic: FTP server - design
tags: [ftp, transfers, storage, parity]
status: draft - three decisions open, see section 9
---

# FTP server - design

Research behind this: `thoughts/shared/research/2026-09-07_ftp-server-parity.md`.
That document is the parity reference; this one says what gets built.

## 1. What this is

A real FTP server, serving this board's file areas to a standard FTP client,
with the same rules the BBS applies to `F`, `D` and an upload - because they are
the same rules read from the same places, not a second copy of them.

**Non-goals.** No MKD/RMD/DELE/RNFR: express.e has none and neither will this -
an FTP client cannot restructure a board. No anonymous access. No FXP. No
message bases over FTP.

**Deletion, first commit:** `node-manager.service.ts`'s `startFTPTransfer`
simulates a transfer with `setTimeout(3000)` and completes it with
`'ftp_checksum_placeholder'`, under a comment claiming FTP is implemented. It
opens no socket and records transfers that never happened. It goes, with its
protocol registration, before anything is built.

## 2. Shape

    web/backend/src/ftp/
      ftp-server.ts        control socket, one FtpSession per connection
      ftp-session.ts       the command loop and its state (user, conf, subdir, TYPE, REST)
      commands/*.ts        one file per verb group, each a pure function of (session, args)
      ftp-filesystem.ts    the VIRTUAL tree: conferences -> DIR-file entries
      ftp-data-channel.ts  PASV/PORT sockets, throttling, REST offsets
      ftp-auth.ts          USER/PASS against the same bcrypt path the BBS uses

Started from `server/initialization.ts` when `system_config.ftp_enabled` is set,
the way other optional services are; never at import time.

## 3. The virtual filesystem - the heart of it

**Root** lists one directory per conference the caller may see:

    checkConfAccess(user, conf) AND NOT conf.exclude_ftp

named `%03d-%s` (`001-Lamer Zone`), with `FTPDIRNAME` overriding the name and
slashes stripped. This is express.e's rule verbatim; there is no FTP ACS bit and
none is invented.

**Inside a conference** the listing is built from that conference's `DIR1..DIRn`
(n = `NDIRS`) through `utils/dir-file-reader.util.ts`, not from a directory
scan, because the DIR files are what this board's listings are made of - the SQL
`file_entries` mirror is only ever written by a web upload. `FTP_DIR_DAYS`
bounds how far back the listing reaches.

**A file's bytes** are resolved exactly the way `D` resolves them: through
`storage/remote-download.ts` when the area is pooled, and from disk otherwise.
A pooled area holds objects in a bucket and nothing on local disk, so an FTP
server that streamed the conference directory would serve an empty area.

## 4. Sessions, auth, and accounting

- `USER`/`PASS` against `database.verifyPassword` (bcrypt), the same call
  `auth.handler.ts:59` makes. `430 Invalid username or password` on failure,
  and no command but `USER`/`PASS`/`QUIT`/`FEAT`/`NOOP` is answered before login.
- On success the session reports time remaining, as express.e does
  (`230 Time remaining for today <n> mins.`).
- Every command is written to the CallersLog as `\tFTP Command >: <verb>`, the
  format express.e writes, so an FTP session reads like any other in the log.
- Whether a session occupies a node is decision 9.3.

## 5. Download

`RETR` runs the board's own gate before a byte moves: the ratio and byte-limit
machinery that `D` uses (`todaysBytesLimit`/`dailyBytesDld`, free-file flags),
refusing with `550` and the reason. `REST` sets a byte offset; `SIZE` and `MDTM`
answer from the DIR entry, not from a `stat` - the DIR line is the record.
Completed transfers update the same download counters a `D` does.

## 6. Upload

`STOR` follows the BBS upload path and nothing shorter:

1. refused with the conference's `NO_FTP_UPLOADS` message when set
2. `validateFilename`, then the dupe check (`checkForFile`)
3. written to the node's playpen, never straight into an area
4. archive-tested (the `FCheck` path), and held on failure like any upload
5. filed by the existing upload finisher, which writes the DIR entry
   (`buildDirFileEntry`) and, for a pooled area, puts the object through
   `storage/remote-upload.ts`

An FTP upload that skipped step 5 would be a file no listing names.

## 7. Data channel

`PASV` binds inside `ftp_data_ports` and advertises `ftp_host` - the address a
NATed client is told to come back to, which is why express.e makes it a config
value with `127.0.0.1` as the default rather than reading the socket. `PORT` is
supported for old clients. `TYPE A` and `TYPE I` both work; `TYPE A` does the
CRLF translation on the way out.

## 8. How it is proved

Not by unit-testing the parser. Each phase drives a REAL client against a REAL
socket on an ephemeral port, over a temp board:

- a conference the caller cannot access is absent from the root listing, and
  `CWD` into it answers `550`
- `EXCLUDE_FTP` hides a conference the caller CAN access
- a `LIST` inside a conference names the files its DIR files name, with the DIR
  line's sizes and dates - including an entry whose description spans lines
- `RETR` of a file in a POOLED area returns the bucket's bytes (against the
  fake backend used by `tests/storage`)
- `RETR` refused by ratio returns `550` and moves no bytes
- `STOR` into a `NO_FTP_UPLOADS` conference is refused with that message
- `STOR` of a good file appears in the DIR file afterwards; of a bad archive,
  lands in HOLD
- `REST` + `RETR` resumes at the offset
- an unknown verb answers `500`, and a pre-login command answers `530`

## 9. Decisions needed before implementation

1. **Plaintext or FTPS.** express.e's FTP is plaintext and every classic client
   expects that; this board is public at `bbs.uprough.net`, so plaintext sends
   BBS passwords in the clear. Either (a) explicit FTPS (`AUTH TLS`) with
   plaintext refused off localhost, (b) plaintext, period-correct, with a
   warning in the login banner, or (c) plaintext bound to localhost only, for
   tunnelled access. Recommended: (a), falling back to (b) only if the sysop
   wants real Amiga clients to connect.
2. **Ports.** `ftp_port` defaults to 21 (privileged, and shared with the host);
   `ftp_data_ports` is empty and passive mode needs a declared, firewalled range.
3. **Does an FTP session consume a node?** If yes it competes with telnet and
   web callers for the node pool and inherits all per-node accounting; if no,
   time limits and WHO do not see it. express.e's answer is yes.

## 10. Phases

| # | Phase | Done when |
|---|---|---|
| 1 | Delete the fake `startFTPTransfer` and its protocol registration | no code claims FTP works |
| 2 | Control socket, greeting, `USER`/`PASS`/`QUIT`/`NOOP`/`SYST`/`FEAT`, login gate | a client logs in and is refused everything else |
| 3 | The virtual tree: `PWD`/`CWD`/`CDUP`/`LIST`/`NLST`, conference visibility | a client browses the board's areas |
| 4 | `PASV`/`PORT`, `TYPE`, `SIZE`/`MDTM`, `RETR` with the ratio gate, `REST` | a client downloads, pooled or local |
| 5 | `STOR` through the playpen, dupe check, tester, DIR entry, pooled put | a client uploads and the board lists it |
| 6 | `MLSD`/`MLST`, CallersLog lines, node accounting per 9.3 | a session reads like any other caller |
