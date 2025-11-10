/**
 * Module-level cache for book references
 * This cache persists across component mounts/unmounts
 */

const bookReferenceCache = new Map<string, string>();

/**
 * Get a cached book reference by question text
 */
export function getCachedBookReference(questionText: string): string | undefined {
  return bookReferenceCache.get(questionText);
}

/**
 * Set a book reference in the cache
 */
export function setCachedBookReference(questionText: string, reference: string): void {
  bookReferenceCache.set(questionText, reference);
}

/**
 * Check if a book reference exists in the cache
 */
export function hasCachedBookReference(questionText: string): boolean {
  return bookReferenceCache.has(questionText);
}

/**
 * Clear the entire cache (useful for testing or reset)
 */
export function clearBookReferenceCache(): void {
  bookReferenceCache.clear();
}

/**
 * Get the size of the cache
 */
export function getCacheSize(): number {
  return bookReferenceCache.size;
}

