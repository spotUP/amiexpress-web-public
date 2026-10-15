/**
 * The linger for a finished RIP screen picture: it stays visible until the
 * user's first keydown (swallowed, so it cannot type into the prompt
 * waiting underneath) or until the host disarms it (a click, a new
 * picture, unmount).
 *
 * Exists as a module so the armed listener is ONE stable function
 * instance. The first version armed a ref that React reassigned every
 * render; removeEventListener then removed the new instance and the armed
 * one swallowed every keystroke forever ("i cant type after the rip image
 * has been shown").
 */
export interface RipLinger {
  /** Remove the key listener. Safe to call more than once. */
  disarm(): void;
}

export function armRipLinger(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  onDismiss: () => void,
): RipLinger {
  let armed = true;
  const handler = (e: Event) => {
    if (!armed) return;
    // Swallow the dismiss key: it closes the picture, it must not also
    // reach the terminal underneath.
    e.preventDefault();
    e.stopPropagation();
    disarm();
    onDismiss();
  };
  const disarm = () => {
    if (!armed) return;
    armed = false;
    target.removeEventListener('keydown', handler, true);
  };
  target.addEventListener('keydown', handler, true);
  return { disarm };
}
