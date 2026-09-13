/*
 * TEXTTV's settings, declared once, beside the door that reads them.
 *
 * Byte-compared with Doors/TEXTTV/door.settings.json by
 * web/backend/tests/doors/c-sdk-settings-manifest.test.ts (the REQUESTS
 * pattern) - if the declaration and the shipped manifest disagree, the
 * test says so rather than the sysop discovering it through a form that
 * edits nothing.
 *
 * cfgKey is what lands in TEXTTV.cfg, the plain Key=value file the 68K
 * binary actually opens. The admin never writes that file directly:
 * renderAllDoorCfgs regenerates it from the saved settings at boot.
 */
#include "ae_settings.h"

AE_SETTINGS_BEGIN(TEXTTV, "TEXTTV.cfg")
  AE_SETTING_STR_HELP("host", "Text-TV proxy host", "127.0.0.1", "Host",
    "Board serving /api/texttv over plain HTTP. Loopback: the door runs beside the board (container or localhost), where the public hostname hairpins and stalls. Point at the LAN IP for a classic Amiga.")
  AE_SETTING_INT_RANGE("port", "Port", 3002, 1, 65535, "Port",
    "3002 is the board's Text-TV sidecar, a SEPARATE process on loopback. Never the board's own port (3001): a door that fetches from the process running it parks the shared event loop and takes every caller down with it.")
  AE_SETTING_INT_RANGE("timeout", "Request timeout (seconds)", 15, 1, 120, "Timeout", NULL)
  AE_SETTING_INT_RANGE("startPage", "Start page", 100, 100, 999, "StartPage",
    "Page the door opens on. 100 is the news front.")
  AE_SETTING_STR_HELP("favorites", "Favorite pages", "100,300", "Favorites",
    "Comma-separated page numbers, kept in the index below the curated list.")
AE_SETTINGS_END
