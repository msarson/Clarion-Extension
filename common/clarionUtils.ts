/**
 * Utility functions for Clarion code analysis
 */

/**
 * Checks if a given position in the content is inside a MAP...END block
 * 
 * MAP blocks contain forward declarations, not implementations.
 * This helper is used to skip MAP declarations when searching for procedure implementations.
 * 
 * @param content - The full document content
 * @param position - The position (index) to check
 * @returns true if the position is inside a MAP block, false otherwise
 */
export function isInsideMapBlock(content: string, position: number): boolean {
    // Get content before the position
    const beforeMatch = content.substring(0, position).toLowerCase();
    
    // Find the last occurrence of 'map' and 'end' keywords
    const lastMapIndex = beforeMatch.lastIndexOf('map');
    const lastMapEndIndex = beforeMatch.lastIndexOf('end');
    
    // If there's a MAP keyword before this position and no END after it,
    // then we're inside a MAP block
    return lastMapIndex !== -1 && (lastMapEndIndex === -1 || lastMapEndIndex < lastMapIndex);
}
