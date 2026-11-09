LiveChat68 - live chat between AmiExpress boards
================================================

WHAT IT IS
----------
LiveChat68 is a door for AmiExpress that joins your board to a shared
live chat. Callers on your board talk in real time with callers on every
other board that runs LiveChat68, and with callers on the web board at
bbs.uprough.net. The chat server is doors.uprough.net. Your board only
makes outgoing connections; you do not open any port.

REQUIREMENTS
------------
* AmiExpress 5.x with XIM door support.
* A TCP/IP stack that provides bsdsocket.library, such as Roadshow or
  AmiTCP, running before the BBS starts.
* AmiSSL 5 (amisslmaster.library) for HTTPS. This is the default and
  the recommended setup, because your board key travels with every
  request and must not be readable on the wire.
* Without AmiSSL you can set AllowPlainHttp=1 and Tls=0 in LIVECHAT.cfg
  (see below). This sends your board key in clear text. It is NOT
  recommended; use it only on a private network or for testing.

INSTALL
-------
0. A stock AmiExpress install may have no DOORS: assign. Check with
   "Assign DOORS: EXISTS" in a Shell. If it fails, add this line to
   S:User-Startup (before AmiExpress starts) and reboot:
      Assign DOORS: BBS:Doors
1. Copy the whole LiveChat68 drawer contents to Doors:LIVECHAT68/
   so that the door file is Doors:LIVECHAT68/LIVECHAT68.
2. Copy LC.info to BBS:Commands/BBSCmd/LC.info. This is the command
   icon. Callers type LC at the main menu to start the chat. Its
   tooltypes are:
      LOCATION=Doors:LIVECHAT68/LIVECHAT68
      TYPE=XIM
      STACK=32768
      ACCESS=1       (lowest access level that may use it)
      NAME=LiveChat
   Change ACCESS with the normal icon editor if you want to limit it.
   If your doors live somewhere else, change LOCATION to match.
3. Do not copy LIVECHAT.cfg.example anywhere unless you want to set
   things up by hand. The first-run setup (next section) makes the real
   LIVECHAT.cfg for you.

FIRST RUN (SYSOP)
-----------------
Log in as sysop (access level 255) and type LC. When there is no
LIVECHAT.cfg, or it has no BoardKey, the door shows a setup screen:

  Board name   how your board is shown in the chat (1-40 characters)
  Sysop name   your name (1-40 characters)
  Contact      optional, e-mail or handle (up to 80 characters)

Then Host, Port and "Use TLS (HTTPS)?" are asked, with their normal
values already filled in (doors.uprough.net, 443, yes); press ENTER to
keep them. Leave the board name empty to cancel. The door asks the chat
server for a board key at once, writes Doors:LIVECHAT68/LIVECHAT.cfg
and goes straight into the chat. If the server refuses, its reason is
shown and you can try again; nothing is written until it accepts.
Answering no to TLS also sets AllowPlainHttp=1. Callers who are not
sysops see "No LIVECHAT.cfg. Setup needs access 255." until you
have done this.

NEVER SHARE LIVECHAT.cfg. It holds your board key, which identifies
your board. Anyone with the key can speak as your board. Do not post
it, do not put it in an archive, do not send it in a bug report.

LIVECHAT.cfg KEYS
-----------------
One Key=Value per line. Lines starting with # or ; are comments.

  Host=doors.uprough.net   Chat server name. Default doors.uprough.net.
  Port=443                 Server port, 1-65535. 443 with TLS.
  BoardKey=<id>.<secret>   Your board key. Written by the setup screen.
  Timeout=10               Seconds to wait for the server, 1-119.
  Tls=1                    1 = HTTPS through AmiSSL (default),
                           0 = plain HTTP.  Added in this release.
  AllowPlainHttp=0         Must be 1 before Tls=0 is honoured; the
                           door refuses plain HTTP otherwise.
                           Added in this release. Not recommended.

TROUBLESHOOTING
---------------
"No LIVECHAT.cfg. Setup needs access 255.": the first-run setup has
not been done, or you ran LC below access level 255. Log in with an
account at access 255 and type LC.

No TCP stack / cannot open bsdsocket.library: start Roadshow or AmiTCP
before the BBS, and check that the stack is running (try a ping).

"AmiSSL 5 not installed (amisslmaster.library)": install AmiSSL 5 from
https://github.com/jens-maus/amissl . If you cannot, see the plain HTTP
note above, and accept the risk.

"Chat server did not answer": check that the Amiga has internet access,
that doors.uprough.net resolves, and raise Timeout (for example 20) on
a slow link. If the clock on your Amiga is far off, HTTPS can fail
too; set the date and time.

Redo the setup: delete Doors:LIVECHAT68/LIVECHAT.cfg and type LC as
sysop again. You get a new board key; ask the chat operators to retire
the old one if you lost control of it.

Questions and bug reports: https://bbs.uprough.net

SOURCE AND PORTING

The full C source is in the src drawer of this archive and at
https://github.com/spotUP/livechat68 (MIT license, see src/LICENSE).
"make" rebuilds this exact LIVECHAT68 with vbcc; "make test" builds and
tests the door on any C99 machine. To run it on another BBS, read
src/PORTING.txt: only the layer that talks to the board changes.
