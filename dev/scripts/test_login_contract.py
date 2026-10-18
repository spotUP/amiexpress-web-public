"""The login contract, checked on screens captured from the live board.

Run: dev/scripts/.venv/bin/python -m unittest dev/scripts/test_login_contract.py
Each case is a regression the sysop reported more than once (2026-09-28/29).
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from bbs_regress import login_contract  # noqa: E402

GLC_WHOLE = "GLOBAL LASTCALLERS! - (C) REBEL/qUARTEX\nUSERNAME  BBS\nALLTIME RECORDS: CALLS [361]\n(Pause)...Space To Resume:"
SAMI_WHOLE = "lAST cALLERS\n Super-AmiLog by P0T-NOoDLE\n The Actions: [-H-]\n(Pause)...Space To Resume:"
SCAN_PAUSED = "Scanning conferences for mail...\nScanning Conference: Requests - No mail today!\n(Pause)...Space To Resume:"
HEARD = "GLOBAL LASTCALLERS Super-AmiLog Scanning conferences for mail"
TIP = " TIP OF THE DAY\n| Tip of the day - Try WHIP |\n Any key: continues"


class LoginContract(unittest.TestCase):
    def test_a_good_login_holds(self):
        self.assertEqual(login_contract(HEARD, [GLC_WHOLE, SAMI_WHOLE, SCAN_PAUSED, TIP]), [])

    def test_no_pause_after_the_mail_scan(self):
        self.assertIn("no pause after the mail scan - the next screen drew over it",
                      login_contract(HEARD, [GLC_WHOLE, SAMI_WHOLE]))

    def test_global_last_callers_painted_over(self):
        # The tango logon logo spliced in front of the door (98c0d0dfc).
        broken_glc = "GLOBAL LASTCALLERS! - (C) REBEL/qUARTEX\n____ logo ____\n(Pause)...Space To Resume:"
        self.assertIn("Global Last Callers is not one whole page at its pause",
                      login_contract(HEARD, [broken_glc, SAMI_WHOLE, SCAN_PAUSED]))

    def test_a_lost_clear_leaves_super_amilog_under_the_mail_scan(self):
        leftover = "lAST cALLERS  Mo!/aC!\n____ mailscan logo ____\nScanning conferences for mail...\n(Pause)"
        self.assertTrue(any("clear was lost" in b for b in login_contract(HEARD, [GLC_WHOLE, SAMI_WHOLE, leftover])))

    def test_a_code_or_door_error_printed_as_text(self):
        broken = login_contract("~SS_BBS:bulletins/bull9.txt ERROR : Couldn't Open DirFile !", [])
        self.assertTrue(any("printed as text" in b for b in broken))


class TipOfTheDay(unittest.TestCase):
    def test_the_tip_stopped_running(self):
        self.assertIn("the tip of the day did not run",
                      login_contract(HEARD, [GLC_WHOLE, SAMI_WHOLE, SCAN_PAUSED]))

    def test_the_tip_ran_after_the_join(self):
        joined = "Joining Conference: C64 Demoscene\n(Pause)...Space To Resume:"
        self.assertIn("the tip of the day ran after the conference join, not before it",
                      login_contract(HEARD, [GLC_WHOLE, SAMI_WHOLE, SCAN_PAUSED, joined, TIP]))


class DoorNotInstalled(unittest.TestCase):
    def test_a_screen_runs_a_door_its_conference_has_not_set_up(self):
        broken = login_contract("Conference Top Uploaders is not installed in this conference.\r\n", [])
        self.assertTrue(any("printed as text" in b for b in broken))


class MailFoundAtLogon(unittest.TestCase):
    # 2026-10-12: the regress account got mail and the live login stopped at
    # express.e:11739's question as an "unknown prompt".
    def test_the_read_it_now_question_is_answered_no(self):
        from bbs_screen import KNOWN_PROMPTS
        row = "Would you like to read it now (Y/n)?"
        hits = [(keys, why) for pattern, keys, why in KNOWN_PROMPTS if pattern.search(row)]
        self.assertEqual(hits, [("n", "mail found")])

    def test_the_question_holds_the_mail_scan_like_a_pause(self):
        scan_asked = "Scanning conferences for mail...\nType     From\nWould you like to read it now (Y/n)?"
        self.assertEqual(login_contract(HEARD, [GLC_WHOLE, SAMI_WHOLE, scan_asked, TIP]), [])



class MenuDoorAtTheMainPrompt(unittest.TestCase):
    # 2026-10-16: the menu door (MAINMENU) stands in front of the main prompt;
    # the live login reached it and the contract failed "did not reach the
    # menu", because only the board's own text prompt counted as the menu.
    NAVIGATING = "Arrows and Enter, or type a command          Arrows Move  Enter Run  Esc Prompt"
    BOARD_PROMPT = "[Main] Menu (59 mins. left):"

    class FakeBoard:
        def __init__(self, row, after_esc):
            self.cursor_row, self.after_esc, self.sent = row, after_esc, []

        def prompt(self):
            return self.cursor_row if self.cursor_row.endswith(":") else ""

        def row(self):
            return self.cursor_row

        def send(self, keys, secret=False):
            self.sent.append(keys)
            if keys == "\x1b":
                self.cursor_row = self.after_esc

        def settle(self, quiet=0.8, limit=10.0):
            pass

    def test_the_menu_door_rows_are_recognised(self):
        from bbs_screen import MENU_DOOR_ROW
        for row in (self.NAVIGATING, "Arrows or type    Enter Run  Esc Prompt", "Arrows Move  Enter Run  Esc/q Prompt"):
            self.assertTrue(MENU_DOOR_ROW.search(row), row)
        # Typing, and a child list, are not the main prompt.
        for row in ("] Menu (59 mins. left): W    Enter Run  Tab Show  Esc Clear", "Arrows Move  Enter Run  Esc Back"):
            self.assertFalse(MENU_DOOR_ROW.search(row), row)

    def test_esc_puts_the_menu_door_away_and_the_board_prompt_counts(self):
        from bbs_screen import Board
        b = self.FakeBoard(self.NAVIGATING, self.BOARD_PROMPT)
        self.assertTrue(Board.at_menu(b))
        self.assertEqual(b.sent, ["\x1b"])

    def test_the_board_prompt_alone_needs_no_key(self):
        from bbs_screen import Board
        b = self.FakeBoard(self.BOARD_PROMPT, "")
        self.assertTrue(Board.at_menu(b))
        self.assertEqual(b.sent, [])

    def test_a_menu_door_that_does_not_leave_is_not_the_menu(self):
        from bbs_screen import Board
        self.assertFalse(Board.at_menu(self.FakeBoard(self.NAVIGATING, self.NAVIGATING)))


class TipOfTheDayScreen(unittest.TestCase):
    """The tip door's opening bytes from the live login of 2026-10-18. The
    driver read only the cursor's row, which sits in the animated title rail,
    so it never answered and the door's 30 s timeout ended the tip."""

    class Replay:
        def __init__(self):
            import threading
            import pyte
            from bbs_screen import as_glyphs
            self.lock = threading.Lock()
            self.screen = pyte.Screen(80, 25)
            path = os.path.join(os.path.dirname(__file__), "fixtures", "tip-of-day-live.ans")
            with open(path, "rb") as f:
                pyte.Stream(self.screen).feed(as_glyphs(f.read().decode("latin1")))

    def test_the_cursor_row_holds_no_question(self):
        from bbs_screen import KNOWN_PROMPTS, Board
        here = Board.prompt(self.Replay())
        self.assertFalse([why for pattern, _k, why in KNOWN_PROMPTS if pattern.search(here)], here)

    def test_the_whole_screen_is_the_tip_and_any_key_ends_it(self):
        from bbs_screen import Board
        self.assertEqual(Board.known_screen(self.Replay()), ("\r", "press a key"))

    def test_settle_stops_waiting_on_an_animated_screen(self):
        import time
        from bbs_screen import Board
        b = self.Replay()
        b.last_byte = time.time() + 60  # the rail never goes quiet
        start = time.time()
        Board.settle(b, 1.2, 5.0, until=lambda: Board.known_screen(b))
        self.assertLess(time.time() - start, 1.0)

    def test_the_tip_is_answered_once(self):
        # The door clears its screen a moment after the key; a second read
        # before then sent another CR, which answered the mail scan's
        # "read it now (Y/n)?" Yes on the live board (2026-10-18).
        import threading
        import time
        import pyte
        from bbs_screen import Board
        b = Board.__new__(Board)
        replay = self.Replay()
        b.lock, b.screen, b.pauses, b.closed = replay.lock, replay.screen, [], False
        b.last_byte = time.time()
        sent = []

        def send(keys, secret=False):
            sent.append(keys)
            b.last_byte = time.time()

            def leave():
                pyte.Stream(b.screen).feed("\x1b[2J\x1b[H[Main] Menu (59 mins. left):")
                b.last_byte = time.time()
            threading.Timer(0.3, leave).start()
        b.send = send
        Board.advance(b, "regress", "secret", limit=5)
        self.assertEqual(sent, ["\r"])


if __name__ == "__main__":
    unittest.main()
