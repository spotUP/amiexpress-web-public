#!/usr/bin/env python3
"""
Telnet regression suite: log in as a caller, exercise the board, check what
comes back - file transfers included.

"write a full telnet regression script and test everything we can for
regressions? including file transfers which has issue via telnet. zmodem and
xmodem being the focus for now" (the sysop, 2026-09-27).

Each case is its own call (login ... logoff), so one broken case cannot
poison the next. Verdicts are written to --results as each case finishes;
the next run skips what already passed unless asked, so an interruption
costs one case, not the suite (global rule 6a).

  python3 dev/scripts/bbs_regress.py                     # every case not yet passed, LOCAL board
  python3 dev/scripts/bbs_regress.py --only zmodem-upload
  python3 dev/scripts/bbs_regress.py --failed            # re-run only what failed last time
  python3 dev/scripts/bbs_regress.py --all --watch       # everything, with a Terminal tab to watch

LOCAL by default. --host bbs.uprough.net runs against the live board, where
uploads land on the real board - only on purpose.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import random
import re
import shutil
import sys
import tempfile
import time
import traceback
from typing import Callable

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bbs_telnet import MENU, Session, Timeout  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_RESULTS = os.path.join(REPO, "thoughts", "spot", "bbs-regress-results.json")


class Failed(Exception):
    """A check that did not hold."""


def check(ok: bool, what: str) -> None:
    if not ok:
        raise Failed(what)


# -- the cases -----------------------------------------------------------------
#
# Each takes a logged-in Session standing at the menu prompt and a scratch
# directory, and returns a one-line note. It must leave the session at the
# menu prompt; the runner logs off.

def case_login(s: Session, _tmp: str) -> str:
    return "reached the menu prompt"


def case_time(s: Session, _tmp: str) -> str:
    # The board keeps the sysop's local time (f6ef1c99e) and redraws the
    # prompt after T without another key (265943023).
    out = s.command("T")
    m = re.search(r"It is (\d\d)-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)", out)
    check(bool(m), "T printed no time")
    mo, d, y, hh, mm, ss = (int(x) for x in m.groups())
    shown = dt.datetime(2000 + y, mo, d, hh, mm, ss)
    drift = abs((dt.datetime.now() - shown).total_seconds())
    check(drift < 120, f"board time {shown:%H:%M:%S} is {drift:.0f}s from this machine's local time")
    return f"board time within {drift:.0f}s of local"


def case_join(s: Session, _tmp: str) -> str:
    out = s.command("J 2")
    check("Joining Conference" in out or "Conference 2" in out, "no join line for conference 2")
    s.command("J 1")
    return "joined 2 and back to 1"


def case_stats(s: Session, _tmp: str) -> str:
    out = s.command("S")
    check(re.search(r"(Uploads|Downloads|Calls)", out, re.I) is not None, "S showed no user stats")
    return "user stats shown"


def _set_protocol(s: Session, choice: str) -> None:
    """W, option 11 (transfer protocol), then the protocol number."""
    s.send("W\r", "command W")
    s.until(r"(Which|Selection|Option|Choice)[^\n]*[:?]\s*$", idle=20)
    s.send("11\r", "W: 11 transfer protocol")
    s.until(r"[:?]\s*$", idle=20)
    s.send(choice + "\r", f"protocol {choice}")
    # Leave the W screen, whatever it asks next.
    for _ in range(4):
        try:
            s.until(MENU, idle=6)
            return
        except Timeout:
            s.send("\r", "leave W")
    raise Failed("could not get back to the menu after W")


def _upload(s: Session, tmp: str, argv_for: Callable[[str], list[str]], protocol: str) -> tuple[str, bytes]:
    name = f"RG{random.randint(100000, 999999)}.BIN"
    # Every byte value, and the pairs telnet mangles: CR NUL, CR LF, IAC, 0D FF 00.
    body = bytes(range(256)) + b"\r\x00\r\n\xff\xff\x0d\xff\x00" + os.urandom(4000)
    path = os.path.join(tmp, name)
    with open(path, "wb") as f:
        f.write(body)
    s.send("U\r", "command U")
    s.until(r"FileName 1:\s*$", idle=40)
    if protocol.startswith("xmodem"):
        # XMODEM names nothing on the wire: the board takes the typed name.
        s.send(name + "\r", f"filename {name}")
        s.until(r":\s*$", idle=20)          # description line
        s.send("regression upload\r", "description")
        s.until(r":\s*$", idle=20)
        s.send("\r", "end description")
        s.until(r"FileName 2:\s*$", idle=20)
    s.send("\r", "start the batch")
    s.until(r"\(A\)bort\?\s*$", idle=20)
    s.send("\r", "enter: start transfer")
    time.sleep(0.5)
    rc = s.relay(argv_for(name), cwd=tmp)
    check(rc == 0, f"client exited {rc}")
    return name, body


def _finish_upload_screens(s: Session) -> None:
    """Answer the description prompts after a ZMODEM upload until the menu."""
    for _ in range(8):
        try:
            s.until(MENU, idle=10)
            return
        except Timeout:
            tail = s.screen[-120:]
            if re.search(r":\s*$", tail):
                s.send("regression upload\r\r", "description")
            else:
                s.send("\r", "continue")
    raise Failed("never got back to the menu after the upload")


def _download(s: Session, tmp: str, name: str, argv: list[str]) -> bytes:
    out_dir = os.path.join(tmp, "down")
    os.makedirs(out_dir, exist_ok=True)
    s.send("D\r", "command D")
    s.until(r"Filespec\(1\):\s*$", idle=30)
    s.send(name + "\r", f"filespec {name}")
    s.until(r"Filespec\(2\):\s*$", idle=30)
    s.send("\r", "end filespecs")
    s.until(r"\(A\)bort\?\s*$", idle=30)
    s.send("\r", "enter: start transfer")
    time.sleep(0.5)
    rc = s.relay(argv, cwd=out_dir)
    check(rc == 0, f"client exited {rc}")
    s.until(MENU, idle=30)
    got = os.path.join(out_dir, name)
    check(os.path.exists(got), f"{name} did not arrive")
    with open(got, "rb") as f:
        return f.read()


def case_zmodem_upload(s: Session, tmp: str) -> str:
    _set_protocol(s, "1")
    name, body = _upload(s, tmp, lambda n: ["sz", "-b", n], "zmodem")
    _finish_upload_screens(s)
    STATE["zmodem_file"] = (name, body)
    return f"{name} ({len(body)} bytes) sent"


def case_zmodem_download(s: Session, tmp: str) -> str:
    check("zmodem_file" in STATE, "needs zmodem-upload first in the same run")
    name, body = STATE["zmodem_file"]
    _set_protocol(s, "1")
    got = _download(s, tmp, name, ["rz", "-b", "-y"])
    check(got == body, f"{name}: {len(got)} bytes back, {len(body)} sent, first difference at "
          f"{next((i for i, (a, b) in enumerate(zip(got, body)) if a != b), min(len(got), len(body)))}")
    return f"{name} round-tripped byte for byte"


def case_xmodem_upload(s: Session, tmp: str) -> str:
    _set_protocol(s, "4")   # XMODEM-CRC
    name, body = _upload(s, tmp, lambda n: ["sz", "--xmodem", "-b", n], "xmodem-crc")
    _finish_upload_screens(s)
    STATE["xmodem_file"] = (name, body)
    return f"{name} ({len(body)} bytes) sent"


def case_xmodem_download(s: Session, tmp: str) -> str:
    check("xmodem_file" in STATE, "needs xmodem-upload first in the same run")
    name, body = STATE["xmodem_file"]
    _set_protocol(s, "4")
    got = _download(s, tmp, name, ["rz", "--xmodem", "-b", name])
    # XMODEM pads the last block with SUB (0x1A); the file may come back longer.
    check(got.rstrip(b"\x1a") == body.rstrip(b"\x1a"), f"{name}: content differs ({len(got)} vs {len(body)})")
    return f"{name} round-tripped (SUB padding aside)"


STATE: dict = {}

CASES: list[tuple[str, Callable[[Session, str], str]]] = [
    ("login", case_login),
    ("time", case_time),
    ("join", case_join),
    ("stats", case_stats),
    ("zmodem-upload", case_zmodem_upload),
    ("zmodem-download", case_zmodem_download),
    ("xmodem-upload", case_xmodem_upload),
    ("xmodem-download", case_xmodem_download),
]


# -- the runner ---------------------------------------------------------------

def load(path: str) -> dict:
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save(path: str, results: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + ".tmp", "w") as f:
        json.dump(results, f, indent=2, sort_keys=True)
    os.replace(path + ".tmp", path)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--port", type=int, default=64128)
    ap.add_argument("--user", default="sysop")
    ap.add_argument("--password", default="sysop")
    ap.add_argument("--only", action="append", default=[], help="run just this case; repeatable")
    ap.add_argument("--failed", action="store_true", help="run only the cases that failed last time")
    ap.add_argument("--all", action="store_true", help="run every case, passed or not")
    ap.add_argument("--results", default=DEFAULT_RESULTS)
    ap.add_argument("--log", default=os.path.join(tempfile.gettempdir(), "bbs-regress.log"),
                    help="raw screen bytes, for --watch or tail -f")
    ap.add_argument("--watch", action="store_true", help="open a Terminal tab tailing --log")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    if args.list:
        for name, _ in CASES:
            print(name)
        return 0

    results = load(args.results)
    board = f"{args.host}:{args.port}"
    past = results.get(board, {})

    wanted = [c for c in CASES if not args.only or c[0] in args.only]
    if args.failed:
        wanted = [c for c in wanted if past.get(c[0], {}).get("verdict") == "FAIL"]
    elif not args.all and not args.only:
        wanted = [c for c in wanted if past.get(c[0], {}).get("verdict") != "PASS"]
    if not wanted:
        print(f"[OK] nothing to run for {board} - every case passed. --all to run them again.")
        return 0

    open(args.log, "ab").close()
    watched = False
    failures = 0
    for name, fn in wanted:
        tmp = tempfile.mkdtemp(prefix=f"bbs-regress-{name}-")
        started = time.time()
        verdict, note = "FAIL", ""
        try:
            s = Session(args.host, args.port, args.user, args.password, args.log, args.watch and not watched)
            watched = True
            s.note(f"CASE {name}")
            s.login()
            note = fn(s, tmp)
            verdict = "PASS"
            try:
                s.logoff()
            except Timeout:
                s.close()
        except (Failed, Timeout) as problem:
            note = str(problem)
        except Exception as problem:  # a crash in the harness is a failure too, and says where
            note = f"{type(problem).__name__}: {problem} @ {traceback.extract_tb(problem.__traceback__)[-1].lineno}"
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        if verdict == "FAIL":
            failures += 1
        past[name] = {"verdict": verdict, "note": note, "seconds": round(time.time() - started, 1),
                      "at": dt.datetime.now().isoformat(timespec="seconds")}
        results[board] = past
        save(args.results, results)   # recorded as each case finishes
        print(f"[{'OK' if verdict == 'PASS' else 'FAIL'}] {name}: {note}")

    print(f"\n{len(wanted) - failures} passed, {failures} failed. Results: {args.results}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
