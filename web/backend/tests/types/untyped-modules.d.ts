/**
 * Declarations for packages the tests use that ship no types and are not
 * direct dependencies (js-yaml arrives transitively; ws is typed by
 * @types/ws). Only the surface the tests touch is declared; this file
 * is part of tsconfig.tests.json only, so the production build is unchanged.
 */
declare module 'js-yaml' {
  export function load(input: string): unknown;
}
