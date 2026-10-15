/** Which source answers `AEW_MENU OPEN <kind>`. MAIN and BULLETINS register here; J will register CONFERENCES. */
import type { MenuSource } from './types';
import { mainMenuSource } from './sources/main';
import { bulletinsMenuSource } from './sources/bulletins';
const sources = new Map<string, MenuSource>();
export function registerMenuSource(source: MenuSource): void { sources.set(source.kind, source); }
export function menuSourceFor(kind: string): MenuSource | undefined { return sources.get(kind.toUpperCase()); }
registerMenuSource(mainMenuSource);
registerMenuSource(bulletinsMenuSource);
