/*
 * ae_settings.h - a door declares its own settings, once, in its own source.
 *
 * WHY THIS EXISTS. A door registers in the admin automatically: the board
 * scans Commands/BBSCmd .info files at boot and 138 doors appear without anyone
 * lifting a finger. Its SETTINGS did not. Those needed a hand-written
 * Doors/<door>/door.settings.json, so of 138 registered doors exactly 8 had a
 * settings form and only one of those was a C door. A sysop could see every
 * door and configure almost none of them.
 *
 * The consuming half was already generic - door-settings.service.ts reads any
 * manifest, and `cfgFile` + per-setting `cfgKey` render the plain Key=value
 * file a 68K binary actually reads (renderAllDoorCfgs, at boot). The missing
 * link was a way to DECLARE, and the right place for that is beside the code
 * that reads the values, not in a JSON file somebody has to remember to keep
 * in step.
 *
 * HOW IT WORKS. The table below is a plain static array. The door includes
 * this header and writes its settings once:
 *
 *     AE_SETTINGS_BEGIN(REQUESTS, "REQUESTS.cfg")
 *       AE_SETTING_STR ("host", "Host", "doors.uprough.net", "Host")
 *       AE_SETTING_INT ("port", "Port", 80, "Port")
 *     AE_SETTINGS_END
 *
 * `ae_settings_emit_manifest()` writes the JSON the admin already knows how
 * to read. A host-native companion (sdk/c/tools/emit-door-settings.c) includes
 * the same declaration and writes Doors/<door>/door.settings.json at build
 * time - so nothing has to run the 68K binary to learn what it can be told,
 * and a door that never boots still gets a settings form.
 *
 * THE FIELDS MIRROR THE SCHEMA the backend validates against
 * (door-settings.service.ts): key <= 64, label <= 120, help <= 300,
 * command <= 50, at most 100 settings, and a choice must carry choices.
 * Anything this emits that the schema would reject is a bug HERE - the
 * generator is checked against that schema by
 * web/backend/tests/doors/c-sdk-settings-manifest.test.ts.
 */
#ifndef AE_SETTINGS_H
#define AE_SETTINGS_H

#include <stdio.h>

typedef enum {
  AE_SET_STRING = 0,
  AE_SET_NUMBER = 1,
  AE_SET_BOOL   = 2,
  AE_SET_CHOICE = 3
} ae_setting_type;

typedef struct {
  const char *value;
  const char *label;
} ae_setting_choice;

typedef struct {
  const char *key;        /* what the door reads it by            */
  const char *cfg_key;    /* the Key= in the rendered .cfg        */
  const char *label;      /* what the sysop sees                  */
  ae_setting_type type;
  const char *def_str;    /* default for STRING / CHOICE          */
  double      def_num;    /* default for NUMBER                   */
  int         def_bool;   /* default for BOOL                     */
  const char *help;       /* one sentence, or NULL                */
  int         has_range;  /* NUMBER only                          */
  double      min_v;
  double      max_v;
  int         secret;     /* never echoed back to the admin       */
  const ae_setting_choice *choices;  /* CHOICE only, NULL-terminated */
  /* Take the value from the board's system config when the door has none of
     its own, naming the system_config column. The board already holds the
     achievements board key; REQUESTS needs exactly that key, and a sysop
     should not have to copy a secret between two admin pages.
     Last member on purpose: every macro above predates it and C zero-fills
     what an initializer does not name. */
  const char *from_system_config;
  /* The VALUE of this setting names an art file inside the door's own folder,
     so the ANSI Studio offers it as a drawable slot and the picker writes
     this same setting - one declaration, one filename, no second list. Only
     meaningful on AE_SET_STRING. Last member for the same reason
     from_system_config is: every macro above predates it, and C zero-fills
     what an initializer does not name. */
  int         art;
  /* The files this art slot's Studio picker may offer, NULL-terminated, as
     `artChoices` patterns (a `*` inside a name). NULL: the default only - a door
     folder holds other slots' art, and a header slot offered the tails. */
  const char *const *art_choices;
} ae_setting;

