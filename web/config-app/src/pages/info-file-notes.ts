/**
 * What a configuration file is for, where the filename does not say it.
 *
 * These notes came from the AmiXnet page, which listed fourteen files by hand
 * with a description each. That page was one of three tooltype editors over
 * the same two endpoints - the difference between them was never the editing,
 * only which files they chose to show - so it folded into the tree that
 * already lists every .info on the board.
 *
 * The descriptions were the one thing it had that the tree did not, and
 * "OutBound.info" does not explain itself, so they are kept here and shown
 * against the file wherever it appears.
 *
 * Keyed by path relative to the BBS root, matched case-insensitively because
 * the case of a file on disk is whatever the sysop's Amiga wrote.
 */

const NOTES: Record<string, string> = {
  'amixnet.info': 'Primary AmiXnet network settings',
  'amixnet/inbound.info': 'Incoming network mail and files',
  'amixnet/outbound.info': 'Outgoing network mail and files',
  'amixnet/mynode.info': 'Local node information and settings',
  'amixnet/mailroute.info': 'Network mail routing configuration',
  'amixnet/confs.info': 'Network conference mappings',
  'amixnet/filebase.info': 'Network file area mappings',
  'amixnet/scripts.info': 'Network scripts configuration',
  'amixnet/doors.info': 'Network doors configuration',
  'amixnet/utils.info': 'Network utilities settings',
  'amixnet/maps.info': 'Network maps configuration',
  'amixnet/regulations.info': 'Network regulations',
  'amixnet/logs.info': 'Network logging configuration',
  'amixnet/pointers.info': 'Network pointers configuration',
};

/** The note for a file, or an empty string when there is nothing to add. */
export function infoFileNote(relativePath: string): string {
  if (!relativePath) return '';
  return NOTES[relativePath.replace(/\\/g, '/').toLowerCase()] ?? '';
}
