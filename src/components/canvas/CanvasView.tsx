import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import RoomBoundary from './RoomBoundary'
import TableShape from './TableShape'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

type Point = { x: number; y: number }

type DragState =
  | { type: 'none' }
  | { type: 'pan'; startMouse: Point; startPan: Point }
  | { type: 'table'; tableId: string; startMouse: Point; startPosFt: Point; currentPosFt: Point }
  | { type: 'rotate'; tableId: string; tableCenterScreen: Point; currentRotation: number }

export default function CanvasView() {
  const project = useProjectStore((s) => s.project)
  const selectedTableId = useProjectStore((s) => s.selectedTableId)
  const selectedSeatId = useProjectStore((s) => s.selectedSeatId)
  const updateTable = useProjectStore((s) => s.updateTable)
  const setSelectedTable = useProjectStore((s) => s.setSelectedTable)
  const setSelectedSeat = useProjectStore((s) => s.setSelectedSeat)

  const svgRef = useRef<SVGSVGElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [drag, setDrag] = useState<DragState>({ type: 'none' })

  // Stable refs so wheel/move handlers never close over stale state
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  const dragRef = useRef(drag)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { panRef.current = pan }, [pan])
  useEffect(() => { dragRef.current = drag }, [drag])

  // Center room in viewport when project first loads
  useEffect(() => {
    if (!project) return
    const svg = svgRef.current
    if (!svg) return
    const { width, height } = svg.getBoundingClientRect()
    const { widthFt, heightFt, pixelsPerFoot } = project.room
    const roomW = widthFt * pixelsPerFoot
    const roomH = heightFt * pixelsPerFoot
    const fitZoom = Math.min(1, (width * 0.85) / roomW, (height * 0.85) / roomH)
    const initialZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom))
    setZoom(initialZoom)
    setPan({ x: (width - roomW * initialZoom) / 2, y: (height - roomH * initialZoom) / 2 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!project])

  // Scroll-wheel zoom toward cursor
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const prevZoom = zoomRef.current
    const prevPan = panRef.current
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prevZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
    const worldX = (cx - prevPan.x) / prevZoom
    const worldY = (cy - prevPan.y) / prevZoom
    setZoom(newZoom)
    setPan({ x: cx - worldX * newZoom, y: cy - worldY * newZoom })
  }, [])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // seatId → guest name map for rendering initials
  const guestNameMap = useMemo<Record<string, string>>(() => {
    if (!project) return {}
    const map: Record<string, string> = {}
    for (const guest of project.guests) {
      if (guest.seatId) map[guest.seatId] = guest.name
    }
    return map
  }, [project])

  // ── Mouse handlers ──────────────────────────────────────────────────────────

  const handleBgMouseDown = (e: React.MouseEvent<SVGRectElement>) => {
    if (e.button !== 0) return
    setSelectedTable(null)
    setDrag({
      type: 'pan',
      startMouse: { x: e.clientX, y: e.clientY },
      startPan: panRef.current,
    })
  }

  const handleTableMouseDown = (e: React.MouseEvent, tableId: string) => {
    if (e.button !== 0) return
    const table = project?.tables.find((t) => t.id === tableId)
    if (!table) return
    setDrag({
      type: 'table',
      tableId,
      startMouse: { x: e.clientX, y: e.clientY },
      startPosFt: { x: table.x, y: table.y },
      currentPosFt: { x: table.x, y: table.y },
    })
  }

  const handleRotateHandleMouseDown = (e: React.MouseEvent, tableId: string) => {
    if (e.button !== 0) return
    const table = project?.tables.find((t) => t.id === tableId)
    if (!table) return
    const pxPerFt = project!.room.pixelsPerFoot
    const tableCenterScreen: Point = {
      x: table.x * pxPerFt * zoomRef.current + panRef.current.x,
      y: table.y * pxPerFt * zoomRef.current + panRef.current.y,
    }
    setDrag({ type: 'rotate', tableId, tableCenterScreen, currentRotation: table.rotation })
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const d = dragRef.current
    if (d.type === 'none') return

    if (d.type === 'pan') {
      const dx = e.clientX - d.startMouse.x
      const dy = e.clientY - d.startMouse.y
      setPan({ x: d.startPan.x + dx, y: d.startPan.y + dy })
      return
    }

    if (d.type === 'table') {
      const pxPerFt = project?.room.pixelsPerFoot ?? 20
      const dx = (e.clientX - d.startMouse.x) / zoomRef.current / pxPerFt
      const dy = (e.clientY - d.startMouse.y) / zoomRef.current / pxPerFt
      setDrag({ ...d, currentPosFt: { x: d.startPosFt.x + dx, y: d.startPosFt.y + dy } })
      return
    }

    if (d.type === 'rotate') {
      const dx = e.clientX - d.tableCenterScreen.x
      const dy = e.clientY - d.tableCenterScreen.y
      let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90
      if (e.shiftKey) angle = Math.round(angle / 15) * 15
      setDrag({ ...d, currentRotation: angle })
    }
  }

  const handleMouseUp = async () => {
    const d = dragRef.current
    if (d.type === 'table') {
      await updateTable(d.tableId, { x: d.currentPosFt.x, y: d.currentPosFt.y })
    }
    if (d.type === 'rotate') {
      await updateTable(d.tableId, { rotation: d.currentRotation })
    }
    setDrag({ type: 'none' })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!project) return null

  const { pixelsPerFoot } = project.room
  const isPanning = drag.type === 'pan'
  const effectivePxPerFt = pixelsPerFoot * zoom

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100">
      <svg
        ref={svgRef}
        className="h-full w-full"
        style={{ cursor: isPanning ? 'grabbing' : 'default' }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Background: catches pan drag on empty space */}
        <rect
          x={0} y={0} width="100%" height="100%"
          fill="transparent"
          style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
          onMouseDown={handleBgMouseDown}
        />

        {/* Pan + zoom group — all canvas content lives here */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          <RoomBoundary room={project.room} />

          {project.tables.map((table) => (
            <TableShape
              key={table.id}
              table={table}
              pixelsPerFoot={pixelsPerFoot}
              zoom={zoom}
              isSelected={selectedTableId === table.id}
              selectedSeatId={selectedSeatId}
              guestNameMap={guestNameMap}
              overridePos={
                drag.type === 'table' && drag.tableId === table.id
                  ? drag.currentPosFt
                  : undefined
              }
              overrideRotation={
                drag.type === 'rotate' && drag.tableId === table.id
                  ? drag.currentRotation
                  : undefined
              }
              onMouseDown={handleTableMouseDown}
              onRotateHandleMouseDown={handleRotateHandleMouseDown}
              onSeatClick={handleSeatClick}
              onTableClick={handleTableClick}
            />
          ))}
        </g>
      </svg>

      <ScaleBar pixelsPerFoot={effectivePxPerFt} />
    </div>
  )

  function handleTableClick(tableId: string) {
    setSelectedTable(tableId)
  }

  function handleSeatClick(seatId: string) {
    setSelectedSeat(seatId)
  }
}

// ── Scale bar ───────────────────────────────────────────────────────────────────

function ScaleBar({ pixelsPerFoot }: { pixelsPerFoot: number }) {
  const feetToShow = pixelsPerFoot < 15 ? 10 : 5
  const barWidth = Math.round(feetToShow * pixelsPerFoot)
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col items-start gap-1">
      <div className="flex items-end">
        <div className="w-px bg-slate-400" style={{ height: 8 }} />
        <div className="h-1.5 bg-slate-400" style={{ width: barWidth }} />
        <div className="w-px bg-slate-400" style={{ height: 8 }} />
      </div>
      <span className="text-xs text-slate-500">{feetToShow} ft</span>
    </div>
  )
}
