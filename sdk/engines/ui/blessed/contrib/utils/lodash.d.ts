/**
 * Lodash Utilities
 *
 * Minimal lodash functions used by blessed-contrib widgets
 * Complete implementations for 1:1 compatibility
 */
/**
 * Find maximum value in array
 * @param array Array to search
 * @param iteratee Optional iteratee function (e.g., parseFloat)
 * @returns Maximum value
 */
export declare function max(array: any[], iteratee?: (value: any) => number): number;
/**
 * Find minimum value in array
 * @param array Array to search
 * @param iteratee Optional iteratee function
 * @returns Minimum value
 */
export declare function min(array: any[], iteratee?: (value: any) => number): number;
/**
 * Create array of numbers from start to end
 * @param start Start value
 * @param end End value
 * @param step Step value (default: 1)
 * @returns Array of numbers
 */
export declare function range(start: number, end: number, step?: number): number[];
/**
 * Sum array values
 * @param array Array to sum
 * @returns Sum
 */
export declare function sum(array: number[]): number;
/**
 * Check if value is undefined
 * @param value Value to check
 * @returns True if undefined
 */
export declare function isUndefined(value: any): value is undefined;
/**
 * Check if value is null
 * @param value Value to check
 * @returns True if null
 */
export declare function isNull(value: any): value is null;
/**
 * Clone an object/array (shallow)
 * @param value Value to clone
 * @returns Cloned value
 */
export declare function clone<T>(value: T): T;
/**
 * Deep clone an object/array
 * @param value Value to clone
 * @returns Deep cloned value
 */
export declare function cloneDeep<T>(value: T): T;
/**
 * Get value at path in object
 * @param object Object to query
 * @param path Path (string or array)
 * @param defaultValue Default value if not found
 * @returns Value at path or default
 */
export declare function get(object: any, path: string | string[], defaultValue?: any): any;
/**
 * Check if object has property at path
 * @param object Object to check
 * @param path Path to check
 * @returns True if has property
 */
export declare function has(object: any, path: string | string[]): boolean;
/**
 * Create object with keys and values
 * @param keys Keys array
 * @param values Values array
 * @returns Object
 */
export declare function zipObject(keys: string[], values: any[]): Record<string, any>;
/**
 * Default export (lodash-style)
 */
declare const _default: {
    max: typeof max;
    min: typeof min;
    range: typeof range;
    sum: typeof sum;
    isUndefined: typeof isUndefined;
    isNull: typeof isNull;
    clone: typeof clone;
    cloneDeep: typeof cloneDeep;
    get: typeof get;
    has: typeof has;
    zipObject: typeof zipObject;
};
export default _default;
