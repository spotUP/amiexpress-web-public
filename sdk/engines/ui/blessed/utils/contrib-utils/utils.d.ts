/**
 * Blessed Contrib Utilities
 *
 * 1:1 port from blessed-contrib/lib/utils.js
 * Provides utility functions for contrib widgets
 */
/**
 * Recursively merge properties of two objects
 * @param obj1 First object
 * @param obj2 Second object (properties override obj1)
 * @returns Merged object
 */
export declare function MergeRecursive(obj1: any, obj2: any): any;
/**
 * Get type name of a value
 * @param thing Value to check
 * @returns Type name string
 */
export declare function getTypeName(thing: any): string;
/**
 * Abbreviate large numbers with suffixes (k, m, b, t)
 * @param value Number to abbreviate
 * @returns Abbreviated string (e.g., "1.5k", "2.3m")
 */
export declare function abbreviateNumber(value: number): string | number;
/**
 * Get color code from RGB array, color number, or color string
 * @param color RGB array [r, g, b], color code number, or color string
 * @returns Color code (number or string)
 */
export declare function getColorCode(color: number[] | number | string): number | string;
