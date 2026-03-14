import type { Table } from '../types'

// Physical constants (in feet)
const SEAT_GAP_FT = 0.15   // gap between table edge and seat center
const LABEL_GAP_FT = 0.55  // gap below the seat row to the label baseline

// Fixed visual constants (screen pixels)
export const SEAT_SCREEN_R = 8       // seat circle radius in screen pixels
export const HANDLE_SCREEN_R = 6     // rotation handle radius in screen pixels
export const HANDLE_DIST_FT = 0.9   // distance above the table top edge to handle center

/** Seat center positions in table-local SVG units (table center = origin). */
export function getSeatPositions(
  table: Table,
  pxPerFt: number,
): { x: number; y: number }[] {
  const count = table.seats.length
  if (count === 0) return []

  if (table.type === 'round') {
    const orbitR = (table.sizeFt / 2 + SEAT_GAP_FT) * pxPerFt
    return table.seats.map((_, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2
      return { x: Math.cos(angle) * orbitR, y: Math.sin(angle) * orbitR }
    })
  }

  if (table.type === 'rectangular') {
    const halfW = (table.sizeFt / 2) * pxPerFt
    const halfH = ((table.widthFt ?? 2.5) / 2) * pxPerFt
    const rowY = (halfH / pxPerFt + SEAT_GAP_FT) * pxPerFt
    const topCount = Math.ceil(count / 2)
    const botCount = count - topCount
    const positions: { x: number; y: number }[] = []
    for (let i = 0; i < topCount; i++) {
      positions.push({ x: -halfW + halfW * 2 * ((i + 0.5) / topCount), y: -rowY })
    }
    for (let i = 0; i < botCount; i++) {
      positions.push({ x: -halfW + halfW * 2 * ((i + 0.5) / botCount), y: rowY })
    }
    return positions
  }

  // square
  const halfS = (table.sizeFt / 2) * pxPerFt
  const gap = (table.sizeFt / 2 + SEAT_GAP_FT) * pxPerFt

  if (count <= 4) {
    // one per side: top, right, bottom, left
    return [
      { x: 0, y: -gap },
      { x: gap, y: 0 },
      { x: 0, y: gap },
      { x: -gap, y: 0 },
    ].slice(0, count)
  }

  // 5-6: extra seats distributed top/bottom like rectangular
  const rowY = (table.sizeFt / 2 + SEAT_GAP_FT) * pxPerFt
  const topCount = Math.ceil(count / 2)
  const botCount = count - topCount
  const positions: { x: number; y: number }[] = []
  for (let i = 0; i < topCount; i++) {
    positions.push({ x: -halfS + halfS * 2 * ((i + 0.5) / topCount), y: -rowY })
  }
  for (let i = 0; i < botCount; i++) {
    positions.push({ x: -halfS + halfS * 2 * ((i + 0.5) / botCount), y: rowY })
  }
  return positions
}

/** Y offset from table center to the bottom of the table + seat area (for label placement). */
export function getLabelY(table: Table, pxPerFt: number): number {
  const halfFt =
    table.type === 'rectangular'
      ? (table.widthFt ?? 2.5) / 2
      : table.sizeFt / 2
  return (halfFt + SEAT_GAP_FT + LABEL_GAP_FT) * pxPerFt
}

/** Y offset from table center to rotation handle center (negative = above table). */
export function getHandleY(table: Table, pxPerFt: number): number {
  const halfFt =
    table.type === 'rectangular'
      ? (table.widthFt ?? 2.5) / 2
      : table.sizeFt / 2
  return -(halfFt + HANDLE_DIST_FT) * pxPerFt
}

/** Table half-width in SVG units (for the shape rect). */
export function getTableHalfW(table: Table, pxPerFt: number): number {
  return (table.sizeFt / 2) * pxPerFt
}

/** Table half-height in SVG units (for the shape rect). */
export function getTableHalfH(table: Table, pxPerFt: number): number {
  if (table.type === 'rectangular') return ((table.widthFt ?? 2.5) / 2) * pxPerFt
  return (table.sizeFt / 2) * pxPerFt
}
