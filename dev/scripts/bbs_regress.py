#!/usr/bin/env python3
"""
Telnet regression suite, driven by READING the screen.

"write a full telnet regression script and test everything we can for
regressions? including file transfers" and "you are still guessing what to
type" (the sysop, 2026-09-27). Every step here waits until the prompt it
expects is on the cursor's row of the RENDERED 80x25 screen (bbs_screen.Board,
pyte), then types. Anything else fails the case with the screen attached - it
never presses a key on a guess. Each flow was walked by hand first.

  dev/scripts/.venv/bin/python dev/scripts/bbs_regress.py                 # cases not yet passed, LOCAL
  dev/scripts/.venv/bin/python dev/scripts/bbs_regress.py --only zmodem-upload
  dev/scripts/.venv/bin/python dev/scripts/bbs_regress.py --failed
  dev/scripts/.venv/bin/python dev/scripts/bbs_regress.py --all --watch   # Terminal tab for the sysop

Each case is its own call. Verdicts go to --results per board as each case
finishes; a run skips what passed unless --all (global rule 6a). The sysop's
transfer protocol is read before the first transfer case and put back after.
LOCAL by default; on --host bbs.uprough.net uploads land on the real board.
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
from bbs_screen import MENU_PROMPT, Board  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_RESULTS = os.path.join(REPO, "thoughts", "spot", "bbs-regress-results.json")

PAUSE = re.compile(r"space to resume:?$", re.I)
PRESS_KEY = re.compile(r"press any key to continue\.*$", re.I)
PROTOCOL_ROW = re.compile(r"\[\s*11\] TRANSFER PROTOCOL\.+\s*(\S.*)$")
PROTOCOL_NUMBER = {"ZMODEM": "1", "YMODEM": "2", "XMODEM-1K": "3", "XMODEM-CRC": "4", "XMODEM": "5",
                   "PUNTER": "6", "WEBSOCKET": "7"}


class Failed(Exception):
    """A check that did not hold. Carries the screen it failed on."""


# -- reading --------------------------------------------------------------------

def screen_text(b: Board) -> str:
    with b.lock:
        return "\n".join(line.rstrip() for line in b.screen.display)


def expect(b: Board, pattern: str | re.Pattern, what: str, timeout: float = 30.0) -> str:
    """Wait until the cursor's row ends with `pattern`. Returns the prompt."""
    wanted = re.compile(pattern, re.I) if isinstance(pattern, str) else pattern
    start = time.time()
    while time.time() - start < timeout:
        b.settle(0.6, 5.0)
        here = b.prompt()
        if wanted.search(here):
            return here
        if b.closed:
            break
    raise Failed(f"expected {what}; cursor row is {b.prompt()!r}\n{b.render()}")


def expect_on_screen(b: Board, pattern: str, what: str, timeout: float = 30.0) -> str:
    """Wait until `pattern` is anywhere on the screen (a result line, not a prompt)."""
    wanted = re.compile(pattern, re.I | re.M)
    start = time.time()
    while time.time() - start < timeout:
        b.settle(0.6, 5.0)
        m = wanted.search(screen_text(b))
        if m:
            return m.group(0)
    raise Failed(f"expected {what} on screen\n{b.render()}")


def check(ok: bool, what: str, b: Board) -> None:
    if not ok:
        raise Failed(f"{what}\n{b.render()}")


def to_menu(b: Board, timeout: float = 40.0) -> None:
    """Answer pauses (read, never guessed) until the menu prompt."""
    start = time.time()
    while time.time() - start < timeout:
        b.settle(0.8, 10.0)
        here = b.prompt()
        if MENU_PROMPT.search(here):
            return
        if PAUSE.search(here) or PRESS_KEY.search(here):
            b.send("\r")
            continue
        if here == "":
            continue           # a door is still thinking
        raise Failed(f"expected the menu; the board asks {here!r}\n{b.render()}")
    raise Failed(f"never got back to the menu\n{b.render()}")


# -- steps walked by hand ---------------------------------------------------------

def read_protocol(b: Board) -> str:
    b.send("W\r")
    expect(b, r"Which to change <CR>=QUIT \?$", "the W menu")
    m = PROTOCOL_ROW.search(expect_on_screen(b, r"\[\s*11\] TRANSFER PROTOCOL.*$", "the protocol row"))
    b.send("\r")
    expect(b, MENU_PROMPT, "the menu after W")
    return m.group(1).strip() if m else ""


