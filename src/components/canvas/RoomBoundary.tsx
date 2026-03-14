import type { Room } from '../../types'

interface RoomBoundaryProps {
  room: Room
}

export default function RoomBoundary({ room }: RoomBoundaryProps) {
  const { widthFt, heightFt, pixelsPerFoot, floorPlan } = room
  const roomW = widthFt * pixelsPerFoot
  const roomH = heightFt * pixelsPerFoot

  return (
    <g pointerEvents="none">
      <defs>
        {/* 1ft grid pattern — drawn at base scale; zoom is applied by parent transform */}
        <pattern
          id="room-grid"
          width={pixelsPerFoot}
          height={pixelsPerFoot}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${pixelsPerFoot} 0 L 0 0 0 ${pixelsPerFoot}`}
            fill="none"
            stroke="#f0f0f0"
            strokeWidth={0.5}
          />
        </pattern>
      </defs>

      {/* Room fill + grid */}
      <rect width={roomW} height={roomH} fill="white" />

      {/* Floor plan traced paths — rendered behind grid */}
      {floorPlan && (
        <g
          opacity={floorPlan.opacity}
          transform={`scale(${roomW / floorPlan.viewBox.width})`}
          pointerEvents="none"
        >
          {/* Inner transform maps potrace coordinate space to image-pixel space */}
          <g transform={floorPlan.svgTransform}>
            {floorPlan.paths.map((p, i) => (
              <path key={i} d={p.d} fill="#374151" stroke="none" />
            ))}
          </g>
        </g>
      )}

      <rect width={roomW} height={roomH} fill="url(#room-grid)" />

      {/* Room border */}
      <rect
        width={roomW}
        height={roomH}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth={1.5}
      />
    </g>
  )
}
