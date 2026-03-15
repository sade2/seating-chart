import type { CanvasText } from '../../types'

interface CanvasTextElProps {
  text: CanvasText
  pixelsPerFoot: number
  zoom: number
  isSelected: boolean
  overridePos?: { x: number; y: number }
  onMouseDown: (e: React.MouseEvent, textId: string) => void
  onClick: (textId: string) => void
}

export default function CanvasTextEl({
  text,
  pixelsPerFoot,
  zoom,
  isSelected,
  overridePos,
  onMouseDown,
  onClick,
}: CanvasTextElProps) {
  const x = (overridePos?.x ?? text.x) * pixelsPerFoot
  const y = (overridePos?.y ?? text.y) * pixelsPerFoot

  // Estimated hit-target dimensions based on text length and font size
  const estimatedHalfW = Math.max(40, text.text.length * text.fontSize * 0.32) / zoom
  const estimatedHalfH = (text.fontSize / zoom) / 2 + 4 / zoom

  return (
    <g
      data-text-id={text.id}
      transform={`translate(${x}, ${y}) rotate(${text.rotation})`}
      style={{ cursor: 'move' }}
      onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, text.id) }}
      onClick={(e) => { e.stopPropagation(); onClick(text.id) }}
    >
      {/* Transparent hit/drag target covers the text area */}
      <rect
        x={-estimatedHalfW}
        y={-estimatedHalfH}
        width={estimatedHalfW * 2}
        height={estimatedHalfH * 2}
        fill="transparent"
      />

      {/* Selection highlight */}
      {isSelected && (
        <rect
          x={-estimatedHalfW - 2 / zoom}
          y={-estimatedHalfH - 2 / zoom}
          width={(estimatedHalfW + 2 / zoom) * 2}
          height={(estimatedHalfH + 2 / zoom) * 2}
          rx={3 / zoom}
          fill="none"
          stroke="#6366f1"
          strokeWidth={1.5 / zoom}
          strokeDasharray={`${4 / zoom} ${2 / zoom}`}
          style={{ pointerEvents: 'none' }}
        />
      )}

      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={text.fontSize / zoom}
        fill={isSelected ? '#6366f1' : '#374151'}
        fontFamily="system-ui, sans-serif"
        fontWeight="500"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {text.text}
      </text>
    </g>
  )
}