def set_protocol(b: Board, name: str) -> None:
    b.send("W\r")
    expect(b, r"Which to change <CR>=QUIT \?$", "the W menu")
    b.send("11\r")
    expect(b, r"Select \(1-7\) or <CR>=Cancel:$", "the protocol list")
    b.send(PROTOCOL_NUMBER[name.upper()] + "\r")
    expect(b, r"Which to change <CR>=QUIT \?$", "the W menu again")
    row = expect_on_screen(b, r"\[\s*11\] TRANSFER PROTOCOL.*$", "the protocol row")
    check(row.upper().rstrip().endswith(name.upper()), f"protocol row says {row!r}, wanted {name}", b)
    b.send("\r")
    expect(b, MENU_PROMPT, "the menu after W")


def answer_leftovers(b: Board) -> None:
    """A partial upload from an earlier call is offered first: decline, delete."""
    for _ in range(40):
        b.settle(1.0, 10.0)
        here = b.prompt()
        if re.search(r"Resume .+\(Y/N\)\?$", here):
            b.send("N")                  # one key: Y/N answers without RETURN
        elif re.search(r"Delete \(Y/N/All\)\?$", here):
            b.send("Y")
        else:
            return


def test_file(tmp: str, name: str) -> bytes:
    # Every byte value, and the pairs telnet mangles: CR NUL, CR LF, IAC, 0D FF 00.
    body = bytes(range(256)) + b"\r\x00\r\n\xff\xff\x0d\xff\x00" + os.urandom(4000)
    with open(os.path.join(tmp, name), "wb") as f:
        f.write(body)
    return body


def upload(b: Board, tmp: str, protocol: str) -> tuple[str, bytes]:
    xmodem = protocol.upper().startswith("XMODEM")
    name = f"RG{random.randint(100000, 999999)}.BIN"
    body = test_file(tmp, name)
    b.send("U\r")
    expect(b, r"FileName 1:$", "FileName 1:", timeout=40)
    header = expect_on_screen(b, r"^\S+ UPLOADING to .*$", "the upload header")
    check(header.lower().startswith(protocol.lower() + " "), f"upload header {header!r} is not {protocol}", b)
    if xmodem:
        # XMODEM carries no name: the board takes it, and the description, first.
        b.send(name + "\r")
        field = expect(b, rf"{re.escape(name)}\s*:$", "the description field")
        # express.e:17728-17729: the colon sits at column 32, under the ruler's [.
        check(field.index(":") == 32, f"the description field's colon is at column {field.index(':')}, not 32 under the ruler", b)
        b.send("regression upload\r")
        expect(b, r"^\s+:$", "the next description line")
        b.send("\r")
        expect(b, r"FileName 2:$", "FileName 2:")
    b.send("\r")
    expect(b, r"\(A\)bort\?$", "the Okay prompt")
    b.send("\r")
    answer_leftovers(b)
    if xmodem:
        # The receiver asks with 'C' (CRC), repeated until a sender answers,
        # on its own row once the board's text has gone out first.
        expect(b, r"^C+$", "the receiver's C", timeout=20)
        rc = b.relay(tmp, ["sz", "--xmodem", "-b", name])
    else:
        expect_on_screen(b, r"^\*\*", "rz's ZRINIT", timeout=20)
        rc = b.relay(tmp, ["sz", "-b", name])
    check("exit 0" in rc, f"client {rc}", b)
    if not xmodem:
        expect(b, rf"{re.escape(name)}\s+\d+\s+\d\d-\d\d-\d\d :$", "the description prompt", timeout=40)
        b.send("regression upload\r")
        expect(b, r"^\s+:$", "the next description line")
        b.send("\r")
    expect_on_screen(b, r"^\s*1 file\(s\),.*efficiency\.$", "'1 file(s)' in the upload summary", timeout=40)
    to_menu(b)
    return name, body


def download(b: Board, tmp: str, name: str, argv: list[str], xmodem: bool) -> bytes:
    out_dir = os.path.join(tmp, "down")
    os.makedirs(out_dir, exist_ok=True)
    b.send("D\r")
    here = expect(b, r"(Space To Resume:|Filespec\(1\):)$", "the download screen", timeout=40)
    if PAUSE.search(here):
        b.send("\r")
        expect(b, r"Filespec\(1\):$", "Filespec(1):")
    b.send(name + "\r")
    here = expect(b, r"Filespec\([12]\):$", "Filespec(2):")
    check("Filespec(2)" in here, f"the board did not find {name}", b)
    b.send("\r")
    expect(b, r"LAST CHANCE!.*\(A\)bort\?$", "LAST CHANCE")
    b.send("\r")
    if xmodem:
        b.settle(1.5, 5.0)     # an XMODEM sender says nothing: the receiver opens
    else:
        expect_on_screen(b, r"Starting ZMODEM send", "the ZMODEM send starting", timeout=20)
    rc = b.relay(out_dir, argv)
    check("exit 0" in rc, f"client {rc}", b)
    to_menu(b)
    got = os.path.join(out_dir, name)
    check(os.path.exists(got), f"{name} did not arrive", b)
    with open(got, "rb") as f:
        return f.read()


