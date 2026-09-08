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

AE_SETTINGS_BEGIN(REQUESTS, "REQUESTS.cfg")
  AE_SETTING_STR_HELP("host", "Door server host", "doors.uprough.net", "Host",
    "Plain HTTP host serving /requests/v1. The 68K stack cannot do TLS, so this is http, not https.")
  AE_SETTING_INT_RANGE("port", "Port", 80, 1, 65535, "Port",
    "80 for the live door server.")
  AE_SETTING_SECRET("boardKey", "Board key", "BoardKey",
    "The board's key for the door server, in the form <board>.<secret>. Same key the achievements surface uses. Stored beside the door and never committed.")
  AE_SETTING_STR_HELP("boardId", "Board id (optional)", "", "BoardId",
    "Leave empty and the door takes the id from the key's own prefix.")
  AE_SETTING_INT_RANGE("timeout", "Request timeout (seconds)", 10, 1, 120, "Timeout", NULL)
AE_SETTINGS_END
