/**
 * The stacked menu bar reading: temperature over fan speed in one image.
 *
 * macOS has no two-line status item title, so the compact layout is an image. It is
 * drawn here from a tiny pixel font (digits, the degree sign, `.`, `k`, `-`), as a
 * raw BGRA bitmap at 2× for Retina menu bars; main wraps it in a template
 * `NativeImage`, so macOS tints it for light and dark menu bars. Pure, so the exact
 * pixels are unit-tested.
 */

/** A glyph is `height` rows of `width` cells; `#` is ink. */
const GLYPH_HEIGHT = 8

const GLYPHS: Record<string, readonly string[]> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
  '5': ['#####', '#....', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '...#.', '.##..'],
  '°': ['.##.', '#..#', '#..#', '.##.', '....', '....', '....', '....'],
  '.': ['..', '..', '..', '..', '..', '..', '##', '##'],
  k: ['#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#', '#..#'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....', '.....'],
  ' ': ['..', '..', '..', '..', '..', '..', '..', '..'],
}

/** Characters with no glyph draw as a dash, so a surprise never produces an empty item. */
const FALLBACK = GLYPHS['-']

/** Cell size in physical pixels (2× Retina: one cell is one point). */
export const STACKED_CELL_PX = 2
/** Menu bar status items are 22 points tall. */
export const STACKED_HEIGHT_PX = 22 * STACKED_CELL_PX
const GAP_CELLS = 1
const PADDING_CELLS = 1
/** Top of each row in cells: two 8-cell rows inside 22 cells, 2 cells apart. */
const ROW_TOPS = [2, 12]

export interface StackedBitmap {
  /** Physical pixels. */
  width: number
  height: number
  scaleFactor: number
  /** BGRA, premultiplied is moot: every inked pixel is opaque black. */
  buffer: Buffer
}

function glyphFor(char: string): readonly string[] {
  return GLYPHS[char] ?? FALLBACK
}

/** Row width in cells, glyph gaps included. */
export function stackedRowWidth(text: string): number {
  const chars = [...text]
  if (chars.length === 0) return 0
  return chars.reduce((sum, char) => sum + glyphFor(char)[0].length, 0) + GAP_CELLS * (chars.length - 1)
}

/**
 * Draw up to two lines (the temperature, the fan speed) into one Retina bitmap.
 * Lines are centred; the image is as wide as the longer line plus a cell of padding.
 */
export function renderStackedBitmap(lines: readonly string[]): StackedBitmap {
  const rows = lines.slice(0, ROW_TOPS.length)
  const widthCells = Math.max(1, ...rows.map(stackedRowWidth)) + PADDING_CELLS * 2
  const width = widthCells * STACKED_CELL_PX
  const height = STACKED_HEIGHT_PX
  const buffer = Buffer.alloc(width * height * 4)
  const ink = (cellX: number, cellY: number) => {
    for (let dy = 0; dy < STACKED_CELL_PX; dy++) {
      for (let dx = 0; dx < STACKED_CELL_PX; dx++) {
        const offset = ((cellY * STACKED_CELL_PX + dy) * width + cellX * STACKED_CELL_PX + dx) * 4
        buffer[offset + 3] = 255 // B, G, R stay 0: black
      }
    }
  }
  rows.forEach((text, rowIndex) => {
    let x = PADDING_CELLS + Math.floor((widthCells - PADDING_CELLS * 2 - stackedRowWidth(text)) / 2)
    const top = ROW_TOPS[rowIndex]
    for (const char of text) {
      const glyph = glyphFor(char)
      for (let gy = 0; gy < GLYPH_HEIGHT; gy++) {
        const line = glyph[gy]
        for (let gx = 0; gx < line.length; gx++) if (line[gx] === '#') ink(x + gx, top + gy)
      }
      x += glyph[0].length + GAP_CELLS
    }
  })
  return { width, height, scaleFactor: STACKED_CELL_PX, buffer }
}
