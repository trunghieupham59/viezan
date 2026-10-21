/**
 * Roving-selection keyboard model shared by the style and accent strips:
 * arrows move one step (wrapping), Home and End jump to the ends. Returns
 * the next index, or null when the key is not a navigation key.
 */
export function nextRadioIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
