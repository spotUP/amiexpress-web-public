#!/usr/bin/env python3
"""
Drive the BBS over telnet, the way a caller does, and print what they saw.

Written so a session can log in, run commands and read the screens WITHOUT
the sysop at the keyboard (the sysop, 2026-09-27: "learn how to fully log
into the bbs via telnet so you can debug stuff completely on your own").

It answers the telnet negotiation (TTYPE "ANSI", NAWS 80x25), then walks the
login by reading what the board prints and answering it:

  graphics prompt   -> A (ANSI)
  username prompt   -> --user
  password prompt   -> --password
  any pause         -> RETURN   ("Space To Resume", "More(y/n/ns)", "Press RETURN")
  the menu prompt   -> the next --cmd, or logoff when there are none left

Every screen it passed, with ANSI stripped, goes to stdout; --raw keeps the
escape codes for when the colours are the question.

  python3 dev/scripts/bbs-telnet.py --cmd "B" --cmd "G"
  python3 dev/scripts/bbs-telnet.py --host localhost --cmd "J 2"

Exit code 0 when it reached the menu prompt, 1 when it did not.
"""
import argparse
import re
import socket
import sys
import time

IAC, DONT, DO, WONT, WILL, SB, SE = 255, 254, 253, 252, 251, 250, 240
TTYPE, NAWS = 24, 31
# CSI sequences, plus ESC 7 / ESC 8 (save and restore cursor), which the
# graphics prompt ends with.
ANSI = re.compile(rb"\x1b\[[0-9;?]*[A-Za-z]|\x1b[78]")

# What the board prints, and what a caller answers. Checked against the tail
# of the screen in this order; the first that matches is answered once.
GRAPHICS = re.compile(r"\(A/R/P/P8/T/N\).*\?\s*$", re.S)
USERNAME = re.compile(r"(user ?name|enter your name|name:|handle:)\s*$", re.I)
PASSWORD = re.compile(r"password:?\s*$", re.I)
PAUSE = re.compile(r"(space to resume:?|more\(y/n/ns\)\?|press (return|any key)[^\n]*)\s*$", re.I)
MENU = re.compile(r"\]\s*Menu \(\d+ mins?\. left\):\s*$", re.I)
YESNO = re.compile(r"\(y/n\)\??\s*$", re.I)


class Telnet:
    def __init__(self, host: str, port: int, timeout: float):
        self.sock = socket.create_connection((host, port), timeout=timeout)
        self.sock.settimeout(0.3)
        self.raw = b""
        self.on_bytes = None

    def _negotiate(self, data: bytes) -> bytes:
        text, i = bytearray(), 0
        while i < len(data):
            b = data[i]
            if b == IAC and i + 1 < len(data):
                cmd = data[i + 1]
                if cmd in (DO, DONT, WILL, WONT) and i + 2 < len(data):
                    opt = data[i + 2]
                    if cmd == DO:
                        self.sock.sendall(bytes([IAC, WILL if opt in (TTYPE, NAWS) else WONT, opt]))
                        if opt == NAWS:
                            self.sock.sendall(bytes([IAC, SB, NAWS, 0, 80, 0, 25, IAC, SE]))
                    i += 3
                    continue
                if cmd == SB:
                    end = data.find(bytes([IAC, SE]), i)
                    if end < 0:
                        break
                    if data[i + 2] == TTYPE:
                        self.sock.sendall(bytes([IAC, SB, TTYPE, 0]) + b"ANSI" + bytes([IAC, SE]))
                    i = end + 2
                    continue
                if cmd == IAC:
                    text.append(IAC)
                i += 2
                continue
            text.append(b)
            i += 1
        return bytes(text)

    def pump(self, quiet: float) -> bytes:
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
            if self.on_bytes:
                self.on_bytes(text)
            last = time.time()
        self.raw += got
        return got

    def send(self, text: str) -> None:
        self.sock.sendall(text.encode("latin1"))


def plain(data: bytes) -> str:
    return ANSI.sub(b"", data).decode("latin1").replace("\r", "")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="bbs.uprough.net")
    ap.add_argument("--port", type=int, default=64128)
    ap.add_argument("--user", default="sysop")
    ap.add_argument("--password", default="sysop")
    ap.add_argument("--cmd", action="append", default=[], help="a command to type at the menu; repeatable")
    ap.add_argument("--no-logoff", action="store_true", help="drop the line instead of typing G")
    ap.add_argument("--quiet", type=float, default=1.5, help="seconds of silence that end a screen")
    ap.add_argument("--idle", type=float, default=15.0,
                    help="seconds with nothing to answer before giving up - a 68K door can sit silent for a while")
    ap.add_argument("--max-steps", type=int, default=80)
    ap.add_argument("--raw", action="store_true", help="print escape codes too")
    ap.add_argument("--log", help="append the raw screen bytes here as they arrive - tail -f it to watch")
    ap.add_argument("--watch", action="store_true",
                    help="macOS: open a Terminal tab that tails --log, so a human sees the session live")
    args = ap.parse_args()

    log = open(args.log, "ab", buffering=0) if args.log else None
    if args.watch and args.log:
        import subprocess
        subprocess.run(["osascript", "-e",
                        f'tell application "Terminal" to do script "clear; tail -n 0 -f {args.log}"'],
                       check=False)
        time.sleep(1.5)

    tn = Telnet(args.host, args.port, timeout=15)
    if log:
        tn.on_bytes = log.write
    commands = list(args.cmd)
    reached_menu = logged_off = False
    screen = ""
    idle_since = time.time()

    steps = 0
    while steps < args.max_steps:
        chunk = tn.pump(args.quiet)
        if chunk:
            idle_since = time.time()
        elif time.time() - idle_since > args.idle:
            break
        screen += plain(chunk)
        sys.stdout.write(chunk.decode("latin1") if args.raw else plain(chunk))
        sys.stdout.flush()
        tail = screen[-300:]

        if GRAPHICS.search(tail):
            answer, why = "A\r", "graphics: ANSI"
        elif PASSWORD.search(tail):
            answer, why = args.password + "\r", "password"
        elif USERNAME.search(tail):
            answer, why = args.user + "\r", "username"
        elif PAUSE.search(tail):
            answer, why = "\r", "pause"
        elif MENU.search(tail):
            reached_menu = True
            if commands:
                cmd = commands.pop(0)
                answer, why = cmd + "\r", f"command {cmd}"
            elif args.no_logoff or logged_off:
                break
            else:
                answer, why, logged_off = "G\r", "logoff", True
        elif YESNO.search(tail):
            answer, why = "\r", "yes/no: default"
        else:
            continue

        sys.stdout.write(f"\n[DRIVER] -> {why}\n")
        tn.send(answer)
        steps += 1
        idle_since = time.time()
        if log:
            log.write(f"\x1b[0m\r\n\x1b[7m [DRIVER] -> {why} \x1b[0m\r\n".encode("latin1"))
        screen = ""

    tn.sock.close()
    sys.stdout.write(f"\n[DRIVER] {'reached the menu' if reached_menu else 'never reached the menu'}\n")
    return 0 if reached_menu else 1


if __name__ == "__main__":
    sys.exit(main())