# -- the cases --------------------------------------------------------------------

STATE: dict = {}


def case_login(b: Board, _tmp: str) -> str:
    return "at the menu prompt"


def case_time(b: Board, _tmp: str) -> str:
    b.send("T\r")
    expect(b, MENU_PROMPT, "the menu after T - with no extra key")
    shown = expect_on_screen(b, r"It is \d\d-\d\d-\d\d \d\d:\d\d:\d\d", "the time")
    mo, d, y, hh, mm, ss = (int(x) for x in re.findall(r"\d+", shown))
    drift = abs((dt.datetime.now() - dt.datetime(2000 + y, mo, d, hh, mm, ss)).total_seconds())
    check(drift < 120, f"board time is {drift:.0f}s from this machine's local time", b)
    return f"time within {drift:.0f}s, prompt back without a key"


def case_join(b: Board, _tmp: str) -> str:
    b.send("J 2\r")
    to_menu(b)
    check("[2:" in b.prompt(), "the prompt does not name conference 2", b)
    b.send("J 1\r")
    to_menu(b)
    check("[1:" in b.prompt(), "the prompt does not name conference 1", b)
    return "joined 2 and back to 1"


def case_stats(b: Board, _tmp: str) -> str:
    b.send("S\r")
    to_menu(b)
    expect_on_screen(b, r"(Uploads|Downloads|Calls)", "user stats")
    return "stats shown, prompt back"


def case_bulletins(b: Board, _tmp: str) -> str:
    """B lists the bulletins, reads one, and Q leaves - walked by hand first."""
    b.send("B\r")
    expect(b, re.compile(r"Select Bulletin .*Quit:$", re.I), "the bulletin menu")
    b.send("1\r")
    expect(b, re.compile(r"Select .*Quit:$", re.I), "the bulletin reader's prompt after bulletin 1")
    b.send("Q\r")
    to_menu(b)
    return "listed, read bulletin 1, back at the menu"


def case_file_list(b: Board, _tmp: str) -> str:
    """F on directory 1 lists files and hands back the menu after Q."""
    b.send("F\r")
    expect(b, re.compile(r"Directories: .*\?$", re.I), "the directory prompt")
    b.send("1\r")
    expect(b, re.compile(r"(More\?|Quit:)", re.I), "the end of the listing")
    shown = b.render()
    check("Scanning dir 1" in shown, "the listing never scanned dir 1", b)
    b.send("Q\r")
    to_menu(b)
    return "dir 1 listed, back at the menu"


def case_message_read(b: Board, _tmp: str) -> str:
    """R opens the reader on conference 1, a message opens, Q twice leaves.

    Conference 1 holds Conftop results - raw ANSI - so a colour code printed
    as text shows up here: the SUBS pager used to send ` [32m17.` and the
    board's bare-escape patch missed where an XIM message split it
    (2026-09-28)."""
    b.send("J 1\r")
    to_menu(b)
    b.send("R\r")
    expect(b, re.compile(r"Q=Leave$", re.I), "the message list", timeout=45)
    b.send("\r")
    expect(b, re.compile(r"Q LEAVE$", re.I), "an open message")
    shown = b.render()
    stray = re.search(r"\[\d+(;\d+)*m", shown)
    check(stray is None, f"a colour code printed as text: {stray.group(0) if stray else ''}", b)
    b.send("Q")
    expect(b, re.compile(r"Q=Leave$", re.I), "the list again")
    b.send("Q")
    to_menu(b)
    return "read a message, no colour code as text, back at the menu"


def message_count(b: Board) -> int:
    found = re.search(r"(\d+) messages here", b.render())
    if not found:
        raise Failed(f"the message list does not say how many messages it holds\n{b.render()}")
    return int(found.group(1))


