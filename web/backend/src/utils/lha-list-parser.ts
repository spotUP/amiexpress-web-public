/**
 * Parser for `lha -l` listing output.
 *
 * Lives here rather than inside dev/scripts/door-corpus/build-door-catalog.ts
 * so it can be unit-tested: a silent defect in this function does not fail
 * anything loudly, it just quietly shrinks a catalog entry's file list, which
 * is exactly how the bug below survived a full catalog build.
 *
 * `lha -l` prints one row per archive member in one of two styles depending on
 * what the archive records:
 *
 *   [generic]                 2868  25.8% Dec 18  1995 aLSTER/pw.info
 *   -rw-rw-rw-  user/0         466  47.9% Apr 10  2014 FILE_ID.diz
 *
 * plus a header row, two `------` rules, and a `Total N files` footer.
 */

export interface LhaEntry {
  name: string;
  size: number;
}

/**
 * Parses `lha -l` output into archive members.
 *
 * HISTORY, because the failure mode was invisible: this used to discard any
 * line starting with '-', intending to drop the `------` rules. That also
 * discarded every row of the second style above, since Unix permission
 * strings begin with '-'. Archives listed as `[generic]` were unaffected, so
 * most of the catalog looked correct; affected archives silently lost their
 * FILE_ID.DIZ, their documentation and nearly all of their file list. The
 * result was usually still non-empty (directory rows and `[unknown]` rows
 * survive), so it never tripped the caller's "empty/unreadable archive"
 * guard either - nothing was ever logged.
 */
export function parseLhaList(lines: string[]): LhaEntry[] {
  const entries: LhaEntry[] = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;

    // A rule line is dashes/equals and whitespace and nothing else - matched
    // by shape rather than by first character, so a permission string like
    // "-rw-rw-rw-" is not mistaken for one.
    if (/^[-=\s]+$/.test(line)) continue;

    // "Total    4 files 1803694  18.3% Jan  4  2018" would otherwise parse as
    // a member named after the last column with size 4.
    if (/^\s*Total\s+\d+\s+files?/i.test(line)) continue;

    const name = parts[parts.length - 1];

    // The size is the column immediately BEFORE the compression ratio, found
    // by locating the ratio rather than by counting from the left.
    //
    // Counting from the left does not work, because the two row styles have
    // different numbers of leading columns:
    //
    //   [generic]                 2868  25.8% ...   -> size is parts[1]
    //   -rw-rw-rw-  user/0         466  47.9% ...   -> size is parts[2]
    //
    // This function previously always read parts[2], so every `[generic]`
    // row recorded its RATIO as the file size - which is why the catalog
    // held entries like a 2-byte .exe (a 2.0% ratio). Anchoring on the
    // ratio column handles both styles and cannot drift if a future lha
    // adds or drops a leading column.
    const ratioAt = parts.findIndex((p) => /^\d+(\.\d+)?%$/.test(p));
    if (ratioAt < 1) continue;
    const size = parseInt(parts[ratioAt - 1], 10);

    if (!name || isNaN(size)) continue;

    entries.push({ name, size });
  }

  return entries;
}
