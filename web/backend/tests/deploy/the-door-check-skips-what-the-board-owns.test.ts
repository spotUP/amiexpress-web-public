/**
 * The deploy's door check fails on code drift, never on the board's own files.
 *
 * On 2026-09-28 a healthy deploy ended rc=1: "doors on the volume differ from
 * the image" over emp_tools/Bulls.CFG, the REQUESTS header and tail, and the
 * dRE wall's posts. The entrypoint's sync leaves exactly those alone on
 * purpose - saved settings, uploaded art, a 68K door's state - and the check
 * compared everything anyway. Drives deploy/door-drift.sh on temp trees, with
 * the exclude list in the form the entrypoint writes it.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const script = path.join(__dirname, '..', '..', '..', '..', 'deploy', 'door-drift.sh');

let root: string;
const put = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body);
};

function drift(excludes?: string): string[] {
  const args = [path.join(root, 'image'), path.join(root, 'volume')];
  if (excludes !== undefined) {
    put('excludes', excludes);
    args.push(path.join(root, 'excludes'));
  }
  const out = execFileSync('sh', ['-c', `. "${script}"; doors_differing_from_image "$@"`, 'sh', ...args], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean).sort();
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-drift-'));
  for (const side of ['image', 'volume']) {
    put(`${side}/REQUESTS/REQUESTS`, 'binary');
    put(`${side}/REQUESTS/Bulletin_Header.txt`, 'image art');
    put(`${side}/emp_tools/Bulls.CFG`, 'image cfg');
    put(`${side}/dRE/dRE!WAll/dRE!WAll.dAtA`, 'sample wall');
    put(`${side}/Kickboxing/Fighters/one`, 'sample fighter');
  }
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the door check after a deploy', () => {
  it("does not fail over files the board owns, as the entrypoint's list names them", () => {
    put('volume/REQUESTS/Bulletin_Header.txt', "the sysop's art");
    put('volume/emp_tools/Bulls.CFG', 'saved settings');
    put('volume/dRE/dRE!WAll/dRE!WAll.dAtA', 'callers wrote on the wall');
    put('volume/Kickboxing/Fighters/one', 'a real fighter');

    expect(drift([
      './REQUESTS/Bulletin_Header.txt',
      './emp_tools/Bulls.CFG',
      './dRE/dRE!WAll/dRE!WAll.dAtA',
      './Kickboxing/Fighters',
      './Kickboxing/Fighters/*',
    ].join('\n') + '\n')).toEqual([]);
  });

  it('still fails when the code that runs is not the code that was built', () => {
    put('volume/REQUESTS/REQUESTS', 'an older binary');
    put('volume/emp_tools/Bulls.CFG', 'saved settings');

    expect(drift('./emp_tools/Bulls.CFG\n')).toEqual(['./REQUESTS/REQUESTS']);
  });

  it('compares everything when the board has written no list yet', () => {
    put('volume/emp_tools/Bulls.CFG', 'saved settings');

    expect(drift()).toEqual(['./emp_tools/Bulls.CFG']);
  });
});
