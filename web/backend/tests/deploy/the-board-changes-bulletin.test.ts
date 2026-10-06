/**
 * The Board Changes bulletin (bull10), written by every deploy (sysop,
 * 2026-10-05: "a changelogs bulletin that gets updated on every deploy").
 * deploy/changelog-bulletin.sh, run against a scratch repository: a deploy's
 * feat/fix/perf commits become one dated section on top, older sections stay
 * below, and the heading is written once.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.join(__dirname, '..', '..', '..', '..', 'deploy', 'changelog-bulletin.sh');

function repo(): { dir: string; commit: (msg: string) => string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-'));
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  let n = 0;
  return {
    dir,
    commit: (msg: string) => {
      fs.writeFileSync(path.join(dir, `f${n++}`), msg);
      git('add', '-A');
      git('commit', '-q', '-m', msg);
      return git('rev-parse', 'HEAD');
    },
  };
}

const run = (snippet: string) =>
  execFileSync('bash', ['-c', `. "${SCRIPT}"; ${snippet}`], { encoding: 'utf8' });

test('a deploy adds one section of what callers would call changes, newest on top', () => {
  const r = repo();
  const first = r.commit('feat(chat): two nodes can chat');
  const second = r.commit('test: pin the chat');
  const third = r.commit('fix(screens): the title is teletext');
  const fourth = r.commit('docs: notes');

  const s1 = run(`changelog_section "${r.dir}" "" "${second}" "10-05-26"`);
  const b1 = run(`changelog_merge "$1" ""`.replace('$1', s1.replace(/"/g, '\\"')));
  const s2 = run(`changelog_section "${r.dir}" "${second}" "${fourth}" "10-06-26"`);
  const b2 = run(`changelog_merge "${s2.replace(/"/g, '\\"')}" "${b1.replace(/"/g, '\\"')}"`);

  expect(s1).toContain('   - two nodes can chat');
  expect(s1).not.toContain('pin the chat');
  expect(s2).toContain('   - the title is teletext');
  expect(s2).not.toContain('notes');
  expect(s2).not.toContain('fix(');
  // Newest first, the older section kept, one heading.
  expect(b2.indexOf('10-06-26')).toBeLessThan(b2.indexOf('10-05-26'));
  expect(b2.match(/BOARD CHANGES/g)).toHaveLength(1);
  expect(b2).toContain('two nodes can chat');
  void first; void third;
});

test('a deploy with nothing a caller would call a change adds no section', () => {
  const r = repo();
  const a = r.commit('feat: something');
  const b = r.commit('chore: tidy');
  expect(run(`changelog_section "${r.dir}" "${a}" "${b}" "10-06-26"`)).toBe('');
});

test('a long subject is folded under its dash, inside 79 columns', () => {
  const r = repo();
  const a = r.commit('feat: start');
  const b = r.commit(`fix: ${'word '.repeat(30).trim()}`);
  const out = run(`changelog_section "${r.dir}" "${a}" "${b}" "10-06-26"`);
  for (const line of out.split('\n')) expect(line.length).toBeLessThanOrEqual(79);
  expect(out.split('\n').filter((l) => l.startsWith('     word')).length).toBeGreaterThan(0);
});
