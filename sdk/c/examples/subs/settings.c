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
 * is not an error, and the setting below has a working default.
 *
 * SysopLevel and SysopName are gone (2026-10-04): who reads private mail is
 * the board's ACS answer, and the comment-to-sysop flow went with them - see
 * the cfg parser in subs.c.
 */
#include "ae_settings.h"

AE_SETTINGS_BEGIN(SUBS, "SUBS.cfg")
  AE_SETTING_INT_RANGE("feedWindow", "Messages held in the feed", 100, 10, 200, "FeedWindow",
    "How many of the newest messages the door keeps on screen at once. Each one costs about 110 bytes of the door's memory on the Amiga, so 200 is the ceiling.")
AE_SETTINGS_END
