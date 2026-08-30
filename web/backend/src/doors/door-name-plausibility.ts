/**
 * Does this .info NAME read like a name?
 *
 * Several doors on the live board carry ASCII art in their NAME tooltype, so
 * DOORMAN's panel showed `[??] .______.` where a title belongs. The catalog
 * knows the real title, but a sysop who typed a name meant it - so the
 * question is not "is there a value" but "is this value a name at all".
 *
 * Deliberately conservative: anything that could be a name is kept. A wrong
 * override is worse than a missed one.
 */

/** `Some Door v2!` -> `somedoorv2`, for comparing a name against a command. */
function compareKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isPlausibleDoorName(
  value: string | null | undefined,
  context: { command?: string | null; archiveName?: string | null } = {}
): boolean {
  const name = (value ?? '').trim();
  if (name.length === 0) return false;

  // Mojibake: a decode already went wrong, so the bytes are unrecoverable here.
  if (name.includes('�')) return false;

  const letters = (name.match(/[a-z]/gi) ?? []).length;
  // A name needs letters. Box-drawing runs, rules and high-bit art have none
  // worth speaking of.
  if (letters < 2) return false;

  // Art is mostly not letters and digits. Two thirds is generous: "AVH-BaudCheck
  // v0.1" is 74% alphanumeric, "|::  |____ \:__:_" is 6%.
  const alphanumeric = (name.match(/[a-z0-9]/gi) ?? []).length;
  if (alphanumeric / name.length < 0.5) return false;

  // A run of high-bit characters is Amiga art, not a title.
  if (/[-ÿ]{3,}/.test(name)) return false;

  // An echo of what we already show beside it tells the sysop nothing, and
  // the catalog has a real title.
  const key = compareKey(name);
  if (context.command && key === compareKey(context.command)) return false;
  if (context.archiveName) {
    const archiveBase = context.archiveName.replace(/\.(lha|lzx|zip|lzh)$/i, '');
    if (key === compareKey(archiveBase)) return false;
  }

  return true;
}
