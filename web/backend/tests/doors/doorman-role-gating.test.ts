/**
 * Task 8: role-gate DOORMAN's RepoView curation actions.
 *
 * In consumer mode (browsing the CENTRAL door-repo API, not this BBS's own
 * catalog), curation actions that mutate/prune a repo copy of an archive
 * must be hidden -- a consumer sysop does not own the central catalog.
 * Install/uninstall of doors on the sysop's OWN BBS, browsing, searching,
 * and viewing docs/archive contents stay available in every mode.
 *
 * RepoView itself is not exported and cannot be constructed without a live
 * blessed Screen/DoormanLayout (matches the existing test suite's
 * convention -- see doorman-consumer-mode.test.ts's header comment and
 * doorman-arrow-nav-escape.test.ts's harness). Rather than duplicate the
 * gating decision in a test-only replica, the gating logic itself
 * (repoViewCurationAllowed, repoViewFooterParts, registerRepoViewActionKeys)
 * is extracted from RepoView into small exported functions in app.ts that
 * RepoView.updateFooter()/enter() call directly -- so these tests exercise
 * the EXACT function that runs in production, wired to a REAL KeyBinder
 * bound to a REAL blessed Screen (same harness pattern as
 * doorman-arrow-nav-escape.test.ts), not a hand-rolled mirror of the logic.
 */
import { Screen } from '../../../../sdk/engines/ui/blessed';
import { KeyBinder } from '../../../../Doors/door-manager/ViewManager';
import {
  clampSelection,
  repoViewCurationAllowed,
  repoViewFooterParts,
  registerRepoViewActionKeys,
  type RepoViewHotkeyHandlers,
} from '../../../../Doors/door-manager/app';
import type { DoorRepoMode } from '../../../../Doors/door-manager/repoDataSource';

const OWNER: DoorRepoMode = { kind: 'owner' };
const DISABLED: DoorRepoMode = { kind: 'disabled' };
const CONSUMER: DoorRepoMode = { kind: 'consumer', url: 'https://bbs.uprough.net' };

// ─── repoViewCurationAllowed ─────────────────────────────────────────────────

describe('DOORMAN app: repoViewCurationAllowed', () => {
  it('owner mode: curation allowed', () => {
    expect(repoViewCurationAllowed(OWNER)).toBe(true);
  });

  it('disabled mode: curation allowed (local catalog only, full local control -- same as owner)', () => {
    expect(repoViewCurationAllowed(DISABLED)).toBe(true);
  });

  it('consumer mode: curation NOT allowed', () => {
    expect(repoViewCurationAllowed(CONSUMER)).toBe(false);
  });
});

// ─── repoViewFooterParts ──────────────────────────────────────────────────────

