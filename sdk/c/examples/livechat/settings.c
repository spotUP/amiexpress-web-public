/*
 * LIVECHAT68's settings, declared once, beside the door that reads them.
 *
 * Generates Doors/LIVECHAT68/door.settings.json (make settings). cfgKey is
 * what lands in LIVECHAT.cfg, the plain Key=value file the 68K binary opens.
 */
#include "ae_settings.h"

AE_SETTINGS_BEGIN(LC, "LIVECHAT.cfg")
  AE_SETTING_STR_HELP("host", "Door server host", "doors.uprough.net", "Host",
    "Plain HTTP host serving /chat/v1. The 68K stack cannot do TLS, so this is http, not https.")
  AE_SETTING_INT_RANGE("port", "Port", 80, 1, 65535, "Port",
    "80 for the live door server.")
  AE_SETTING_SECRET_SYS("boardKey", "Board key", "BoardKey", "achievements_board_key",
    "The board's key for the door server, in the form <board>.<secret>. Left blank, the door uses the board's own achievements board key from System Config - you do not need to paste it here.")
  AE_SETTING_STR_HELP("boardId", "Board id (optional)", "", "BoardId",
    "Leave empty and the door takes the id from the key's own prefix.")
  AE_SETTING_INT_RANGE("timeout", "Request timeout (seconds)", 10, 1, 120, "Timeout", NULL)
AE_SETTINGS_END
