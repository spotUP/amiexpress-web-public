/**
 * THE PAGE DOES NOT ZOOM. The terminal does.
 *
 * The browser's pinch scales everything, and the on-screen keyboard is
 * position:fixed - anchored to the LAYOUT viewport - so a pinch does not merely
 * make the keys bigger, it slides them off the screen ("zooming on phones zooms
 * the keyboard away, the keyboard should never zoom only the terminal").
 *
 * BBSTerminal routes a two-finger pinch to the terminal's own zoom, but only
 * while its zoom is enabled AND it is in fixed mode - neither of which holds on
 * a phone, so on the device that needed it most nothing refused the browser at
 * all.
 *
 * Safari ignores `maximum-scale` and `user-scalable=no` in the viewport meta and
 * zooms on its own gesture events instead. Those events exist on no other engine
 * and refusing them is the only way to stop it.
 */
export const PAGE_ZOOM_EVENTS = ['gesturestart', 'gesturechange', 'gestureend'] as const;

export function refusePageZoom(target: EventTarget): () => void {
  const refuse = (event: Event) => event.preventDefault();
  for (const name of PAGE_ZOOM_EVENTS) {
    target.addEventListener(name, refuse, { passive: false });
  }
  return () => {
    for (const name of PAGE_ZOOM_EVENTS) {
      target.removeEventListener(name, refuse);
    }
  };
}
