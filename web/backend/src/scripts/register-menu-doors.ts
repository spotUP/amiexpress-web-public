/**
 * Registers the main-menu and bulletins doors through the admin's own writers
 * (writeNewDoorRegistration + applyTooltypes) - never a hand-written .info.
 *
 *   npx tsx --tsconfig web/backend/tsconfig.json \
 *     web/backend/src/scripts/register-menu-doors.ts --root . --only bulls
 *
 * Steps are added by the tasks that own them (bulls: M18, menu: M19, bulletins: M20).
 */
import * as fs from 'fs';
import * as path from 'path';
import { writeNewDoorRegistration } from '../services/config-services/door-info-file.service';
import { applyTooltypes } from '../utils/info-file.util';

type Step = (root: string) => string;

type Registration = Parameters<typeof writeNewDoorRegistration>[1];

/**
 * writeNewDoorRegistration OVERWRITES an existing .info (writeFileSync), so a
 * rerun would put back what a sysop edited since (ACCESS, DESCRIPTION, ...).
 * A registration that already exists is left exactly as it is.
 */
function registerOnce(root: string, door: Registration, tooltypes: Record<string, string>): string {
  const infoPath = path.join(root, 'Commands', door.door_type === 'SYSCMD' ? 'SysCmd' : 'BBSCmd', `${door.door_command}.info`);
  if (fs.existsSync(infoPath)) return infoPath;
  writeNewDoorRegistration(root, door);
  applyTooltypes(infoPath, Object.entries(tooltypes));
  return infoPath;
}

export const STEPS: Record<string, Step> = {
  // Old Bulls, re-registered as BULLS: the fallback FALLBACK=BULLS on B reaches
  // while the new bulletins door is absent. Tooltypes as the former B.info.
  bulls: (root) => registerOnce(root, {
    door_command: 'BULLS',
    door_type: 'XIM',
    door_path: 'DOORS:EmP_Tools/Bulls',
    min_security_level: 1,
  }, {
    MULTINODE: 'NO',
    STACK: '50000',
    C64_ADAPT: '40',
    REDACTED: '1',
  }),
  // The main menu (M19): the board's MENU command is this door. MENUSETTINGS is the
  // same binary under the W settings registration (the door tells them apart with
  // ae_menu_command()). Decisions 23.
  menu: (root) => {
    registerOnce(root, {
      door_command: 'MENUSETTINGS',
      door_type: 'XIM',
      door_path: 'Doors/MAINMENU/mainmenu',
      min_security_level: 0,
    }, {
      MIN_COLUMNS: '40',
      MULTINODE: 'YES',
      STACK: '8192',
      SETTINGS: 'YES',
      SETTINGS_LABEL: 'Long menus',
      SETTINGS_SECTION: 'Appearance',
      DESCRIPTION: 'Scroll long menus, or show them a page at a time',
    });
    return registerOnce(root, {
      door_command: 'MENU',
      door_type: 'XIM',
      door_path: 'Doors/MAINMENU/mainmenu',
      min_security_level: 0,
    }, {
      MIN_COLUMNS: '40',
      MULTINODE: 'YES',
      STACK: '8192',
      DESCRIPTION: 'The main menu',
    });
  },
  // B is the bulletins door (M20). Unlike a new registration, B.info already exists on
  // every board and is a binary Workbench icon with sysop-owned tooltypes, so it is
  // edited ONLY through applyTooltypes (icon image and every other tooltype kept),
  // never rewritten by writeNewDoorRegistration. The new door is native at forty
  // columns, so the frame adapter tooltypes go. A rerun changes nothing.
  bulletins: (root) => {
    const infoPath = path.join(root, 'Commands', 'BBSCmd', 'B.info');
    if (!fs.existsSync(infoPath)) {
      writeNewDoorRegistration(root, {
        door_command: 'B',
        door_type: 'XIM',
        door_path: 'Doors/BULLETINS/bulletins',
        min_security_level: 1,
      });
    }
    applyTooltypes(infoPath, Object.entries({
      LOCATION: 'Doors/BULLETINS/bulletins',
      FALLBACK: 'BULLS',
      MIN_COLUMNS: '40',
      MULTINODE: 'YES',
      STACK: '8192',
    }), { removeKeys: (k) => k === 'C64_ADAPT' || k === 'REDACTED' });
    return infoPath;
  },
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (require.main === module) {
  const root = path.resolve(arg('root') ?? '.');
  const only = arg('only');
  for (const [name, step] of Object.entries(STEPS)) {
    if (only && only !== name) continue;
    console.log(`[OK] ${name}: ${step(root)}`);
  }
}
