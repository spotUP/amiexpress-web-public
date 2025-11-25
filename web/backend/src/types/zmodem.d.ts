declare module 'zmodem.js' {
  // Minimal typing shim for zmodem.js. The library exposes a namespace with
  // Sentry, Session, and Browser helpers. We keep this loose to avoid
  // constraining the dynamic API while satisfying TypeScript consumers.
  const Zmodem: any;
  export = Zmodem;
}
