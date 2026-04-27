/* tslint:disable */
/* eslint-disable */

/**
 * Extract all entries from an LZX archive.
 * Returns a JSON string: [{name: string, data: number[]}]
 */
export function lzx_extract_all(archive_bytes: Uint8Array): string;

/**
 * List filenames in an LZX archive.
 * Returns a JSON string: string[]
 */
export function lzx_list_files(archive_bytes: Uint8Array): string;

/**
 * Create an LZX archive from entries.
 * entries_json: JSON string [{name: string, data: number[]}]
 * Returns the raw archive bytes.
 */
export function lzx_pack(entries_json: string): Uint8Array;
