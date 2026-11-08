/*
 * LIVECHAT68's settings, declared once, beside the door that reads them.
 *
 * Generates Doors/LIVECHAT68/door.settings.json (make settings). cfgKey is
 * what lands in LIVECHAT.cfg, the plain Key=value file the 68K binary opens.
 */
#include "ae_settings.h"

AE_SETTINGS_BEGIN(LC, "LIVECHAT.cfg")
  AE_SETTING_STR_HELP("host", "Door server host", "doors.uprough.net", "Host",
    "Host serving /chat/v1. The door speaks HTTPS to it through AmiSSL 5 (amisslmaster.library) unless Use TLS is off.")
  AE_SETTING_INT_RANGE("port", "Port", 443, 1, 65535, "Port",
    "443 for the live door server over TLS; 80 only with Use TLS off and Allow plain HTTP on.")
  AE_SETTING_BOOL("tls", "Use TLS", 1, "Tls")
  AE_SETTING_BOOL("allowPlainHttp", "Allow plain HTTP", 0, "AllowPlainHttp")
  AE_SETTING_SECRET_SYS("boardKey", "Board key", "BoardKey", "achievements_board_key",
    "The board's key for the door server, in the form <board>.<secret>. Left blank, the door uses the board's own achievements board key from System Config - you do not need to paste it here.")
  AE_SETTING_STR_HELP("boardId", "Board id (optional)", "", "BoardId",
    "Leave empty and the door takes the id from the key's own prefix.")
  AE_SETTING_INT_RANGE("timeout", "Request timeout (seconds)", 10, 1, 120, "Timeout", NULL)
AE_SETTINGS_END
