#!/usr/bin/env python3
"""
Sit at the board's screen and type, one step at a time - reading what is
actually there before every key.

"you are still guessing what to type. it will never work if you cant read
whats on the screen" (the sysop, 2026-09-27). The regression script guessed
whole dialogues in advance and read a stripped byte stream, in which a clear,
a cursor move or a redraw was invisible. This keeps ONE telnet call open in
the background, feeds every byte into a terminal emulator (pyte, 80x25), and
answers each command with the rendered screen - the same grid a caller's
terminal shows.

  dev/scripts/.venv/bin/python dev/scripts/bbs_screen.py start [--host bbs.uprough.net] [--watch]
  dev/scripts/.venv/bin/python dev/scripts/bbs_screen.py advance        # login + pauses, stops on the unknown
  dev/scripts/.venv/bin/python dev/scripts/bbs_screen.py screen
  dev/scripts/.venv/bin/python dev/scripts/bbs_screen.py send 'sysop\\r'      # python escapes: \\r \\x18 ...
  dev/scripts/.venv/bin/python dev/scripts/bbs_screen.py wait 5
  dev/scripts/.venv/bin/python dev/scripts/bbs_screen.py relay <dir> sz -b FILE   # hand the line to lrzsz
  dev/scripts/.venv/bin/python dev/scripts/bbs_screen.py stop

`start --watch` opens a Terminal tab tailing the raw screen bytes, so the
sysop sees the same call. The pyte venv: python3 -m venv dev/scripts/.venv &&
dev/scripts/.venv/bin/pip install pyte.
"""
from __future__ import annotations

import argparse
import codecs
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bbs_telnet import Session, credentials  # noqa: E402

import pyte  # noqa: E402

CONTROL_PORT = int(os.environ.get("BBS_SCREEN_PORT", "7811"))

import re  # noqa: E402

# The prompts a caller can answer without thinking, recognised on the
# cursor's row. Anything else stops `advance` and comes back to be read.
KNOWN_PROMPTS = [
    (re.compile(r"\(A/R/P/P8/T/N\).*\?$"), "A\r", "graphics"),
    (re.compile(r"password:?$", re.I), "{password}\r", "password"),
    (re.compile(r"(user ?name|enter your name|handle)\s*:?$", re.I), "{user}\r", "username"),
    (re.compile(r"space to resume:?$", re.I), "\r", "pause"),
    (re.compile(r"more\(y/n/ns\)\?$", re.I), "\r", "more"),
    (re.compile(r"press (return|any key)[^:]*[.:]*$", re.I), "\r", "press a key"),
    (re.compile(r"privacy notice\. Accept now \(Y/n\)\?$", re.I), "Y\r", "privacy notice"),
    # Mail found at logon asks instead of pausing (express.e:11739); the
    # question holds the scan on screen the way the pause does when no mail.
    # yesNo() is a hotkey: a trailing CR would answer the next conference Yes.
    (re.compile(r"Would you like to read it now \(Y/n\)\?$", re.I), "n", "mail found"),
    # The tip of the day is a modal: its title holds the cursor, any key ends it.
    (re.compile(r"^\s*TIP OF THE DAY$"), "\r", "press a key"),
]
MENU_PROMPT = re.compile(r"\]\s*Menu \(\d+ mins?\. left\):$", re.I)
DEFAULT_LOG = os.path.join(tempfile.gettempdir(), "bbs-screen.log")


def as_glyphs(text: str) -> str:
    """Bytes 0x80-0x9F are Amiga art, not C1 controls.

    A terminal reading them as 8-bit controls treats 0x9D as OSC and 0x9B as
    CSI, and swallows the rest of the screen - DOWNLOADMSG's art carries a
    0x9D, and the rendered screen stopped at row 6 while the board had sent
    the whole page and its prompt (2026-09-27). Shifted into the private-use
    area they keep their cell and never steer the parser. The board's escape
    sequences are 7-bit ESC [ ... and are untouched.
    """
    return "".join(chr(0xE000 + ord(c)) if 0x80 <= ord(c) <= 0x9F else c for c in text)


# -- the session side ---------------------------------------------------------

