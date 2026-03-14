import type { Table } from '../../types'
import {
  getSeatPositions,
  getLabelY,
  getHandleY,
  getTableHalfW,
  getTableHalfH,
  HANDLE_SCREEN_R,
} from '../../lib/tableGeometry'
import SeatCircle from './SeatCircle'

interface TableShapeProps {
  table: Table
  pixelsPerFoot: number
  zoom: number
  isSelected: boolean
  selectedSeatId: string | null
  guestNameMap: Record<string, string>  // seatId → guest name
  overridePos?: { x: number; y: number }
  overrideRotation?: number
  onMouseDown: (e: React.MouseEvent, tableId: string) => void
  onRotateHandleMouseDown: (e: React.MouseEvent, tableId: string) => void
  onSeatClick: (seatId: string) => void
  onTableClick: (tableId: string) => void
}

export default function TableShape({
  table,
  pixelsPerFoot,
  zoom,
  isSelected,
  selectedSeatId,
  guestNameMap,
  overridePos,
  overrideRotation,
  onMouseDown,
  onRotateHandleMouseDown,
  onSeatClick,
  onTableClick,
}: TableShapeProps) {
  const x = (overridePos?.x ?? table.x) * pixelsPerFoot
  const y = (overridePos?.y ?? table.y) * pixelsPerFoot
  const rotation = overrideRotation ?? table.rotation

  const halfW = getTableHalfW(table, pixelsPerFoot)
  const halfH = getTableHalfH(table, pixelsPerFoot)
  const seatPositions = getSeatPositions(table, pixelsPerFoot)
  const labelY = getLabelY(table, pixelsPerFoot)
  const handleY = getHandleY(table, pixelsPerFoot)

  const isRect = table.type === 'rectangular' || table.type === 'square'

  return (
    <g transform={`translate(${x}, ${y}) rotate(${rotation})`}>
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

      {/* Table body */}
      {table.type === 'round' ? (
        <circle
          r={halfW}
          fill="#f1f5f9"
          stroke="#94a3b8"
          strokeWidth={2 / zoom}
          style={{ cursor: 'move' }}
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
          style={{ cursor: 'move' }}
          onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, table.id) }}
          onClick={(e) => { e.stopPropagation(); onTableClick(table.id) }}
        />
      )}

      {/* Seats */}
      {seatPositions.map((pos, i) => {
        const seat = table.seats[i]
        return (
          <SeatCircle
            key={seat.id}
            seat={seat}
            x={pos.x}
            y={pos.y}
            zoom={zoom}
            guestName={seat.guestId ? guestNameMap[seat.id] : undefined}
            isSelected={selectedSeatId === seat.id}
            onClick={onSeatClick}
          />
        )
      })}

      {/* Table label */}
      <text
        x={0}
        y={labelY}
        textAnchor="middle"
        fontSize={11 / zoom}
        fill="#64748b"
        fontFamily="system-ui, sans-serif"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {table.label}
      </text>

      {/* Rotation handle — rectangular and square only */}
      {isRect && (
        <g>
          {/* Stem line */}
          <line
            x1={0}
            y1={-halfH}
            x2={0}
            y2={handleY}
            stroke="#94a3b8"
            strokeWidth={1 / zoom}
            style={{ pointerEvents: 'none' }}
          />
          {/* Handle circle */}
          <circle
            cx={0}
            cy={handleY}
            r={HANDLE_SCREEN_R / zoom}
            fill="white"
            stroke="#94a3b8"
            strokeWidth={1.5 / zoom}
            style={{ cursor: 'grab' }}
            onMouseDown={(e) => {
              e.stopPropagation()
              onRotateHandleMouseDown(e, table.id)
            }}
          />
        </g>
      )}
    </g>
  )
}
