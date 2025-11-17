/**
 * Resolve a door resource path (config files, assets, etc.) using
 * Amiga-style case-insensitive lookups. Checks the current working
 * directory plus parent directories so doors can be executed from
 * web/backend or the project root.
 */
export declare function resolveDoorResourcePath(...segments: string[]): string | null;
