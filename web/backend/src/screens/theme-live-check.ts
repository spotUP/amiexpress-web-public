/**
 * A LIVE theme, checked against the board as it is now.
 *
 * Publication is gated: `PUT /api/themes/:slug` refuses to take a theme live
 * while it breaks a blocking rule. Nothing checked it again afterwards, and
 * the board does not hold still - the spec's Risk 1 residual, left undone on
 * purpose and written down as such:
 *
 *   "a sysop who adds a security variant to the BOARD after a theme has gone
 *    live re-opens the shadowing hole, because nothing revalidates a live
 *    theme. The spec names the index rebuild as the hook; it is not wired."
 *
 * This wires it. The security walk completes INSIDE the theme directory before
 * the board's is tried, so a theme carrying a base `LOGON.txt` shadows a
 * `Logon100.txt` the sysop adds afterwards, and the level-100 caller is served
 * the theme's ordinary screen instead of the one written for them. The theme
 * was valid the day it was published and is wrong today.
 *
 * It REPORTS; it does not demote. Pulling a theme out from under the callers
 * wearing it - silently, at a rebuild nobody asked for - trades a wrong screen
 * for a changed board, and which of those a sysop wants is theirs to say.
 */
import { readThemeRegistry, type ThemeEntry } from './theme-registry';
import { validateTheme, type ThemeFinding } from './theme-validation';

export interface LiveThemeReport {
  slug: string;
  title: string;
  /** Rules that would have BLOCKED publication if it were published today. */
  blocking: ThemeFinding[];
  advisory: ThemeFinding[];
}

/**
 * Keyed on the index's own `builtAt`, so the answer is recomputed exactly when
 * the screens the rules are about have changed - and not once per request.
 */
let cache: { key: string; reports: LiveThemeReport[] } | null = null;

/** Announced once per distinct problem set: a rebuild loop must not spam. */
let lastAnnounced = '';

export function clearLiveThemeCache(): void {
  cache = null;
  lastAnnounced = '';
}

/**
 * Every live theme that no longer passes the rules it was published under.
 *
 * `key` is the caller's proof that the board changed - the index's `builtAt`.
 * Draft and review themes are absent by design: an unpublished theme serves
 * nobody, and the artist sees its findings in the editor already.
 */
export function liveThemeRegressions(
  bbsRoot: string,
  key: string,
  themes?: ThemeEntry[],
): LiveThemeReport[] {
  if (cache && cache.key === key) return cache.reports;

  const registry = themes ?? readThemeRegistry(bbsRoot).themes;
  const reports: LiveThemeReport[] = [];

  for (const theme of registry) {
    if (theme.status !== 'live') continue;
    // `default` is the board's own screens - the ABSENCE of a theme - and has
    // no directory to validate.
    if (!theme.dir) continue;

    const report = validateTheme(bbsRoot, theme);
    /*
     * BLOCKING only. Every theme carries advisories - "0 of the board's 32
     * screens; 32 fall through to the board's own art" is one, and it is true
     * of every partial theme by design. Reporting those as regressions would
     * put a warning beside a theme that is working exactly as intended, which
     * is how a warning stops being read.
     */
    if (report.blocking.length === 0) continue;

    reports.push({
      slug: theme.slug, title: theme.title,
      blocking: report.blocking, advisory: report.advisory,
    });
  }

  cache = { key, reports };
  return reports;
}

/**
 * Say it out loud, once, when a live theme starts failing.
 *
 * The admin lists this too, but a sysop who never opens the themes page still
 * has a board serving the wrong screen to one security level, and the whole
 * defect class this project keeps meeting is the check that runs and tells
 * nobody.
 */
export function announceLiveThemeRegressions(reports: LiveThemeReport[]): void {
  const broken = reports.filter(r => r.blocking.length > 0);
  const fingerprint = broken.map(r => `${r.slug}:${r.blocking.length}`).join('|');
  if (fingerprint === lastAnnounced) return;
  lastAnnounced = fingerprint;
  if (broken.length === 0) return;

  for (const report of broken) {
    const first = report.blocking[0];
    console.warn(
      `[Themes] LIVE theme "${report.slug}" no longer passes the rules it was published under: ` +
      `${report.blocking.length} blocking finding(s), first: ${first.rule} ${first.file ? `(${first.file}) ` : ''}` +
      `- ${first.message}`
    );
  }
}
