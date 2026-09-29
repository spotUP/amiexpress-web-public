/**
 * "make sure doorman and doorrepo display the descriptions and file_id's from
 * the door repo" (sysop, 2026-09-29).
 *
 * The info panels showed the FILE_ID OR the description, never both; and the
 * installed view looked the door up by the catalog's `installed_as`, which
 * installs stopped writing when they moved to `door_installs` - so a door
 * installed since (SENT, from MST-FD11.LHA) showed neither.
 */
import { repoTextBlock } from '../../../../Doors/door-manager/repo-view-helpers';
import { repoTextFor } from '../../../../Doors/door-manager/doorman-services';

const plain = (s: string) => s.replace(/\{[^}]*\}/g, '');

describe('the repo text in DOORMAN\'s info panel', () => {
  it('shows the description AND the FILE_ID, description first', () => {
    const out = plain(repoTextBlock('File description the best fileid extractor', ' _/\\___\n BOBO/MYSTiC\n'));
    expect(out.indexOf('File description the best')).toBeGreaterThanOrEqual(0);
    expect(out.indexOf('BOBO/MYSTiC')).toBeGreaterThan(out.indexOf('File description'));
    expect(out).toContain(' _/\\___\n BOBO/MYSTiC'); // the art's own lines
  });

  it('shows whichever one there is, and nothing when there is neither', () => {
    expect(plain(repoTextBlock(null, 'ART'))).toBe('\n\nART');
    expect(plain(repoTextBlock('Just words', null))).toBe('\n\nJust words');
    expect(repoTextBlock('  ', '\n')).toBe('');
  });
});

describe('an installed door\'s repo text', () => {
  it('comes from the catalog row of the archive the install record names', () => {
    const installs = { getInstallByCommand: (c: string) => (c === 'SENT' ? { archive_name: 'MST-FD11.LHA', description: null } : null) };
    const catalog = {
      getCatalogEntryByArchive: (a: string) => (a === 'MST-FD11.LHA' ? { description: 'File description', file_id_diz: 'BOBO/MYSTiC' } : null),
      getCatalogEntryByCmd: () => null,
    };
    expect(repoTextFor('SENT', installs, catalog)).toEqual({ description: 'File description', fileIdDiz: 'BOBO/MYSTiC' });
  });

  it('falls back to the catalog\'s own installed_as for an install made before door_installs', () => {
    const installs = { getInstallByCommand: () => null };
    const catalog = {
      getCatalogEntryByArchive: () => null,
      getCatalogEntryByCmd: (c: string) => (c === 'OLDDOOR' ? { description: 'Old', file_id_diz: 'OLD ART' } : null),
    };
    expect(repoTextFor('OLDDOOR', installs, catalog)).toEqual({ description: 'Old', fileIdDiz: 'OLD ART' });
  });

  it('is nothing, not an error, when nothing knows the door', () => {
    expect(repoTextFor('NOBODY', null, null)).toEqual({ description: null, fileIdDiz: null });
  });
});
