/**
 * Teletext packet engine + ANSI tooling for doors, the board and the editor.
 *
 * The packet core is vendored TheMarco/teletext (CC BY 4.0, see NOTICE.md):
 * import .tti text, compile pages, resolve the Level 1 state machine and
 * render 8-color ANSI. render-native/tti-lexer/store/render-session are
 * this tree's thin board-facing layer over it (detection, the page graph,
 * per-session rendering).
 *
 * Everything exported here is pure. The one module that touches a disk,
 * `library.ts`, is deliberately NOT re-exported: this barrel has to stay
 * importable from a browser bundle for the editor layer. Import it by its
 * own subpath (`@amiexpress/bbs-door-sdk/teletext/library`).
 */
export * from './render-native';
export * from './tti-lexer';
export * from './store';
export * from './render-session';
export * from './compose';
export * from './screen';
export * from './packet27';

/**
 * The page model itself. A door that composes or inspects a page needs
 * these names, and hunting them out of `marco/model/types` means importing
 * the vendored tree by path - which is exactly how a second copy of an
 * import specifier gets written.
 */
export type {
  TeletextService,
  TeletextPage,
  TeletextSubpage,
  TeletextRow,
  TeletextToken,
  PageNumber,
  NationalSubset,
  FastextLinks,
  CycleTiming,
  PageControlFlags,
  PageServiceFlags,
} from './marco/model/types';
