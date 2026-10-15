/**
 * The narrow spellings of one display file - the board's ONE width-variant
 * naming rule.
 *
 * The rule itself moved to `@amiexpress/bbs-door-sdk/utils/narrow-art` on
 * 2026-09-22, when the CTOP door was ported to TypeScript: a door reads
 * `Conf<n>/Conftop.header` and has to pick the narrow copy by the same rule
 * the board's show-file service picks it by, and a door cannot import the
 * backend. This file stays as the path the board's own callers already use.
 */
export { narrowVariants } from '@amiexpress/bbs-door-sdk/utils/narrow-art';
