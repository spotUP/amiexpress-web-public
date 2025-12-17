import type { AppState } from './state';
import type { Channel } from '../types';

/** Channel navigation state */
export interface NavState {
  selectedIndex: number;
  scrollOffset: number;
  maxVisible: number;
}

/** Create navigation state */
export function createNavState(maxVisible = 15): NavState {
  return { selectedIndex: 0, scrollOffset: 0, maxVisible };
}

/** Move selection up */
export function navUp(nav: NavState, channels: Channel[]): boolean {
  if (nav.selectedIndex > 0) {
    nav.selectedIndex--;
    if (nav.selectedIndex < nav.scrollOffset) {
      nav.scrollOffset = nav.selectedIndex;
    }
    return true;
  }
  return false;
}

/** Move selection down */
export function navDown(nav: NavState, channels: Channel[]): boolean {
  if (nav.selectedIndex < channels.length - 1) {
    nav.selectedIndex++;
    if (nav.selectedIndex >= nav.scrollOffset + nav.maxVisible) {
      nav.scrollOffset = nav.selectedIndex - nav.maxVisible + 1;
    }
    return true;
  }
  return false;
}

/** Get selected channel */
export function getSelectedChannel(nav: NavState, channels: Channel[]): Channel | null {
  return channels[nav.selectedIndex] || null;
}

/** Get visible channels for rendering */
export function getVisibleChannels(nav: NavState, channels: Channel[]): Channel[] {
  return channels.slice(nav.scrollOffset, nav.scrollOffset + nav.maxVisible);
}

/** Select channel by ID */
export function selectById(nav: NavState, channels: Channel[], id: string): boolean {
  const idx = channels.findIndex(c => c.id === id);
  if (idx >= 0) {
    nav.selectedIndex = idx;
    return true;
  }
  return false;
}