describe('DOORMAN app: repoViewFooterParts', () => {
  // Every hint reads KEY=Label. The older mixed form (bare "Strip",
  // "Archive", "Quit" with only a colour highlight marking the key) was
  // unreadable on a real terminal - a sysop could not tell that S strips.
  const FULL_OWNER_HINT =
    '{center}{yellow-fg}R{/yellow-fg}=Inst  {yellow-fg}S{/yellow-fg}=Strip  ' +
    '{yellow-fg}V{/yellow-fg}=Doc  {yellow-fg}A{/yellow-fg}=Archive  ' +
    '{yellow-fg}D{/yellow-fg}=Delete  ' +
    '{yellow-fg}F{/yellow-fg}=Filter  {yellow-fg}C{/yellow-fg}=System  ' +
    '{yellow-fg}ESC{/yellow-fg}=Back  {yellow-fg}Q{/yellow-fg}=Quit{/center}';

  it('owner mode, entry with junk + doc: full hint string, byte-identical to pre-Task-8 DOORMAN', () => {
    expect(
      repoViewFooterParts(OWNER, { installed: false, hasJunk: true, hasDoc: true })
    ).toBe(FULL_OWNER_HINT);
  });

  it('disabled mode, same entry state: IDENTICAL to owner mode (no dead/extra hints either way)', () => {
    expect(
      repoViewFooterParts(DISABLED, { installed: false, hasJunk: true, hasDoc: true })
    ).toBe(FULL_OWNER_HINT);
  });

  it('consumer mode, same entry state: Strip hint omitted -- no dead hint for a key that does nothing', () => {
    const hint = repoViewFooterParts(CONSUMER, { installed: false, hasJunk: true, hasDoc: true });
    expect(hint).toBe(
      '{center}{yellow-fg}R{/yellow-fg}=Inst  ' +
      '{yellow-fg}V{/yellow-fg}=Doc  {yellow-fg}A{/yellow-fg}=Archive  ' +
      '{yellow-fg}F{/yellow-fg}=Filter  {yellow-fg}C{/yellow-fg}=System  ' +
      '{yellow-fg}ESC{/yellow-fg}=Back  {yellow-fg}Q{/yellow-fg}=Quit{/center}'
    );
    expect(hint).not.toContain('Strip');
    expect(hint).not.toContain('{yellow-fg}D{/yellow-fg}el');
  });

  it('installed entry: R hint reads Uninst in every mode', () => {
    expect(repoViewFooterParts(OWNER, { installed: true, hasJunk: false, hasDoc: false }))
      .toContain('{yellow-fg}R{/yellow-fg}=Uninst');
    expect(repoViewFooterParts(CONSUMER, { installed: true, hasJunk: false, hasDoc: false }))
      .toContain('{yellow-fg}R{/yellow-fg}=Uninst');
  });

  it('no junk: Strip hint omitted regardless of mode (pre-existing behavior, unrelated to role gating)', () => {
    expect(repoViewFooterParts(OWNER, { installed: false, hasJunk: false, hasDoc: true })).not.toContain('Strip');
  });

  it('no doc: View doc hint omitted regardless of mode (pre-existing behavior, unrelated to role gating)', () => {
    expect(repoViewFooterParts(OWNER, { installed: false, hasJunk: true, hasDoc: false })).not.toContain('View doc');
  });
});

// ─── registerRepoViewActionKeys: real KeyBinder + real blessed Screen ───────

function buildKeyHarness() {
  const screen = new Screen({ title: 'role-gating-test', output: () => {} });
  const keys = new KeyBinder(screen);
  return {
    screen,
    keys,
    send: (ch: string) => { (screen as any).program.emit('data', ch); },
    destroy: () => { if (!screen.destroyed) screen.destroy(); },
  };
}

function makeHandlers(): { [K in keyof RepoViewHotkeyHandlers]: jest.Mock } {
  return {
    onInstallUninstall: jest.fn(),
    onStrip: jest.fn(),
    onViewDoc: jest.fn(),
    onBrowseArchive: jest.fn(),
    onCycleFilter: jest.fn(),
    onDelete: jest.fn(),
  };
}

