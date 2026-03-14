import type { Table, Room } from '../types'
import { TABLE_PRESETS } from '../types'

export function getTableWarnings(table: Table, room: Room): string[] {
  const warnings: string[] = []

  // Out-of-bounds check (axis-aligned bounding box, ignores rotation)
  const halfW = table.sizeFt / 2
  const halfH =
    table.type === 'rectangular'
      ? (table.widthFt ?? 2.5) / 2
      : table.sizeFt / 2

  const oob =
    table.x - halfW < 0 ||
    table.x + halfW > room.widthFt ||
    table.y - halfH < 0 ||
    table.y + halfH > room.heightFt

  if (oob) warnings.push('Table is partially outside the room boundary')

  // Over-capacity check
  const preset = TABLE_PRESETS.find(
    (p) => p.type === table.type && p.sizeFt === table.sizeFt
  )
  if (preset && table.seats.length > preset.maxSeats) {
    warnings.push(`Seat count exceeds recommended maximum of ${preset.maxSeats} for this table size`)
  }

  return warnings
}
