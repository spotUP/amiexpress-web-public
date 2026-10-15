/**
 * "can you tell me the group history of fairlight?" - the model reached for
 * search_doors with kind=detail, which is the archive of door SOFTWARE, and
 * asked it for a demoscene group. The archive said "No door called FAIRLIGHT"
 * and that was the end of it: nothing in the answer told the model that
 * search_demozoo is where a group lives, so it had nowhere to go.
 *
 * In a tool loop the RESULT is the recovery path - a round that comes back
 * empty is the model's only chance to pick a different tool. A dead end that
 * names the sibling which can answer turns a wasted round into a correction.
 */
import { runTool } from '../../../src/handlers/sysop-ai/tools';
import { setExternalFetcher, resetExternalCache } from '../../../src/handlers/sysop-ai/external/doorrepo';

const ctx = () => ({
  session: { user: { id: 'u1', username: 'Caller', secLevel: 50 }, nodeId: 1 },
  page: { id: 'p1' },
  io: { to: () => ({ emit() {} }), emit() {} },
}) as any;

describe('an archive lookup that misses', () => {
  beforeEach(() => { resetExternalCache(); setExternalFetcher(null); });
  afterAll(() => setExternalFetcher(null));

  it('names search_demozoo, because that is where a group actually lives', async () => {
    setExternalFetcher(async () => ({ error: 'not found' }));
    const { result } = await runTool(ctx(), 'search_doors', { kind: 'detail', query: 'fairlight' });
    expect(result.content).toContain('No door called');
    expect(result.content).toContain('search_demozoo');
    expect(result.content).toContain('kind=group');
  });

  it('says nothing of the sort when the archive DID answer', async () => {
    setExternalFetcher(async () => ({
      archive: 'MST-CM20.LHA', name: 'Casino Master', votesUp: 3, votesDown: 0, downloadUrl: 'https://x/y',
    }));
    const { result } = await runTool(ctx(), 'search_doors', { kind: 'detail', query: 'MST-CM20.LHA' });
    expect(result.content).not.toContain('search_demozoo');
  });
});

describe('the tool descriptions', () => {
  it('do not leave a group question pointing at the door archive', () => {
    const { ALL_TOOLS } = require('../../../src/handlers/sysop-ai/tools');
    const doors = ALL_TOOLS.find((t: any) => t.name === 'search_doors');
    const zoo = ALL_TOOLS.find((t: any) => t.name === 'search_demozoo');

    // search_doors used to advertise itself as searchable "by keyword (name,
    // author, group, description, DIZ)" - a model reading "group history of
    // fairlight" had a word to match on.
    expect(doors.description).toMatch(/search_demozoo/);
    expect(doors.description).toMatch(/kind=group/);
    // And it must still say what it IS for.
    expect(doors.description).toMatch(/door/i);
    expect(zoo.description).toMatch(/group/i);
  });
});
