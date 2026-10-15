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


if __name__ == "__main__":
    unittest.main()
