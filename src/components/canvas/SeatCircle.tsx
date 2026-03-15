import { SEAT_SCREEN_R, SEAT_SCREEN_R_MIN, SEAT_SCREEN_R_MAX } from '../../lib/tableGeometry'
import type { Seat } from '../../types'

interface SeatCircleProps {
  seat: Seat
  x: number
  y: number
  zoom: number
  tableRotation?: number   // counter-rotate initials to keep them upright
  guestName?: string       // set when seat is occupied
  hostName?: string        // set when guest is a plus-one; shows host initials + "+1"
  isSelected?: boolean     // amber highlight
  isPending?: boolean      // pulsing outline during assignment mode
  isDimmed?: boolean       // during assignment mode, occupied seats dim
  onClick?: (seatId: string) => void
}

export default function SeatCircle({
  seat,
  x,
  y,
  zoom,
  tableRotation = 0,
  guestName,
  hostName,
  isSelected = false,
  isPending = false,
  isDimmed = false,
  onClick,
}: SeatCircleProps) {
  // Clamp the screen-pixel radius, then convert to SVG local coordinates
  const screenR = Math.max(SEAT_SCREEN_R_MIN, Math.min(SEAT_SCREEN_R_MAX, SEAT_SCREEN_R))
  const r = screenR / zoom
  const sw = 1 / zoom

  const isOccupied = seat.guestId !== null

  let fill = '#d1d5db'            // empty: grey
  if (isOccupied) fill = '#6366f1' // occupied: indigo
  if (isSelected) fill = '#f59e0b' // selected: amber

  const stroke = isSelected ? '#d97706' : '#9ca3af'

  function getInitials(name: string) {
    return name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase()
  }

  // Plus-one: show host's initials; regular: show guest's own initials
  const initials = hostName ? getInitials(hostName) : guestName ? getInitials(guestName) : ''
  const isPlusOne = !!hostName

  return (
    <g
      data-seat-id={seat.id}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        opacity: isDimmed ? 0.35 : 1,
      }}
      onClick={onClick ? () => onClick(seat.id) : undefined}
    >
      {isPending && (
        <circle
          cx={x}
          cy={y}
          r={r + 3 / zoom}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={1.5 / zoom}
          strokeDasharray={`${3 / zoom} ${2 / zoom}`}
        />
      )}
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
      />
      {isOccupied && initials && (
        <g transform={`rotate(${-tableRotation}, ${x}, ${y})`}>
          {isPlusOne ? (
            <>
              <text
                x={x}
                y={y - r * 0.25}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.round(screenR * 0.6) / zoom}
                fill="white"
                fontFamily="system-ui, sans-serif"
                fontWeight="600"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {initials}
              </text>
              <text
                x={x}
                y={y + r * 0.55}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.round(screenR * 0.42) / zoom}
                fill="white"
                fontFamily="system-ui, sans-serif"
                fontWeight="600"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                +1
              </text>
            </>
          ) : (
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={Math.round(screenR * 0.65) / zoom}
              fill="white"
              fontFamily="system-ui, sans-serif"
              fontWeight="600"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {initials}
            </text>
          )}
        </g>
      )}
    </g>
  )
}