describe('DOORMAN app: registerRepoViewActionKeys', () => {
  it('owner mode: every hotkey registers and fires (R/S/V/A/C)', () => {
    const h = buildKeyHarness();
    const handlers = makeHandlers();
    registerRepoViewActionKeys(h.keys, OWNER, handlers);

    h.send('r'); h.send('s'); h.send('v'); h.send('a'); h.send('c');

    expect(handlers.onInstallUninstall).toHaveBeenCalledTimes(1);
    expect(handlers.onStrip).toHaveBeenCalledTimes(1);
    expect(handlers.onViewDoc).toHaveBeenCalledTimes(1);
    expect(handlers.onBrowseArchive).toHaveBeenCalledTimes(1);
    expect(handlers.onCycleFilter).toHaveBeenCalledTimes(1);
    h.destroy();
  });

  it('disabled mode: every hotkey registers and fires, identically to owner mode', () => {
    const h = buildKeyHarness();
    const handlers = makeHandlers();
    registerRepoViewActionKeys(h.keys, DISABLED, handlers);

    h.send('r'); h.send('s'); h.send('v'); h.send('a'); h.send('c');

    expect(handlers.onInstallUninstall).toHaveBeenCalledTimes(1);
    expect(handlers.onStrip).toHaveBeenCalledTimes(1);
    expect(handlers.onViewDoc).toHaveBeenCalledTimes(1);
    expect(handlers.onBrowseArchive).toHaveBeenCalledTimes(1);
    expect(handlers.onCycleFilter).toHaveBeenCalledTimes(1);
    h.destroy();
  });

  it('owner mode: D fires the delete handler', () => {
    const h = buildKeyHarness();
    const handlers = makeHandlers();
    registerRepoViewActionKeys(h.keys, OWNER, handlers);

    h.send('d');

    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    h.destroy();
  });

  it('consumer mode: Delete is NOT registered -- pressing D does nothing', () => {
    // Deleting removes the archive from the repository permanently. A
    // consumer is browsing somebody else's catalog and must not be able to
    // reach it at all, not merely be refused at the far end.
    const h = buildKeyHarness();
    const handlers = makeHandlers();
    registerRepoViewActionKeys(h.keys, CONSUMER, handlers);

    expect(() => h.send('d')).not.toThrow();
    expect(handlers.onDelete).not.toHaveBeenCalled();
    h.destroy();
  });

  it('consumer mode: Strip is NOT registered -- pressing S does nothing (no throw, handler never fires)', () => {
    const h = buildKeyHarness();
    const handlers = makeHandlers();
    registerRepoViewActionKeys(h.keys, CONSUMER, handlers);

    expect(() => h.send('s')).not.toThrow();
    expect(handlers.onStrip).not.toHaveBeenCalled();
    h.destroy();
  });

  it('consumer mode: install/uninstall, view doc, browse archive, and system filter still register and fire', () => {
    const h = buildKeyHarness();
    const handlers = makeHandlers();
    registerRepoViewActionKeys(h.keys, CONSUMER, handlers);

    h.send('r'); h.send('v'); h.send('a'); h.send('c');

    expect(handlers.onInstallUninstall).toHaveBeenCalledTimes(1);
    expect(handlers.onViewDoc).toHaveBeenCalledTimes(1);
    expect(handlers.onBrowseArchive).toHaveBeenCalledTimes(1);
    expect(handlers.onCycleFilter).toHaveBeenCalledTimes(1);
    h.destroy();
  });
});

// ─── clampSelection ──────────────────────────────────────────────────────────

describe('DOORMAN app: clampSelection', () => {
  // Actions that rebuild the list used to send the cursor back to row 1,
  // which loses the reader's place in a 3301-row catalog. Keeping the index
  // means the row that moved up into the slot is under the cursor.
  it('keeps the index when the list is still that long', () => {
    expect(clampSelection(400, 3301)).toBe(400);
    expect(clampSelection(0, 1)).toBe(0);
  });

  it('clamps to the new last row when the list shrank underneath it', () => {
    // Deleting the last row: the old index is now one past the end.
    expect(clampSelection(9, 9)).toBe(8);
    expect(clampSelection(500, 10)).toBe(9);
  });

  it('returns 0 for an empty list', () => {
    // Deleting the only remaining door.
    expect(clampSelection(0, 0)).toBe(0);
    expect(clampSelection(7, 0)).toBe(0);
  });

  it('never returns a negative or fractional index', () => {
    expect(clampSelection(-1, 10)).toBe(0);
    expect(clampSelection(NaN, 10)).toBe(0);
    expect(clampSelection(3.7, 10)).toBe(3);
  });
});

// ─── wrapText ────────────────────────────────────────────────────────────────

describe('DOORMAN app: wrapText', () => {
  // Messages used to carry hard-coded line breaks at a guessed width, which
  // re-broke mid-word on a narrower pane: the live BBS showed "fi les" and
  // "thi s platform".
  const { wrapText } = require('../../../../Doors/door-manager/app');

  it('breaks on spaces, never mid-word', () => {
    const out: string = wrapText('DOORMAN strips junk from an INSTALLED door', 20);
    for (const line of out.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(20);
    }
    expect(out).not.toMatch(/\bfi\n/);
    expect(out.replace(/\n/g, ' ')).toBe('DOORMAN strips junk from an INSTALLED door');
  });

  it('keeps a word longer than the width on its own line rather than losing it', () => {
    const out: string = wrapText('see ANNOYINGLYLONGARCHIVENAME.LHA now', 10);
    expect(out.split('\n')).toContain('ANNOYINGLYLONGARCHIVENAME.LHA');
  });

  it('preserves paragraph breaks', () => {
    expect(wrapText('one\ntwo', 40).split('\n')).toEqual(['one', 'two']);
  });

  it('never divides by a nonsense width', () => {
    expect(() => wrapText('a b c', 0)).not.toThrow();
    expect(() => wrapText('a b c', -5)).not.toThrow();
  });
});
