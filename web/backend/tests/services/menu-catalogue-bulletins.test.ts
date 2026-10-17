jest.mock('../../src/services/bulletin-list');
jest.mock('../../src/services/bulls-config.service');
import { bulletinsMenuSource } from '../../src/services/menu-catalogue/sources/bulletins';
import { buildCatalogue } from '../../src/services/menu-catalogue/build';
import { defaultMenuConfig } from '../../src/screens/menu-config/menu-config';
import { listBulletins, conferenceHasBulletins } from '../../src/services/bulletin-list';
import { loadBullsConfig } from '../../src/services/bulls-config.service';
import type { MenuCaller } from '../../src/services/menu-catalogue/types';

const caller = (over: Partial<MenuCaller> = {}): MenuCaller => ({
  secLevel: 10, conference: 2, node: 1, columns: 80, rows: 25, displayMode: 'ansi',
  may: () => true, isSysop: false, widthRefuses: () => false, stylePref: '', ...over,
});
const bulls = [1, 2, 3].map(n => ({ number: n, title: `Title ${n}`, base: `bull${n}` }));

beforeEach(() => {
  (listBulletins as jest.Mock).mockReturnValue(bulls);
  (conferenceHasBulletins as jest.Mock).mockReturnValue(true);
  (loadBullsConfig as jest.Mock).mockReturnValue({ raw: '', parsed: { masks: [{ line: 1, conference: 2, mask: 'X-X-----------------' }] } });
});

test('Bulls.CFG\'s mask for the conference hides the bulletins it switches off', () => {
  const c: any = buildCatalogue(bulletinsMenuSource, caller(), defaultMenuConfig('BULLETINS'));
  expect(c.sections[0].entries.map((e: any) => [e.key, e.label])).toEqual([['1', 'Title 1'], ['3', 'Title 3']]);
});

test('a conference with no mask row offers every bulletin that exists', () => {
  const c: any = buildCatalogue(bulletinsMenuSource, caller({ conference: 9 }), defaultMenuConfig('BULLETINS'));
  expect(c.sections[0].entries.map((e: any) => e.key)).toEqual(['1', '2', '3']);
});

test('the gate refuses without READ_BULLETINS and without BullHelp (express.e:24607, 24616)', () => {
  expect((buildCatalogue(bulletinsMenuSource, caller({ may: () => false }), defaultMenuConfig('BULLETINS')) as any).refusal).toBe('denied');
  (conferenceHasBulletins as jest.Mock).mockReturnValue(false);
  expect((buildCatalogue(bulletinsMenuSource, caller(), defaultMenuConfig('BULLETINS')) as any).refusal).toBe('none');
});
