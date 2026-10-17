import type { BBSSession } from '../../index';
import type { MenuCaller } from './types';
import { isMenuStyle } from '../../screens/menu-config/menu-config';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/acs.util';
import { PermissionsUtil } from '../../utils/permissions.util';
import { checkAcsPermission, findAcsLevel } from '../../utils/acs-access-loader';
import { doorRefusedForWidth } from '../../utils/door-min-columns.util';
import { responsiveDoorGeometry } from '../../amiga-emulation/xim/screen-width.util';
import { displayModeOf } from '../../amiga-emulation/xim/display-mode.util';

/**
 * A gate key as written: `DOWNLOAD` (the ACSPermission key INTERNAL_COMMANDS uses) or
 * `ACS.DOWNLOAD` (the permission's name, as checkSecurityByName and the Access files spell it).
 * Both name the same permission; the bare key is the canonical form.
 */
export function bareGateKey(k: string): string {
  return k.startsWith('ACS.') ? k.slice(4) : k;
}

export function menuCallerFromSession(session: BBSSession): MenuCaller {
  const user = session.user as any;
  // WEB_: the real terminal size (AEW_SCREEN SIZE answers the same), not the board's 80-column model.
  const geometry = responsiveDoorGeometry(session as never);
  return {
    secLevel: user?.secLevel ?? 0, conference: session.currentConf || 1, node: session.nodeId || 0,
    columns: geometry.cols, rows: geometry.rows, displayMode: displayModeOf(session as never),
    may: (k: string) => checkSecurity(user, ACSPermission[bareGateKey(k) as keyof typeof ACSPermission]),
    isSysop: PermissionsUtil.isSysop(user),
    widthRefuses: (door: object) => doorRefusedForWidth(door as never, session as never),
    stylePref: isMenuStyle(user?.menuStyle) ? user.menuStyle : '',
  };
}

/** The admin's preview (M11): what a caller at `level` would see. ACS from the level's access file, the way checkDefaultAccess resolves a level. */
export function menuCallerForPreview(level: number, columns: number, conference: number, displayMode: MenuCaller['displayMode']): MenuCaller {
  const acsLevel = findAcsLevel(level);
  const fake = { screenWidth: columns, petsciiMode: displayMode === 'petscii', petsciiColumns: columns <= 40 ? 40 : 80, texttvMode: displayMode === 'teletext' };
  return {
    secLevel: level, conference, node: 0, columns, rows: 25, displayMode,
    may: (k: string) => checkAcsPermission(acsLevel, `ACS.${bareGateKey(k)}`),
    isSysop: level >= 255,
    widthRefuses: (door: object) => doorRefusedForWidth(door as never, fake),
    stylePref: '',
  };
}
