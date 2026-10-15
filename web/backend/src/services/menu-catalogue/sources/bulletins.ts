/**
 * BULLETINS: the bulletins this board can show in the caller's conference
 * (Decision 38) - the files decide what exists (listBulletins), Bulls.CFG's
 * per-conference masks decide what this conference offers (Bulls' own rule),
 * Bulls.CFG names them unless the sysop typed a title.
 */
import type { MenuSource } from '../types';
import { listBulletins, conferenceHasBulletins } from '../../bulletin-list';
import { loadBullsConfig } from '../../bulls-config.service';
import { config } from '../../../config';
import { conferenceSubdir } from '../../../conferences/conference-paths';

export const bulletinsMenuSource: MenuSource = {
  kind: 'BULLETINS',
  title: () => 'BULLETINS',
  prompt: () => 'Which bulletin? ',
  gate(caller) {
    // express.e:24607 - the ACS_READ_BULLETINS gate; M6 prints express.e's permission text.
    if (!caller.may('READ_BULLETINS')) return { ok: false, refusal: 'denied' };
    // express.e:24616-24621 - BullHelp absent: "No bulletins are available in this conference!"
    const confScreens = conferenceSubdir(config.get('dataDir'), caller.conference, 'Screens');
    if (!conferenceHasBulletins(config.get('dataDir'), confScreens)) return { ok: false, refusal: 'none' };
    return { ok: true };
  },
  entries(caller) {
    const dataDir = config.get('dataDir');
    const confScreens = conferenceSubdir(dataDir, caller.conference, 'Screens');
    let mask: string | null = null;
    try { mask = loadBullsConfig(dataDir).parsed.masks.find(m => m.conference === caller.conference)?.mask ?? null; } catch { mask = null; }
    return listBulletins(dataDir, confScreens)
      .filter(b => mask === null || mask[b.number - 1] !== '-')
      .map(b => ({ key: String(b.number), label: b.title, description: '', right: '', flags: '', runText: String(b.number), runAs: 'typed' as const, section: 'bulletins' }));
  },
};
