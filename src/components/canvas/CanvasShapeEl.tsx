import type { CanvasShape } from '../../types'

interface CanvasShapeElProps {
  shape: CanvasShape
  pixelsPerFoot: number
  zoom: number
  isSelected: boolean
  overridePos?: { x: number; y: number }
  onMouseDown: (e: React.MouseEvent, shapeId: string) => void
  onClick: (shapeId: string) => void
}

export default function CanvasShapeEl({
  shape,
  pixelsPerFoot,
  zoom,
  isSelected,
  overridePos,
  onMouseDown,
  onClick,
}: CanvasShapeElProps) {
  const x = (overridePos?.x ?? shape.x) * pixelsPerFoot
  const y = (overridePos?.y ?? shape.y) * pixelsPerFoot
  const halfW = (shape.widthFt / 2) * pixelsPerFoot
  const halfH = (shape.heightFt / 2) * pixelsPerFoot

  return (
    <g
      data-shape-id={shape.id}
      transform={`translate(${x}, ${y}) rotate(${shape.rotation})`}
      style={{ cursor: 'move' }}
      onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, shape.id) }}
      onClick={(e) => { e.stopPropagation(); onClick(shape.id) }}
    >
      {/* Selection ring */}
      {isSelected && (
        shape.type === 'circle' ? (
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
        )
      )}

      {/* Shape body */}
      {shape.type === 'circle' ? (
        <circle r={halfW} fill={shape.color} stroke="none" opacity={0.85} />
      ) : (
        <rect
          x={-halfW}
          y={-halfH}
          width={halfW * 2}
          height={halfH * 2}
          rx={3 / zoom}
          fill={shape.color}
          stroke="none"
          opacity={0.85}
        />
      )}

      {/* Label */}
      {shape.label && (
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={13 / zoom}
          fontWeight="600"
          fill="white"
          fontFamily="system-ui, sans-serif"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {shape.label}
        </text>
      )}
    </g>
  )
}