def case_message_post(b: Board, _tmp: str) -> str:
    """E posts to everyone on conference 1: the list holds one more after S.

    Writes a message to the board it runs against - local by default."""
    b.send("J 1\r")
    to_menu(b)
    b.send("R\r")
    expect(b, re.compile(r"Q=Leave$", re.I), "the message list", timeout=45)
    before = message_count(b)
    b.send("Q")
    to_menu(b)
    b.send("E\r")
    expect(b, re.compile(r"Post to everyone in this conference\? \[Y/n\]$", re.I), "the recipient question", timeout=45)
    b.send("Y")
    expect(b, re.compile(r"Subject:$", re.I), "the subject prompt")
    b.send(f"regress {int(time.time())}\r")
    expect(b, re.compile(r"1>$"), "the first body line")
    b.send("posted by bbs_regress.py\r")
    b.send("\r")
    expect(b, re.compile(r"Msg\. Options: .*>:$", re.I), "the message options")
    b.send("S\r")
    expect(b, re.compile(r"Q=Leave$", re.I), "the list after saving", timeout=45)
    after = message_count(b)
    check(after == before + 1, f"the list held {before} and holds {after} after posting", b)
    b.send("Q")
    to_menu(b)
    return f"posted: {before} -> {after} messages"


def case_door_ctop(b: Board, _tmp: str) -> str:
    """A door that draws and hands the menu back by itself."""
    b.send("ctop\r")
    to_menu(b, timeout=60)
    expect_on_screen(b, r"Top Uploader Record", "the ctop table")
    return "ctop drew its table and gave the menu back"


def case_zmodem_upload(b: Board, tmp: str) -> str:
    set_protocol(b, "ZMODEM")
    name, body = upload(b, tmp, "zmodem")
    STATE["zmodem"] = (name, body)
    return f"{name} filed"


def case_zmodem_download(b: Board, tmp: str) -> str:
    if "zmodem" not in STATE:
        raise Failed("needs zmodem-upload in the same run")
    name, body = STATE["zmodem"]
    set_protocol(b, "ZMODEM")
    got = download(b, tmp, name, ["rz", "-b", "-y"], xmodem=False)
    check(got == body, f"{name}: {len(got)} bytes back, {len(body)} sent, content differs", b)
    return f"{name} round-tripped byte for byte"


def case_xmodem_upload(b: Board, tmp: str) -> str:
    set_protocol(b, "XMODEM-CRC")
    name, body = upload(b, tmp, "xmodem-crc")
    STATE["xmodem"] = (name, body)
    return f"{name} filed"


def case_xmodem_download(b: Board, tmp: str) -> str:
    if "xmodem" not in STATE:
        raise Failed("needs xmodem-upload in the same run")
    name, body = STATE["xmodem"]
    set_protocol(b, "XMODEM-CRC")
    got = download(b, tmp, name, ["rz", "--xmodem", "-b", name], xmodem=True)
    # XMODEM pads the last block with SUB (0x1A): the prefix is the file.
    check(got[:len(body)] == body and set(got[len(body):]) <= {0x1A}, f"{name}: content differs", b)
    return f"{name} round-tripped (block padding aside)"


def petscii_plain(data: bytes) -> str:
    """A PETSCII wire's letters as ASCII: capitals are $C1-$DA, lower case $41-$5A."""
    return bytes((c - 0x80) if 0xC1 <= c <= 0xDA else c for c in data).decode("latin1").upper()


def case_c64_connect(args: argparse.Namespace) -> str:
    """A C64 that negotiates nothing (a WiFi modem): the DEL-probe makes it
    PETSCII, and it takes the same pre-login pipeline as everyone - the connect
    banner before the title - without being told a door it never asked for
    needs 80 columns (FRONTEND runs armed). Audit item 10, 2026-09-28."""
    from bbs_telnet import Session
    s = Session(args.host, args.port, ttype=None, naws=(40, 25))
    try:
        seen, end = b"", time.time() + 10
        while not seen and time.time() < end:
            seen += s.pump(0.5)
        s.sock.sendall(b"\x14")  # PETSCII DEL, the probe
        end = time.time() + 15
        while "SERNAME" not in petscii_plain(seen) and time.time() < end:
            seen += s.pump(0.5)
        text = petscii_plain(seen)
        if "SERNAME" not in text:
            raise Failed(f"no login prompt: {text[-200:]!r}")
        if "CONNECTION TO NODE" not in text:
            raise Failed("no connect banner before the title")
        if "80 COLUMN" in text:
            raise Failed("told a door needs 80 columns at connect")
        return "banner, title and login prompt; no 80-column refusal"
    finally:
        s.close()


# Cases that make their own connection instead of logging in through call().
RAW_CASES: dict[str, Callable[[argparse.Namespace], str]] = {
    "c64-connect": case_c64_connect,
}

