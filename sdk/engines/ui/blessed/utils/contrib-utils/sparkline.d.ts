/**
 * Sparkline Generator
 *
 * Port of sparkline npm package functionality
 * Generates sparkline characters (▁▂▃▄▅▆▇█) from number arrays
 */
/**
 * Generate sparkline from array of numbers
 * @param numbers Array of numbers to visualize
 * @param options Options (min, max)
 * @returns Sparkline string
 */
export declare function sparkline(numbers: number[], options?: {
    min?: number;
    max?: number;
}): string;
