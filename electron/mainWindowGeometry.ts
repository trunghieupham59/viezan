/** Native window dimensions are DIP, not renderer CSS pixels. */
export function mainWindowGeometry(workArea: { width: number; height: number }) {
  return {
    width: Math.min(1200, workArea.width),
    height: Math.min(700, workArea.height),
    minWidth: Math.min(640, workArea.width),
    minHeight: Math.min(480, workArea.height),
  }
}