CASES: list[tuple[str, Callable[[Board, str], str]]] = [
    ("login", case_login),
    ("time", case_time),
    ("join", case_join),
    ("stats", case_stats),
    ("bulletins", case_bulletins),
    ("file-list", case_file_list),
    ("message-read", case_message_read),
    ("message-post", case_message_post),
    ("door-ctop", case_door_ctop),
    ("zmodem-upload", case_zmodem_upload),
    ("zmodem-download", case_zmodem_download),
    ("xmodem-upload", case_xmodem_upload),
    ("xmodem-download", case_xmodem_download),
    ("c64-connect", lambda _b, _t: ""),  # runs from RAW_CASES
]
TRANSFER_CASES = {n for n, _ in CASES if "modem" in n}


# -- the runner -------------------------------------------------------------------

class _Done(Exception):
    """A raw case finished; skip the logged-in part of the loop."""


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


def call(args: argparse.Namespace, watch: bool, quick: bool = True) -> Board:
    """Log in. `quick` answers AQ at the graphics prompt - ANSI, skip the
    bulletins - which lands at the main prompt (the sysop's tip, 2026-09-27);
    only the login case walks the whole sequence."""
    b = Board(args.host, args.port, args.log, watch)
    b.s.note("LOGIN" + (" (AQ: skipping bulletins)" if quick else ""))
    if quick:
        expect(b, r"\(A/R/P/P8/T/N\).*\?$", "the graphics prompt")
        b.send("AQ\r")
    log = b.advance(args.user, args.password)
    if not MENU_PROMPT.search(b.prompt()):
        raise Failed("login did not reach the menu:\n" + log)
    return b


def hang_up(b: Board) -> None:
    try:
        if MENU_PROMPT.search(b.prompt()):
            b.send("G\r")
            b.settle(1.0, 5.0)
            if re.search(r"\(Y/N\)\??$", b.prompt()):
                b.send("Y")
                b.settle(1.0, 5.0)
    finally:
        b.closed = True
        b.s.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--port", type=int, default=64128)
    ap.add_argument("--user", default="sysop")
    ap.add_argument("--password", default="sysop")
    ap.add_argument("--only", action="append", default=[])
    ap.add_argument("--failed", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--results", default=DEFAULT_RESULTS)
    ap.add_argument("--log", default=os.path.join(tempfile.gettempdir(), "bbs-regress.log"))
    ap.add_argument("--watch", action="store_true")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    if args.list:
        print("\n".join(n for n, _ in CASES))
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
        print(f"[OK] nothing to run for {board}. --all to run them again.")
        return 0

    open(args.log, "ab").close()
    watch = args.watch
    original_protocol = None
    failures = 0
    for name, fn in wanted:
        tmp = tempfile.mkdtemp(prefix=f"bbs-regress-{name}-")
        started = time.time()
        verdict, note = "FAIL", ""
        b = None
        try:
            if name in RAW_CASES:
                note = RAW_CASES[name](args)
                verdict = "PASS"
                raise _Done()
            b = call(args, watch, quick=(name != "login"))
            watch = False
            b.s.note(f"CASE {name}")
            if name in TRANSFER_CASES and original_protocol is None:
                original_protocol = read_protocol(b)
            note = fn(b, tmp)
            verdict = "PASS"
        except _Done:
            pass
        except Failed as problem:
            note = str(problem)
        except Exception as problem:
            note = f"{type(problem).__name__}: {problem} @ line {traceback.extract_tb(problem.__traceback__)[-1].lineno}"
        finally:
            if b is not None:
                hang_up(b)
            shutil.rmtree(tmp, ignore_errors=True)
        failures += verdict == "FAIL"
        past[name] = {"verdict": verdict, "note": note.splitlines()[0] if note else "",
                      "seconds": round(time.time() - started, 1),
                      "at": dt.datetime.now().isoformat(timespec="seconds")}
        results[board] = past
        save(args.results, results)
        print(f"[{'OK' if verdict == 'PASS' else 'FAIL'}] {name}: {note}")

    if original_protocol:
        try:
            b = call(args, False)
            set_protocol(b, original_protocol)
            hang_up(b)
            print(f"[INFO] transfer protocol put back to {original_protocol}")
        except Exception as problem:  # say so: the sysop's setting is not what it was
            print(f"[ERROR] could not put the protocol back to {original_protocol}: {problem}")

    print(f"\n{len(wanted) - failures} passed, {failures} failed. Results: {args.results}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
