#!/usr/bin/env python3
"""
Drive the BBS over telnet, the way a caller does, and print what they saw.

Written so a session can log in, run commands and read the screens WITHOUT
the sysop at the keyboard (the sysop, 2026-09-27: "learn how to fully log
into the bbs via telnet so you can debug stuff completely on your own").

It answers the telnet negotiation (TTYPE "ANSI", NAWS 80x25), then walks the
login by reading what the board prints and answering it:

  graphics prompt   -> A (ANSI)
  username prompt   -> --user     (else env BBS_USER)
  password prompt   -> --password (else env BBS_PASSWORD)
  any pause         -> RETURN   ("Space To Resume", "More(y/n/ns)", "Press RETURN")
  the menu prompt   -> the next --cmd, or logoff when there are none left

  python3 dev/scripts/bbs_telnet.py --cmd "B" --cmd "T" --log <scratch>/bbs.log --watch
  python3 dev/scripts/bbs_telnet.py --host localhost --cmd "J 2"

`--watch` opens a Terminal tab tailing `--log`, so the sysop sees the session
live - always pass it. Exit code 0 when it reached the menu prompt.

As a module, `Session` is what the regression runner (bbs_regress.py) drives:
login(), command(), until(), and relay() for a ZMODEM/XMODEM client.
"""
from __future__ import annotations

import argparse
import os
import re
import select
import socket
import subprocess
import sys
import time
from typing import Callable, Optional

IAC, DONT, DO, WONT, WILL, SB, SE = 255, 254, 253, 252, 251, 250, 240
BINARY, ECHO, SGA, TTYPE, NAWS = 0, 1, 3, 24, 31

# CSI sequences, plus ESC 7 / ESC 8 (save and restore cursor), which the
# graphics prompt ends with.
ANSI = re.compile(rb"\x1b\[[0-9;?]*[A-Za-z]|\x1b[78]")

# What the board prints, and what a caller answers. Matched against the tail
# of the screen.
GRAPHICS = re.compile(r"\(A/R/P/P8/T/N\).*\?\s*$", re.S)
USERNAME = re.compile(r"(user ?name|enter your name|name:|handle:)\s*$", re.I)
PASSWORD = re.compile(r"password:?\s*$", re.I)
PAUSE = re.compile(r"(space to resume:?|more\(y/n/ns\)\?|press (return|any key)[^\n]*|any key: continues[^\n]*)\s*$", re.I)
MENU = re.compile(r"\]\s*Menu \(\d+ mins?\. left\):\s*$", re.I)
YESNO = re.compile(r"\(y/n\)\??\s*$", re.I)


def transfer_tail(data: bytes) -> bytes:
    """What the board printed AFTER a transfer, caught in the same read.

    The program exits on the protocol's last word - ZMODEM's `OO`, XMODEM's
    EOT (we received) or final ACK (we sent) - and whatever the board wrote
    after it was handed to the program with it and lost: the screen stopped
    mid-line at " 1 files, 4" and the menu prompt never showed (2026-09-27).
    The bytes after the LAST such marker are the board talking to the caller.
    """
    ends = [data.rfind(b"OO") + 2 if b"OO" in data else -1,
            data.rfind(b"\x04") + 1 if b"\x04" in data else -1,
            data.rfind(b"\x06") + 1 if b"\x06" in data else -1]
    cut = max(ends)
    return data[cut:] if cut > 0 else b""


def plain(data: bytes) -> str:
    return ANSI.sub(b"", data).decode("latin1").replace("\r", "")


class Timeout(Exception):
    """Nothing the session was waiting for arrived."""


def credentials(user: Optional[str], password: Optional[str]) -> tuple[str, str]:
    """The login to answer with: the option, else BBS_USER / BBS_PASSWORD.
    No built-in default - a wrong password locks an account after a few tries.
    Exits 2 (before any connection) when either is missing."""
    user = user or os.environ.get("BBS_USER")
    password = password or os.environ.get("BBS_PASSWORD")
    if not user or not password:
        sys.stderr.write("[DRIVER] no credentials: pass --user and --password, "
                         "or set BBS_USER and BBS_PASSWORD\n")
        raise SystemExit(2)
    return user, password