class Board:
    def __init__(self, host: str, port: int, log: str, watch: bool):
        self.s = Session(host, port, log=log, watch=watch)
        self.screen = pyte.Screen(80, 25)
        self.stream = pyte.Stream(self.screen)
        # The board's bytes are Amiga latin-1; decode incrementally so a
        # split multi-byte sequence never happens (latin-1 has none anyway).
        self.decoder = codecs.getincrementaldecoder("latin1")()
        self.lock = threading.Lock()
        self.reading = threading.Event()
        self.reading.set()
        # One reader of the socket at a time. relay() takes it so the screen
        # reader cannot be mid-recv when the transfer program takes over; bytes
        # it still caught after being told to stop are kept for the program.
        self.sock_lock = threading.Lock()
        self.stash = b""
        self.last_byte = time.time()
        self.closed = False
        # Every character the board has sent, in order - what scrolled off the
        # 25 rows too, so a check can read the whole login, not its last page.
        self.heard: list[str] = []
        # The screen as it stood at every pause advance() answered, in order:
        # what a caller actually reads before pressing a key.
        self.pauses: list[str] = []
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self) -> None:
        while not self.closed:
            if not self.reading.is_set():
                time.sleep(0.05)
                continue
            with self.sock_lock:
                if not self.reading.is_set():
                    continue
                try:
                    data = self.s.sock.recv(65536)
                except socket.timeout:
                    continue
                except OSError:
                    self.closed = True
                    break
                if not data:
                    self.closed = True
                    break
                if not self.reading.is_set():
                    # A transfer began while this read was in flight: its
                    # bytes are protocol, not screen.
                    self.stash += data
                    continue
            text = self.s._negotiate(data)
            if self.s.log:
                self.s.log.write(text)
            with self.lock:
                decoded = self.decoder.decode(text)
                self.heard.append(decoded)
                self.stream.feed(as_glyphs(decoded))
                self.last_byte = time.time()

    def settle(self, quiet: float = 0.8, limit: float = 10.0) -> None:
        """Wait until the board has been silent for `quiet` seconds."""
        start = time.time()
        while time.time() - start < limit:
            if time.time() - self.last_byte >= quiet:
                return
            time.sleep(0.05)

    def render(self) -> str:
        with self.lock:
            rows = [line.rstrip() for line in self.screen.display]
            cx, cy = self.screen.cursor.x, self.screen.cursor.y
        # Trailing empty rows say nothing; keep the grid's row numbers so a
        # prompt's position is visible.
        last = max((i for i, r in enumerate(rows) if r), default=0)
        body = "\n".join(f"{i:2d}|{r}" for i, r in enumerate(rows[: max(last, cy) + 1]))
        state = "CLOSED" if self.closed else "open"
        return f"{body}\n--- cursor row {cy} col {cx} | line {state} ---"

    def prompt(self) -> str:
        """What the board is waiting on: the cursor's row, up to the cursor.

        A prompt is where the cursor sits after the board stops writing -
        reading the row, not the byte stream, is what keeps this right when
        a screen redraws, clears or moves the cursor before asking."""
        with self.lock:
            row = self.screen.display[self.screen.cursor.y]
            return row[: self.screen.cursor.x].rstrip()

    def advance(self, user: str, password: str, stop_at_menu: bool = True, limit: int = 60) -> str:
        """Answer the prompts this knows, reading the screen before each one,
        until the menu prompt - or until the board asks something unknown,
        which is handed back rather than guessed at."""
        log = []
        for _ in range(limit):
            self.settle(1.2, 30.0)
            here = self.prompt()
            # An empty cursor row is not a question: a door is still thinking
            # (a 68K door can sit silent for seconds). Give it time before
            # calling it anything.
            waited = 0.0
            while not here and waited < 30.0:
                self.settle(2.0, 10.0)
                waited += 2.0
                here = self.prompt()
            answer = None
            for pattern, keys, why in KNOWN_PROMPTS:
                if pattern.search(here):
                    answer = keys.replace("{user}", user).replace("{password}", password)
                    shown = "<password>" if "{password}" in keys else repr(answer)
                    log.append(f"[{why}] {here[-60:]!r} -> {shown}")
                    break
            if MENU_PROMPT.search(here):
                log.append(f"[menu] {here[-60:]!r}")
                break
            if answer is None:
                # Not a question this knows - but the board may simply still
                # be drawing (56k art, a gap between a screen and its pause).
                # Only a board that stays silent is waiting on something new.
                before = self.last_byte
                self.settle(10.0, 12.0)
                if self.last_byte != before:
                    continue
                log.append(f"[STOP - unknown prompt] {here[-70:]!r}")
                break
            if why in ("pause", "more", "press a key", "mail found"):
                with self.lock:
                    self.pauses.append("\n".join(line.rstrip() for line in self.screen.display))
            self.send(answer, secret="{password}" in keys)
        return "\n".join(log) + "\n" + self.render()

    def send(self, keys: str, secret: bool = False) -> None:
        # A password must not land in the session log, which lives in the
        # scratchpad and gets read back into transcripts.
        self.s.note("send <password>" if secret else f"send {keys!r}")
        self.last_byte = time.time()
        self.s.sock.sendall(keys.encode("latin1"))

    def relay(self, cwd: str, argv: list[str]) -> str:
        self.reading.clear()
        with self.sock_lock:            # the screen reader is out of recv()
            initial, self.stash = self.stash, b""
            try:
                rc = self.s.relay(argv, cwd=cwd, initial=initial)
                tail = getattr(self.s, "relay_tail", b"")
                if tail:
                    with self.lock:
                        self.stream.feed(as_glyphs(self.decoder.decode(tail)))
                    if self.s.log:
                        self.s.log.write(tail)
            finally:
                self.reading.set()
        return f"transfer exit {rc}"


