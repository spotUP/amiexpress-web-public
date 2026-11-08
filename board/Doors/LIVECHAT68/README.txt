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
* AmiExpress 5.x with XIM door support. The exact lowest version has not
  been checked; any build that runs normal XIM doors should do.
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

The host, port and TLS settings are shown with their normal values
(doors.uprough.net, 443, TLS on); leave them as they are. The door
asks the chat server for a board key at once, writes
Doors:LIVECHAT68/LIVECHAT.cfg and goes straight into the chat. Callers
who are not sysops see a "not set up yet" message until you have done
this.

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
"Not set up yet" (as a caller): the sysop has not run the first-run
setup. Log in as sysop and type LC.

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
