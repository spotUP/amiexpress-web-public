/*
 * Emit the manifest JSON the admin reads, from a door's own declaration.
 *
 * The shape is fixed by web/backend/src/doors/door-settings.service.ts, which
 * validates every manifest with zod before the admin will render a form. This
 * writes exactly that shape and nothing else - a field the schema does not
 * know is a field that makes the whole door's settings vanish, silently, with
 * the form falling back to "this door declares no settings".
 *
 * Strings are escaped properly rather than hopefully: a door's help text is
 * written by a human and will eventually contain a quote or a backslash.
 */
#include "ae_settings.h"
#include <string.h>
#include <math.h>

static void emit_json_string(FILE *out, const char *s) {
  fputc('"', out);
  for (const unsigned char *p = (const unsigned char *)s; p && *p; p++) {
    switch (*p) {
      case '"':  fputs("\\\"", out); break;
      case '\\': fputs("\\\\", out); break;
      case '\n': fputs("\\n", out);  break;
      case '\r': fputs("\\r", out);  break;
      case '\t': fputs("\\t", out);  break;
      default:
        if (*p < 0x20) fprintf(out, "\\u%04x", *p);
        else fputc(*p, out);
    }
  }
  fputc('"', out);
}

/* A whole number prints as an integer: `80`, never `80.0`, because the
   admin's number input and the rendered .cfg both read better for it. */
static void emit_number(FILE *out, double v) {
  if (v == floor(v) && fabs(v) < 1e15) fprintf(out, "%lld", (long long)v);
  else fprintf(out, "%g", v);
}

static const char *type_name(ae_setting_type t) {
  switch (t) {
    case AE_SET_NUMBER: return "number";
    case AE_SET_BOOL:   return "boolean";
    case AE_SET_CHOICE: return "choice";
    default:            return "string";
  }
}

int ae_settings_emit_manifest(FILE *out, const ae_settings_table *t) {
  if (!out || !t || !t->command) return 1;

  fputs("{\n  \"command\": ", out);
  emit_json_string(out, t->command);

  if (t->cfg_file && t->cfg_file[0]) {
    fputs(",\n  \"cfgFile\": ", out);
    emit_json_string(out, t->cfg_file);
  }

  fputs(",\n  \"settings\": [\n", out);
  for (int i = 0; i < t->count; i++) {
    const ae_setting *s = &t->settings[i];
    fputs("    {\n      \"key\": ", out);
    emit_json_string(out, s->key);

    if (s->cfg_key && s->cfg_key[0]) {
      fputs(",\n      \"cfgKey\": ", out);
      emit_json_string(out, s->cfg_key);
    }

    fputs(",\n      \"label\": ", out);
    emit_json_string(out, s->label);
    fputs(",\n      \"type\": ", out);
    emit_json_string(out, type_name(s->type));

    /* `secret` before `default` so a reader meets the warning first. */
    if (s->secret) fputs(",\n      \"secret\": true", out);

    /* Before `default`, like `secret`: a reader meets what the field IS
       before what it currently holds. */
    if (s->art) fputs(",\n      \"art\": true", out);
    if (s->art && s->art_choices) {
      fputs(",\n      \"artChoices\": [", out);
      for (const char *const *c = s->art_choices; *c; c++) {
        if (c != s->art_choices) fputs(", ", out);
        emit_json_string(out, *c);
      }
      fputc(']', out);
    }

    /* Where the value comes from when the door has none: the backend reads
       this and falls back to the board's own system config. */
    if (s->from_system_config && s->from_system_config[0]) {
      fputs(",\n      \"fromSystemConfig\": ", out);
      emit_json_string(out, s->from_system_config);
    }

    fputs(",\n      \"default\": ", out);
    switch (s->type) {
      case AE_SET_NUMBER: emit_number(out, s->def_num); break;
      case AE_SET_BOOL:   fputs(s->def_bool ? "true" : "false", out); break;
      default:            emit_json_string(out, s->def_str ? s->def_str : ""); break;
    }

    if (s->type == AE_SET_NUMBER && s->has_range) {
      fputs(",\n      \"min\": ", out); emit_number(out, s->min_v);
      fputs(",\n      \"max\": ", out); emit_number(out, s->max_v);
    }

    if (s->type == AE_SET_CHOICE && s->choices) {
      fputs(",\n      \"choices\": [", out);
      for (const ae_setting_choice *c = s->choices; c->value; c++) {
        if (c != s->choices) fputc(',', out);
        fputs("\n        { \"value\": ", out);
        emit_json_string(out, c->value);
        fputs(", \"label\": ", out);
        emit_json_string(out, c->label ? c->label : c->value);
        fputs(" }", out);
      }
      fputs("\n      ]", out);
    }

    if (s->help && s->help[0]) {
      fputs(",\n      \"help\": ", out);
      emit_json_string(out, s->help);
    }

    fputs("\n    }", out);
    if (i + 1 < t->count) fputc(',', out);
    fputc('\n', out);
  }
  fputs("  ]\n}\n", out);
  return 0;
}
