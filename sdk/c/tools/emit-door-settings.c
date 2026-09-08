/*
 * Host-native companion: writes Doors/<door>/door.settings.json at BUILD time.
 *
 * The door's settings are declared in its own source with the AE_SETTINGS_*
 * macros. This links against that same declaration and prints the manifest, so
 * the admin form is generated from the exact table the door reads its values
 * from - not from a JSON file somebody has to remember to update.
 *
 * Compiled for the HOST, not the Amiga: nothing has to run a 68K binary to
 * learn what it can be told, and a door that has never booted still gets a
 * settings form the sysop can fill in.
 *
 *   cc -I include tools/emit-door-settings.c src/ae_settings.c \
 *      examples/<door>/settings.c -o emit && ./emit > door.settings.json
 */
#include "ae_settings.h"

int main(void) {
  return ae_settings_emit_manifest(stdout, ae_settings_table_of());
}
