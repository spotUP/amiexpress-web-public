/**
 * Utility functions
 * Extracted from index.ts for better modularity
 */

/**
 * Helper function to format file sizes
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Parse command parameters
 */
export function parseParams(paramString: string): string[] {
  const params: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < paramString.length; i++) {
    const char = paramString[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ' ' && !inQuotes) {
      if (current.length > 0) {
        params.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    params.push(current);
  }

  return params;
}
