/**
 * Teletext packet engine + ANSI tooling for doors, the board and the editor.
 *
 * The packet core is vendored TheMarco/teletext (CC BY 4.0, see NOTICE.md):
 * import .tti text, compile pages, resolve the Level 1 state machine and
 * render 8-color ANSI. render-native/tti-lexer are this tree's thin
 * board-facing layer over it (detection, file reads, slim shapes).
 */
export * from './render-native';
export * from './tti-lexer';
