/**
 * Sparkline Generator
 *
 * Port of sparkline npm package functionality
 * Generates sparkline characters (▁▂▃▄▅▆▇█) from number arrays
 */

/**
 * Sparkline characters (8 levels)
 */
const ticks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Generate sparkline from array of numbers
 * @param numbers Array of numbers to visualize
 * @param options Options (min, max)
 * @returns Sparkline string
 */
export function sparkline(numbers: number[], options?: { min?: number; max?: number }): string {
  if (!numbers || numbers.length === 0) {
    return '';
  }

  // Filter out non-numeric values
  const validNumbers = numbers.filter((n) => typeof n === 'number' && !isNaN(n));

  if (validNumbers.length === 0) {
    return '';
  }

  // Get min/max
  const min = options?.min !== undefined ? options.min : Math.min(...validNumbers);
  const max = options?.max !== undefined ? options.max : Math.max(...validNumbers);

  // Handle case where all values are the same
  if (min === max) {
    return ticks[0].repeat(validNumbers.length);
  }

  const range = max - min;

  // Map each number to a sparkline character
  return validNumbers
    .map((n) => {
      const normalized = (n - min) / range;
      const index = Math.min(Math.floor(normalized * ticks.length), ticks.length - 1);
      return ticks[index];
    })
    .join('');
}
