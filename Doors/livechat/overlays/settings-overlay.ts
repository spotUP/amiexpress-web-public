import blessed, { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { AppState } from '../core/state';
import type { PresenceService, SocketEmitter } from '../services';
import { createEventCheckboxes } from './settings-checkboxes-events';
import { createPrefCheckboxes } from './settings-checkboxes-prefs';
import { createStatusRadio } from './settings-status-radio';
import { saveSettings } from './settings-save';

export function createSettingsOverlay(
  s: Screen,
  st: AppState,
  ps: PresenceService,
  se: SocketEmitter,
  uid: number,
  usb: () => void,
  hm: (w: Box) => void
): Box {
  const w = Math.min(72, Math.max(46, s.width - 6));
  const h = Math.min(22, Math.max(18, s.height - 4));
  const l = 2;

  const o = blessed.box({
    parent: s,
    top: 'center',
    left: 'center',
    width: w,
    height: h,
    label: ' Settings ',
    border: { type: 'line' },
    shadow: true,
    hidden: true,
    mouse: true,
    keys: true,
    closable: true,
    draggable: true,
    trapFocus: true,
    ch: ' ',
    style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
    zIndex: 9990,  // Modal overlays render above panels (1-10) but below dropdowns (9999)
  });

  o.enableResize();

  const eCb = createEventCheckboxes(o, st, l, 2);
  const pCb = createPrefCheckboxes(o, l, eCb.nextRow + 2, 2);

  blessed.line({
    parent: o,
    top: pCb.nextRow,
    left: l,
    width: '100%-6',
    orientation: 'horizontal',
    type: 'line',
    style: { fg: 'gray' },
  });

  blessed.box({
    parent: o,
    top: pCb.nextRow + 1,
    left: l,
    width: 20,
    height: 1,
    content: 'Status:',
    style: { fg: 'cyan' },
  });

  createStatusRadio(o, l, pCb.nextRow + 3, Math.min(6, Math.max(4, h - pCb.nextRow - 7)), ps, se, uid, usb);

  const btn = blessed.button({
    parent: o,
    bottom: 1,
    left: 'center',
    width: 12,
    height: 1,
    content: 'Close',
    mouse: true,
    style: { fg: 'white', bg: 'blue', focus: { bg: 'cyan' } },
  });

  btn.on('press', () => {
    saveSettings(st, { ...eCb, ...pCb }, usb);
    hm(o);
  });

  // Handle close from X button or ESC key
  o.on('close', () => {
    saveSettings(st, { ...eCb, ...pCb }, usb);
    hm(o);
  });

  // Add explicit escape key handler to ensure it works even when child elements are focused
  o.key(['escape'], () => {
    saveSettings(st, { ...eCb, ...pCb }, usb);
    hm(o);
  });

  return o;
}