def serve(args: argparse.Namespace) -> None:
    board = Board(args.host, args.port, args.log, args.watch)
    srv = socket.socket()
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", CONTROL_PORT))
    srv.listen(1)
    while True:
        conn, _ = srv.accept()
        with conn:
            line = b""
            while not line.endswith(b"\n"):
                chunk = conn.recv(65536)
                if not chunk:
                    break
                line += chunk
            try:
                req = json.loads(line.decode())
            except ValueError:
                conn.sendall(b"bad request\n")
                continue
            cmd = req.get("cmd")
            reply = ""
            if cmd == "screen":
                reply = board.render()
            elif cmd == "send":
                board.send(req["keys"])
                board.settle(req.get("quiet", 0.8), req.get("limit", 10.0))
                reply = board.render()
            elif cmd == "advance":
                reply = board.advance(req["user"], req["password"])
            elif cmd == "wait":
                board.settle(quiet=float(req["seconds"]), limit=float(req["seconds"]) + 1)
                reply = board.render()
            elif cmd == "relay":
                note = board.relay(req["cwd"], req["argv"])
                board.settle(1.0, 15.0)
                reply = note + "\n" + board.render()
            elif cmd == "stop":
                board.closed = True
                board.s.close()
                conn.sendall(b"stopped\n")
                return
            conn.sendall(reply.encode("latin1", "replace") + b"\n")


# -- the command side ---------------------------------------------------------

def ask(req: dict) -> str:
    with socket.create_connection(("127.0.0.1", CONTROL_PORT), timeout=300) as c:
        c.sendall(json.dumps(req).encode() + b"\n")
        out = b""
        while True:
            chunk = c.recv(65536)
            if not chunk:
                break
            out += chunk
    return out.decode("latin1")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    st = sub.add_parser("start")
    st.add_argument("--host", default="localhost")
    st.add_argument("--port", type=int, default=64128)
    st.add_argument("--log", default=DEFAULT_LOG)
    st.add_argument("--watch", action="store_true")
    sv = sub.add_parser("_serve")
    for a, d in (("--host", "localhost"), ("--log", DEFAULT_LOG)):
        sv.add_argument(a, default=d)
    sv.add_argument("--port", type=int, default=64128)
    sv.add_argument("--watch", action="store_true")
    sub.add_parser("screen")
    av = sub.add_parser("advance", help="answer known prompts (graphics, login, pauses) until the menu or an unknown prompt")
    av.add_argument("--user", help="login name (else env BBS_USER)")
    av.add_argument("--password", help="password (else env BBS_PASSWORD)")
    sd = sub.add_parser("send")
    sd.add_argument("keys", help="python-escaped: 'sysop\\r'")
    sd.add_argument("--quiet", type=float, default=0.8)
    sd.add_argument("--limit", type=float, default=10.0)
    wt = sub.add_parser("wait")
    wt.add_argument("seconds", type=float)
    rl = sub.add_parser("relay")
    rl.add_argument("cwd")
    rl.add_argument("argv", nargs=argparse.REMAINDER)
    sub.add_parser("stop")
    args = ap.parse_args()

    if args.cmd == "start":
        open(args.log, "ab").close()
        cmd = [sys.executable, os.path.abspath(__file__), "_serve", "--host", args.host,
               "--port", str(args.port), "--log", args.log] + (["--watch"] if args.watch else [])
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=open(args.log + ".err", "ab"),
                         start_new_session=True)
        for _ in range(50):
            time.sleep(0.2)
            try:
                time.sleep(2.0)
                print(ask({"cmd": "wait", "seconds": 2}))
                return 0
            except OSError:
                continue
        print("the session did not start - see", args.log + ".err")
        return 1
    if args.cmd == "_serve":
        serve(args)
        return 0
    if args.cmd == "screen":
        print(ask({"cmd": "screen"}))
    elif args.cmd == "advance":
        user, password = credentials(args.user, args.password)
        print(ask({"cmd": "advance", "user": user, "password": password}))
    elif args.cmd == "send":
        keys = codecs.decode(args.keys, "unicode_escape")
        print(ask({"cmd": "send", "keys": keys, "quiet": args.quiet, "limit": args.limit}))
    elif args.cmd == "wait":
        print(ask({"cmd": "wait", "seconds": args.seconds}))
    elif args.cmd == "relay":
        print(ask({"cmd": "relay", "cwd": os.path.abspath(args.cwd), "argv": args.argv}))
    elif args.cmd == "stop":
        print(ask({"cmd": "stop"}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
