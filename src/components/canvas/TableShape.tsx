import type { Table } from '../../types'
import {
  getSeatPositions,
  getTableHalfW,
  getTableHalfH,
} from '../../lib/tableGeometry'
import SeatCircle from './SeatCircle'

interface TableShapeProps {
  table: Table
  pixelsPerFoot: number
  zoom: number
  isSelected: boolean
  selectedSeatId: string | null
  pendingGuestId: string | null
  guestNameMap: Record<string, string>  // seatId → guest name
  warnings: string[]
  overridePos?: { x: number; y: number }
  onMouseDown: (e: React.MouseEvent, tableId: string) => void
  onSeatClick: (seatId: string) => void
  onTableClick: (tableId: string) => void
}

export default function TableShape({
  table,
  pixelsPerFoot,
  zoom,
  isSelected,
  selectedSeatId,
  pendingGuestId,
  guestNameMap,
  warnings,
  overridePos,
  onMouseDown,
  onSeatClick,
  onTableClick,
}: TableShapeProps) {
  const x = (overridePos?.x ?? table.x) * pixelsPerFoot
  const y = (overridePos?.y ?? table.y) * pixelsPerFoot
  const rotation = table.rotation

  const halfW = getTableHalfW(table, pixelsPerFoot)
  const halfH = getTableHalfH(table, pixelsPerFoot)
  const seatPositions = getSeatPositions(table, pixelsPerFoot)

  return (
    <g transform={`translate(${x}, ${y}) rotate(${rotation})`}>
      {/* Warning drop-shadow filter */}
      {warnings.length > 0 && (
        <defs>
          <filter id={`warn-${table.id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation={5 / zoom} floodColor="#ef4444" floodOpacity="0.7" />
          </filter>
        </defs>
      )}

      {/* Selection ring */}
      {isSelected && (
        <>
          {table.type === 'round' ? (
            <circle
              r={halfW + 4 / zoom}
              fill="none"
              stroke="#6366f1"
              strokeWidth={2 / zoom}
              style={{ pointerEvents: 'none' }}
            />
          ) : (
            <rect
              x={-halfW - 4 / zoom}
              y={-halfH - 4 / zoom}
              width={(halfW + 4 / zoom) * 2}
              height={(halfH + 4 / zoom) * 2}
              rx={2 / zoom}
              fill="none"
              stroke="#6366f1"
              strokeWidth={2 / zoom}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </>
      )}

      {/* Table body — data-table-id enables contextmenu hit-testing via closest() */}
      {table.type === 'round' ? (
        <circle
          r={halfW}
          fill="#f1f5f9"
          stroke="#94a3b8"
          strokeWidth={2 / zoom}
          filter={warnings.length > 0 ? `url(#warn-${table.id})` : undefined}
          style={{ cursor: 'move' }}
          data-table-id={table.id}
          onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, table.id) }}
          onClick={(e) => { e.stopPropagation(); onTableClick(table.id) }}
        />
      ) : (
        <rect
          x={-halfW}
          y={-halfH}
          width={halfW * 2}
          height={halfH * 2}
          rx={2 / zoom}
          fill="#f1f5f9"
          stroke="#94a3b8"
          strokeWidth={2 / zoom}
          filter={warnings.length > 0 ? `url(#warn-${table.id})` : undefined}
          style={{ cursor: 'move' }}
          data-table-id={table.id}
          onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, table.id) }}
          onClick={(e) => { e.stopPropagation(); onTableClick(table.id) }}
        />
      )}

      {/* Seats */}
      {seatPositions.map((pos, i) => {
        const seat = table.seats[i]
        const isOccupied = seat.guestId !== null
        return (
          <SeatCircle
            key={seat.id}
            seat={seat}
            x={pos.x}
            y={pos.y}
            zoom={zoom}
            tableRotation={rotation}
            guestName={isOccupied ? guestNameMap[seat.id] : undefined}
            isSelected={selectedSeatId === seat.id}
            isPending={!!pendingGuestId && !isOccupied}
            isDimmed={!!pendingGuestId && isOccupied}
            onClick={onSeatClick}
          />
        )
      })}

      {/* Table label */}
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={13 / zoom}
        fontWeight="600"
        fill="#475569"
        fontFamily="system-ui, sans-serif"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {table.label}
      </text>

      {/* Warning indicator */}
      {warnings.length > 0 && (
        <text
          x={table.type === 'round' ? halfW * 0.7 : halfW + 4 / zoom}
          y={table.type === 'round' ? -halfW * 0.7 : -halfH - 4 / zoom}
          fontSize={12 / zoom}
          fill="#ef4444"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          ⚠
        </text>
      )}

    </g>
  )
}
