import '@testing-library/jest-dom';

/*
 * jsdom has no pointer capture. The design system's pointer-driven widgets
 * (the toast's swipe-to-dismiss among them) call it on every pointer event, and
 * the TypeError surfaced as an unhandled error AFTER the test had passed - so
 * every run reported 604 passing tests and a non-zero exit code, and a gate on
 * the exit code read green suites as red.
 */
for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
  if (typeof Element.prototype[method] !== 'function') {
    Object.defineProperty(Element.prototype, method, {
      configurable: true,
      writable: true,
      value: method === 'hasPointerCapture' ? () => false : () => undefined,
    });
  }
}