typedef struct {
  const char *command;    /* the BBSCmd this door registers as    */
  const char *cfg_file;   /* bare filename, or NULL for none      */
  const ae_setting *settings;
  int count;
} ae_settings_table;

/* ---- the declaration macros ------------------------------------------- */

#define AE_SETTINGS_BEGIN(CMD, CFGFILE)                                       \
  static const char *ae__cmd = #CMD;                                          \
  static const char *ae__cfg = CFGFILE;                                       \
  static const ae_setting ae__settings[] = {

#define AE_SETTING_STR(key, label, def, cfgkey)                               \
  { key, cfgkey, label, AE_SET_STRING, def, 0, 0, NULL, 0, 0, 0, 0, NULL },

#define AE_SETTING_STR_HELP(key, label, def, cfgkey, help)                    \
  { key, cfgkey, label, AE_SET_STRING, def, 0, 0, help, 0, 0, 0, 0, NULL },

/* A string setting whose value NAMES AN ART FILE in the door's folder. The
   admin still gets an ordinary field - that is what writes the value - and
   the Studio additionally gets a slot whose picker writes this same setting. */
#define AE_SETTING_ART(key, label, def, cfgkey, help)                         \
  { key, cfgkey, label, AE_SET_STRING, def, 0, 0, help, 0, 0, 0, 0, NULL,     \
    NULL, 1 },

/* An art setting whose picker offers the alternates `choices_arr` names
   (a NULL-terminated array of patterns), not only its default. */
#define AE_SETTING_ART_CHOICES(key, label, def, cfgkey, help, choices_arr)    \
  { key, cfgkey, label, AE_SET_STRING, def, 0, 0, help, 0, 0, 0, 0, NULL,     \
    NULL, 1, choices_arr },

#define AE_SETTING_SECRET(key, label, cfgkey, help)                           \
  { key, cfgkey, label, AE_SET_STRING, "", 0, 0, help, 0, 0, 0, 1, NULL },

/* A secret the BOARD can supply. `syskey` names the system_config column used
   when the door has no value of its own. */
#define AE_SETTING_SECRET_SYS(key, label, cfgkey, syskey, help)               \
  { key, cfgkey, label, AE_SET_STRING, "", 0, 0, help, 0, 0, 0, 1, NULL, syskey },

#define AE_SETTING_INT(key, label, def, cfgkey)                               \
  { key, cfgkey, label, AE_SET_NUMBER, NULL, (double)(def), 0, NULL, 0, 0, 0, 0, NULL },

#define AE_SETTING_INT_RANGE(key, label, def, lo, hi, cfgkey, help)           \
  { key, cfgkey, label, AE_SET_NUMBER, NULL, (double)(def), 0, help, 1,       \
    (double)(lo), (double)(hi), 0, NULL },

#define AE_SETTING_BOOL(key, label, def, cfgkey)                              \
  { key, cfgkey, label, AE_SET_BOOL, NULL, 0, (def), NULL, 0, 0, 0, 0, NULL },

#define AE_SETTING_CHOICE(key, label, def, cfgkey, choices_arr)               \
  { key, cfgkey, label, AE_SET_CHOICE, def, 0, 0, NULL, 0, 0, 0, 0, choices_arr },

#define AE_SETTINGS_END                                                       \
  };                                                                          \
  static const ae_settings_table ae__table = {                                \
    NULL, NULL, ae__settings,                                                 \
    (int)(sizeof(ae__settings) / sizeof(ae__settings[0]))                     \
  };                                                                          \
  const ae_settings_table *ae_settings_table_of(void) {                       \
    static ae_settings_table t;                                               \
    t = ae__table;                                                            \
    t.command = ae__cmd;                                                      \
    t.cfg_file = ae__cfg;                                                     \
    return &t;                                                                \
  }

/* Declared by AE_SETTINGS_END; the emitter links against it. */
const ae_settings_table *ae_settings_table_of(void);

/* Writes the manifest JSON the admin reads. Returns 0 on success. */
int ae_settings_emit_manifest(FILE *out, const ae_settings_table *t);

#endif /* AE_SETTINGS_H */
