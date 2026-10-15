/**
 * The metadata a sysop reads, assembled from the board's own facts.
 *
 * Each line here replaces a piece of archaeology: which conference `Conf2` is,
 * who a variant serves, what `.GR` means, and where express.e shows the screen
 * from.
 */
import { describe, expect, it } from 'vitest';
import { describeReader, describeCallers } from '../pages/screen-index-view';
import { callSitesFor } from '../pages/screen-provenance';

const callers = { 0: 1, 30: 95, 255: 4 };

describe('what a reader line says', () => {
  it('names the conference, the range and how many callers it is', () => {
    const line = describeReader({
      screen: 'CONF_BULL', scope: 'conf', id: 1, scopeName: 'Amiga Demoscene',
      securityLevel: 20, serves: '20-29', via: 'resolved',
    }, callers);

    expect(line).toBe('CONF_BULL in Amiga Demoscene (conference 1) - level 20-29 (no callers)');
  });

  it('counts the callers a top variant actually serves', () => {
    const line = describeReader({
      screen: 'CONF_BULL', scope: 'conf', id: 1, scopeName: 'Amiga Demoscene',
      securityLevel: 30, serves: '30 and above', via: 'resolved',
    }, callers);

    expect(line).toContain('99 callers');
  });

  it('says what the board calls a screen type, not its suffix', () => {
    const line = describeReader({
      screen: 'MENU', scope: 'conf', id: 1, scopeName: 'Amiga Demoscene',
      screenType: 'GR', screenTypeName: 'Amiga Ansi', via: 'variant',
    }, callers);

    expect(line).toContain('Amiga Ansi only');
  });

  it('falls back to the suffix when the board defines no name for it', () => {
    const line = describeReader({
      screen: 'MENU', scope: 'node', id: 1, screenType: 'IBM', via: 'variant',
    }, callers);

    expect(line).toContain('IBM screens only');
  });

  it('says nothing about callers when the board offers no counts', () => {
    expect(describeCallers('20-29', undefined)).toBe('');
  });
});

describe('where express.e shows a screen', () => {
  it('cites the procedure and the line, generated from the sources', () => {
    expect(callSitesFor('CONF_BULL')).toEqual([{ proc: 'joinConf', line: 5058 }]);
  });

  it('carries every place a screen is shown from', () => {
    expect(callSitesFor('CONF_JOINMSGBASE').map(s => s.proc))
      .toEqual(['internalCommandJ', 'internalCommandJM']);
  });

  it('answers empty for a screen express.e never displays', () => {
    expect(callSitesFor('NOT_A_SCREEN')).toEqual([]);
  });
});