class Session:
    def __init__(self, host: str = "localhost", port: int = 64128,
                 user: Optional[str] = None, password: Optional[str] = None,
                 log: Optional[str] = None, watch: bool = False,
                 echo: Callable[[str], None] = lambda text: None,
                 ttype: Optional[str] = "ANSI", naws: tuple[int, int] = (80, 25)):
        # ttype=None refuses TTYPE, as a real C64 behind a WiFi modem does;
        # naws is the window the client reports.
        self.user, self.password, self.echo = user, password, echo
        self.ttype, self.naws = ttype, naws
        self.log = open(log, "ab", buffering=0) if log else None
        if watch and log:
            subprocess.run(["osascript", "-e",
                            f'tell application "Terminal" to do script "clear; tail -n 0 -f {log}"'],
                           check=False)
            time.sleep(1.5)
        self.sock = socket.create_connection((host, port), timeout=15)
        self.sock.settimeout(0.3)
        self.screen = ""          # plain text since the last answer
        self.transcript = ""      # plain text of the whole call

    # -- the wire -----------------------------------------------------------

    def _negotiate(self, data: bytes) -> bytes:
        text, i = bytearray(), 0
        while i < len(data):
            b = data[i]
            if b == IAC and i + 1 < len(data):
                cmd = data[i + 1]
                if cmd in (DO, DONT, WILL, WONT) and i + 2 < len(data):
                    opt = data[i + 2]
                    if cmd == DO:
                        agree = opt in (NAWS, BINARY) or (opt == TTYPE and self.ttype is not None)
                        self.sock.sendall(bytes([IAC, WILL if agree else WONT, opt]))
                        if opt == NAWS:
                            self.sock.sendall(bytes([IAC, SB, NAWS, 0, self.naws[0], 0, self.naws[1], IAC, SE]))
                    elif cmd == WILL:
                        agree = opt in (ECHO, SGA, BINARY)
                        self.sock.sendall(bytes([IAC, DO if agree else DONT, opt]))
                    i += 3
                    continue
                if cmd == SB:
                    end = data.find(bytes([IAC, SE]), i)
                    if end < 0:
                        break
                    if data[i + 2] == TTYPE:
                        self.sock.sendall(bytes([IAC, SB, TTYPE, 0]) + (self.ttype or "ANSI").encode() + bytes([IAC, SE]))
                    i = end + 2
                    continue
                if cmd == IAC:
                    text.append(IAC)
                i += 2
                continue
            text.append(b)
            i += 1
        return bytes(text)

    def note(self, why: str) -> None:
        self.echo(f"\n[DRIVER] -> {why}\n")
        if self.log:
            self.log.write(f"\x1b[0m\r\n\x1b[7m [DRIVER] -> {why} \x1b[0m\r\n".encode("latin1"))

    def pump(self, quiet: float = 1.0) -> bytes:
        """Read until the line has been quiet for `quiet` seconds."""
        got, last = b"", time.time()
        while time.time() - last < quiet:
            try:
                data = self.sock.recv(65536)
            except socket.timeout:
                continue
            if not data:
                break
            text = self._negotiate(data)
            got += text
            if self.log:
                self.log.write(text)
            last = time.time()
        if got:
            shown = plain(got)
            self.screen += shown
            self.transcript += shown
            self.echo(shown)
        return got

    def send(self, text: str, why: str = "") -> None:
        if why:
            self.note(why)
        self.sock.sendall(text.encode("latin1"))
        self.screen = ""

    def type(self, text: str, why: str = "", cps: float = 20.0) -> None:
        """Type like a person: one key at a time, reading the echo between keys."""
        if why:
            self.note(why)
        # Cleared BEFORE typing: whatever the board answers while the keys go
        # in (a prompt drawn after the RETURN) is the next thing to read.
        self.screen = ""
        for ch in text:
            self.sock.sendall(ch.encode("latin1"))
            self.pump(1.0 / cps)

    # -- conversation ------------------------------------------------------

    def auto_answer(self) -> bool:
        """Answer the login and pause prompts. True when it answered one."""
        tail = self.screen[-300:]
        if GRAPHICS.search(tail):
            self.send("A\r", "graphics: ANSI")
        elif PASSWORD.search(tail):
            assert self.password is not None, "Session has no password; use credentials()"
            self.send(self.password + "\r", "password")
        elif USERNAME.search(tail):
            assert self.user is not None, "Session has no user; use credentials()"
            self.send(self.user + "\r", "username")
        elif PAUSE.search(tail):
            self.send("\r", "pause")
        else:
            return False
        return True

    def until(self, pattern: re.Pattern | str, idle: float = 15.0, answer: bool = True) -> str:
        """
        Read until `pattern` matches the screen's tail, answering login and
        pause prompts on the way. Returns everything read. Raises Timeout
        after `idle` seconds in which nothing arrived and nothing was answered.
        """
        wanted = re.compile(pattern, re.I) if isinstance(pattern, str) else pattern
        seen, idle_since = "", time.time()
        while True:
            if self.pump(1.0):
                idle_since = time.time()
            seen_now = self.screen
            if wanted.search(seen_now[-400:]):
                return seen + seen_now
            if answer and self.auto_answer():
                seen += seen_now
                idle_since = time.time()
                continue
            if time.time() - idle_since > idle:
                raise Timeout(f"waited {idle:.0f}s for {wanted.pattern!r}; screen ends: {seen_now[-200:]!r}")

    def login(self, idle: float = 20.0) -> str:
        return self.until(MENU, idle)

    def command(self, cmd: str, until: re.Pattern | str = MENU, idle: float = 20.0) -> str:
        self.send(cmd + "\r", f"command {cmd}")
        return self.until(until, idle)

    def logoff(self) -> str:
        self.send("G\r", "logoff")
        try:
            return self.until(r"NO CARRIER|Click", idle=15)
        finally:
            self.close()

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass

    # -- file transfers ------------------------------------------------------

    def relay(self, argv: list[str], cwd: str, timeout: float = 120.0, initial: bytes = b"") -> int:
        """
        Run a transfer program (sz, rz, `sz --xmodem`, ...) with its stdin and
        stdout joined to this telnet line, until it exits.

        Telnet framing is kept on both sides: 0xFF from the program goes out as
        IAC IAC, and IAC IAC from the board comes in as one 0xFF, with any
        option negotiation mid-transfer answered rather than passed through.
        """
        proc = subprocess.Popen(argv, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, bufsize=0)
        self.note("transfer: " + " ".join(argv))
        out_fd = proc.stdout.fileno()
        os.set_blocking(out_fd, False)
        started = time.time()
        # Bytes a screen reader caught after the transfer had begun belong to
        # the transfer program, and go first.
        pending = initial
        received = bytearray()   # every protocol byte handed over, for the tail below
        while proc.poll() is None:
            if time.time() - started > timeout:
                proc.kill()
                self.note("transfer: timed out")
                return -1
            readable, _, _ = select.select([self.sock, out_fd], [], [], 0.2)
            if self.sock in readable:
                try:
                    data = self.sock.recv(65536)
                except (socket.timeout, BlockingIOError):
                    data = b""
                if data:
                    pending += data
                    # Keep a trailing lone IAC for the next read: it may be half of IAC IAC.
                    cut = len(pending) - 1 if pending.endswith(bytes([IAC])) and not pending.endswith(bytes([IAC, IAC])) else len(pending)
                    body, pending = self._negotiate(pending[:cut]), pending[cut:]
                    received += body
                    if body:
                        try:
                            proc.stdin.write(body)
                            proc.stdin.flush()
                        except BrokenPipeError:
                            break
            if out_fd in readable:
                try:
                    chunk = os.read(out_fd, 65536)
                except BlockingIOError:
                    chunk = b""
                if chunk:
                    self.sock.sendall(chunk.replace(bytes([IAC]), bytes([IAC, IAC])))
        rc = proc.wait()
        err = proc.stderr.read().decode("latin1", "replace").strip()
        self.note(f"transfer: exit {rc}" + (f" ({err.splitlines()[-1]})" if err else ""))
        self.relay_tail = transfer_tail(bytes(received[-4096:]))
        return rc


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="bbs.uprough.net")
    ap.add_argument("--port", type=int, default=64128)
    ap.add_argument("--user", help="login name (else env BBS_USER)")
    ap.add_argument("--password", help="password (else env BBS_PASSWORD)")
    ap.add_argument("--cmd", action="append", default=[], help="a command to type at the menu; repeatable")
    ap.add_argument("--no-logoff", action="store_true", help="drop the line instead of typing G")
    ap.add_argument("--idle", type=float, default=20.0,
                    help="seconds with nothing to answer before giving up - a 68K door can sit silent for a while")
    ap.add_argument("--log", help="append the raw screen bytes here as they arrive - tail -f it to watch")
    ap.add_argument("--watch", action="store_true",
                    help="macOS: open a Terminal tab that tails --log, so a human sees the session live")
    args = ap.parse_args()
    args.user, args.password = credentials(args.user, args.password)

    def echo(text: str) -> None:
        sys.stdout.write(text)
        sys.stdout.flush()

    s = Session(args.host, args.port, args.user, args.password, args.log, args.watch, echo)
    try:
        s.login(args.idle)
        for cmd in args.cmd:
            s.command(cmd, idle=args.idle)
        if args.no_logoff:
            s.close()
        else:
            s.logoff()
    except Timeout as problem:
        echo(f"\n[DRIVER] never reached the menu: {problem}\n")
        s.close()
        return 1
    echo("\n[DRIVER] reached the menu\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
