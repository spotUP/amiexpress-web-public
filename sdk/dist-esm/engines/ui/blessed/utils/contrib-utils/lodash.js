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
export function max(array, iteratee) {
    if (!array || array.length === 0) {
        return -Infinity;
    }
    if (iteratee) {
        const values = array.map(iteratee).filter((v) => !isNaN(v));
        return values.length > 0 ? Math.max(...values) : -Infinity;
    }
    const values = array.filter((v) => typeof v === 'number' && !isNaN(v));
    return values.length > 0 ? Math.max(...values) : -Infinity;
}
/**
 * Find minimum value in array
 * @param array Array to search
 * @param iteratee Optional iteratee function
 * @returns Minimum value
 */
export function min(array, iteratee) {
    if (!array || array.length === 0) {
        return Infinity;
    }
    if (iteratee) {
        const values = array.map(iteratee).filter((v) => !isNaN(v));
        return values.length > 0 ? Math.min(...values) : Infinity;
    }
    const values = array.filter((v) => typeof v === 'number' && !isNaN(v));
    return values.length > 0 ? Math.min(...values) : Infinity;
}
/**
 * Create array of numbers from start to end
 * @param start Start value
 * @param end End value
 * @param step Step value (default: 1)
 * @returns Array of numbers
 */
export function range(start, end, step = 1) {
    const result = [];
    if (step === 0)
        return result;
    if (step > 0) {
        for (let i = start; i < end; i += step) {
            result.push(i);
        }
    }
    else {
        for (let i = start; i > end; i += step) {
            result.push(i);
        }
    }
    return result;
}
/**
 * Sum array values
 * @param array Array to sum
 * @returns Sum
 */
export function sum(array) {
    if (!array || array.length === 0) {
        return 0;
    }
    return array.reduce((acc, val) => acc + (typeof val === 'number' && !isNaN(val) ? val : 0), 0);
}
/**
 * Check if value is undefined
 * @param value Value to check
 * @returns True if undefined
 */
export function isUndefined(value) {
    return value === undefined;
}
/**
 * Check if value is null
 * @param value Value to check
 * @returns True if null
 */
export function isNull(value) {
    return value === null;
}
/**
 * Clone an object/array (shallow)
 * @param value Value to clone
 * @returns Cloned value
 */
export function clone(value) {
    if (Array.isArray(value)) {
        return [...value];
    }
    if (typeof value === 'object' && value !== null) {
        return { ...value };
    }
    return value;
}
/**
 * Deep clone an object/array
 * @param value Value to clone
 * @returns Deep cloned value
 */
export function cloneDeep(value) {
    if (Array.isArray(value)) {
        return value.map((item) => cloneDeep(item));
    }
    if (typeof value === 'object' && value !== null) {
        const result = {};
        for (const key in value) {
            if (value.hasOwnProperty(key)) {
                result[key] = cloneDeep(value[key]);
            }
        }
        return result;
    }
    return value;
}
/**
 * Get value at path in object
 * @param object Object to query
 * @param path Path (string or array)
 * @param defaultValue Default value if not found
 * @returns Value at path or default
 */
export function get(object, path, defaultValue) {
    if (!object)
        return defaultValue;
    const pathArray = Array.isArray(path) ? path : path.split('.');
    let result = object;
    for (const key of pathArray) {
        if (result == null) {
            return defaultValue;
        }
        result = result[key];
    }
    return result !== undefined ? result : defaultValue;
}
/**
 * Check if object has property at path
 * @param object Object to check
 * @param path Path to check
 * @returns True if has property
 */
export function has(object, path) {
    if (!object)
        return false;
    const pathArray = Array.isArray(path) ? path : path.split('.');
    let result = object;
    for (const key of pathArray) {
        if (result == null || !Object.prototype.hasOwnProperty.call(result, key)) {
            return false;
        }
        result = result[key];
    }
    return true;
}
/**
 * Create object with keys and values
 * @param keys Keys array
 * @param values Values array
 * @returns Object
 */
export function zipObject(keys, values) {
    const result = {};
    for (let i = 0; i < keys.length; i++) {
        result[keys[i]] = values[i];
    }
    return result;
}
/**
 * Default export (lodash-style)
 */
export default {
    max,
    min,
    range,
    sum,
    isUndefined,
    isNull,
    clone,
    cloneDeep,
    get,
    has,
    zipObject
};
