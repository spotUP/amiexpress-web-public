/*
 * SUBS' settings, declared once, beside the door that reads them.
 *
 * This replaces a hand-written Doors/SUBS/door.settings.json. The two are
 * byte-compared by web/backend/tests/doors/c-sdk-settings-manifest.test.ts, so
 * if this declaration and the shipped manifest ever disagree the test says so,
 * rather than the sysop discovering it through an admin form that edits
 * nothing. Hand-editing the JSON is what that test exists to catch.
 *
 * cfgKey is what lands in SUBS.cfg, the plain Key=value file the 68K binary
 * opens. The admin never writes that file directly - renderAllDoorCfgs
 * regenerates it from the saved settings at boot.
 *
 * Unlike REQUESTS this door needs no secret and no server: a missing SUBS.cfg
 * is not an error, and both settings below have working defaults.
 */
#include "ae_settings.h"

AE_SETTINGS_BEGIN(SUBS, "SUBS.cfg")
  AE_SETTING_INT_RANGE("feedWindow", "Messages held in the feed", 100, 10, 200, "FeedWindow",
    "How many of the newest messages the door keeps on screen at once. Each one costs about 110 bytes of the door's memory on the Amiga, so 200 is the ceiling.")
  AE_SETTING_INT_RANGE("sysopLevel", "Level that may read private mail", 255, 1, 255, "SysopLevel",
    "A caller at or above this level sees private messages between other people, as a sysop does at the R prompt. The door cannot read the board's ACS tables, so this is the one access rule it must be told. At 255, nobody gets it unless you have level-255 callers.")
  AE_SETTING_STR_HELP("sysopName", "Who a comment to the sysop is addressed to", "SYSOP", "SysopName",
    "The name a C (comment to sysop) message is written TO when this conference hands its message base to the door. express.e reads it off account slot 1 (express.e:8765-8777); a door cannot load accounts, so it has to be told. Leave it at SYSOP unless the sysop's account is named something else.")
AE_SETTINGS_END
