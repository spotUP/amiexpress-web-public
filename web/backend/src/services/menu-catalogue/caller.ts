import type { BBSSession } from '../../index';
import type { MenuCaller } from './types';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/acs.util';
import { PermissionsUtil } from '../../utils/permissions.util';
import { checkAcsPermission, findAcsLevel } from '../../utils/acs-access-loader';
import { doorRefusedForWidth, sessionColumns } from '../../utils/door-min-columns.util';
import { doorScreenHeight } from '../../amiga-emulation/xim/screen-width.util';
import { displayModeOf } from '../../amiga-emulation/xim/display-mode.util';

export function menuCallerFromSession(session: BBSSession): MenuCaller {
  const user = session.user as any;
  return {
    secLevel: user?.secLevel ?? 0, conference: session.currentConf || 1, node: session.nodeId || 0,
    // M5 replaces this with responsiveDoorGeometry(session) (the real terminal width).
    columns: sessionColumns(session as never), rows: doorScreenHeight(session as never, 25), displayMode: displayModeOf(session as never),
    may: (k: string) => checkSecurity(user, ACSPermission[k as keyof typeof ACSPermission]),
    isSysop: PermissionsUtil.isSysop(user),
    widthRefuses: (door: object) => doorRefusedForWidth(door as never, session as never),
    overflowPref: user?.menuOverflow === 'scroll' || user?.menuOverflow === 'pages' ? user.menuOverflow : '',
  };
}

/** The admin's preview (M11): what a caller at `level` would see. ACS from the level's access file, the way checkDefaultAccess resolves a level. */
export function menuCallerForPreview(level: number, columns: number, conference: number, displayMode: MenuCaller['displayMode']): MenuCaller {
  const acsLevel = findAcsLevel(level);
  const fake = { screenWidth: columns, petsciiMode: displayMode === 'petscii', petsciiColumns: columns <= 40 ? 40 : 80, texttvMode: displayMode === 'teletext' };
  return {
    secLevel: level, conference, node: 0, columns, rows: 25, displayMode,
    may: (k: string) => checkAcsPermission(acsLevel, `ACS.${k}`),
    isSysop: level >= 255,
    widthRefuses: (door: object) => doorRefusedForWidth(door as never, fake),
    overflowPref: '',
  };
}
