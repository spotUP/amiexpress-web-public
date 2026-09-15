/*
 * REQUESTS' settings, declared once, beside the door that reads them.
 *
 * This replaces a hand-written Doors/REQUESTS/door.settings.json. The two are
 * byte-compared by web/backend/tests/doors/c-sdk-settings-manifest.test.ts, so
 * if this declaration and the shipped manifest ever disagree, the test says so
 * rather than the sysop discovering it through a form that edits nothing.
 *
 * cfgKey is what lands in REQUESTS.cfg, which is the plain Key=value file the
 * 68K binary actually opens. The admin never writes that file directly:
 * renderAllDoorCfgs regenerates it from the saved settings at boot.
 */
#include "ae_settings.h"

AE_SETTINGS_BEGIN(REQ, "REQUESTS.cfg")
  AE_SETTING_STR_HELP("host", "Door server host", "doors.uprough.net", "Host",
    "Plain HTTP host serving /requests/v1. The 68K stack cannot do TLS, so this is http, not https.")
  AE_SETTING_INT_RANGE("port", "Port", 80, 1, 65535, "Port",
    "80 for the live door server.")
  AE_SETTING_SECRET_SYS("boardKey", "Board key", "BoardKey", "achievements_board_key",
    "The board's key for the door server, in the form <board>.<secret>. Left blank, the door uses the board's own achievements board key from System Config - you do not need to paste it here.")
  AE_SETTING_STR_HELP("boardId", "Board id (optional)", "", "BoardId",
    "Leave empty and the door takes the id from the key's own prefix.")
  AE_SETTING_INT_RANGE("timeout", "Request timeout (seconds)", 10, 1, 120, "Timeout", NULL)
  AE_SETTING_STR_HELP("bulletin", "Bulletin file", "BBS:Bulletins/bull9.txt", "Bulletin",
    "The board's requests screen, rewritten when a caller adds or changes a request - and repaired when what is on disk does not fit a 24-row terminal. Clear it and the door writes no bulletin at all.")
  AE_SETTING_STR_HELP("bulletinHeader", "Bulletin header art", "Bulletin_Header.txt", "BulletinHeader",
    "The art above the request table, relative to the door's own folder. Its height comes off the 23-row budget, so taller art shows fewer requests.")
  AE_SETTING_STR_HELP("bulletinTail", "Bulletin tail art", "Bulletin_Tail.txt", "BulletinTail",
    "The art below the request table, relative to the door's own folder.")
AE_SETTINGS_END
