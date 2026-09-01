/**
 * What a caller is doing right now, in words.
 *
 * `/api/nodes/status` reports the session's raw subState and Overview and Node
 * Control printed it: `read_command`, `files_list_areas`, `w_edit_email`. The
 * board's own shorthand, on the pages a sysop watches to see who is doing
 * what.
 *
 * The last test is the one that matters: it walks the REAL enum out of the
 * backend, so a subState added later is covered by a group or noticed here,
 * rather than appearing on the page as an identifier.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describeNodeActivity } from '../pages/node-activity';

const BACKEND_STATES = resolve(
  __dirname, '..', '..', '..', 'backend', 'src', 'constants', 'bbs-states.ts',
);

function everySubState(): string[] {
  const source = readFileSync(BACKEND_STATES, 'utf8');
  return [...source.matchAll(/=\s*'([a-z_0-9]+)'/g)].map(m => m[1]);
}

describe('what a node is doing', () => {
  it('says the common ones plainly', () => {
    expect(describeNodeActivity('read_command')).toBe('At the menu');
    expect(describeNodeActivity('display_menu')).toBe('At the menu');
    expect(describeNodeActivity('waiting')).toBe('Idle');
    expect(describeNodeActivity('logoff')).toBe('Logging off');
  });

  it('groups a whole family by its prefix', () => {
    expect(describeNodeActivity('files_list_areas')).toBe('Browsing files');
    expect(describeNodeActivity('files_select_area')).toBe('Browsing files');
    expect(describeNodeActivity('post_message_subject')).toBe('Writing a message');
    expect(describeNodeActivity('account_change_password')).toBe('Editing their account');
    expect(describeNodeActivity('w_edit_email')).toBe('Editing their settings');
  });

  // `new_user_*` is signing up; `new_*` on its own is the new-files scan.
  // `msg_reader_*` is reading; `msg_*` is the message system generally.
  it('lets the longer prefix win', () => {
    expect(describeNodeActivity('new_user_location')).toBe('Signing up');
    expect(describeNodeActivity('new_files_scan')).toBe('Looking for new files');
    expect(describeNodeActivity('msg_reader_nav')).toBe('Reading messages');
  });

  it('tidies a state it has no rule for, rather than printing an identifier', () => {
    expect(describeNodeActivity('some_future_state')).toBe('Some future state');
  });

  it('says nothing for nothing', () => {
    expect(describeNodeActivity(undefined)).toBe('');
    expect(describeNodeActivity(null)).toBe('');
    expect(describeNodeActivity('  ')).toBe('');
  });

  // The guard, and it has to be about COVERAGE rather than appearance: the
  // tidy() fallback strips underscores from anything, so "no underscores"
  // would pass on a state nothing knows about. This asserts every real
  // subState is claimed by an exact entry or a group - 41 of the 200 were
  // not, including door_running and operator_chat_active, the two a sysop
  // most wants named.
  it('has a rule for every state the board can be in', () => {
    const source = readFileSync(
      resolve(__dirname, '..', 'pages', 'node-activity.ts'),
      'utf8',
    );
    const exact = [...source.matchAll(/^  ([a-z_0-9]+): '/gm)].map(m => m[1]);
    const groups = [...source.matchAll(/\['([a-z_0-9]+)', '/g)].map(m => m[1]);

    const uncovered = everySubState()
      .filter(state => !exact.includes(state))
      .filter(state => !groups.some(prefix => state.startsWith(prefix)));

    expect(uncovered.join(', ')).toBe('');
  });

  it('names the states a sysop watches for', () => {
    expect(describeNodeActivity('door_running')).toBe('In a door');
    expect(describeNodeActivity('operator_chat_active')).toBe('Chatting with the sysop');
    expect(describeNodeActivity('await')).toBe('Waiting for a caller');
  });

  it('has real states to check', () => {
    expect(everySubState().length).toBeGreaterThan(100);
  });
});
