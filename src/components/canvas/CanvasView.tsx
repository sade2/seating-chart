import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { getSeatPositions } from '../../lib/tableGeometry'
import type { Table } from '../../types'
import RoomBoundary from './RoomBoundary'
import TableShape from './TableShape'
import { getTableWarnings } from '../../lib/warnings'
import type { ContextMenuInfo } from './CanvasContextMenu'

export interface CanvasViewHandle {
  panToSeat: (seatId: string) => void
}

interface CanvasViewProps {
  onContextMenu?: (info: ContextMenuInfo) => void
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

type Point = { x: number; y: number }

type DragState =
  | { type: 'none' }
  | { type: 'pan'; startMouse: Point; startPan: Point }
  | { type: 'table'; tableId: string; startMouse: Point; startPosFt: Point; currentPosFt: Point }

const CanvasView = forwardRef<CanvasViewHandle, CanvasViewProps>(function CanvasView({ onContextMenu: onContextMenuProp }, ref) {
  const project = useProjectStore((s) => s.project)
  const selectedTableId = useProjectStore((s) => s.selectedTableId)
  const selectedSeatId = useProjectStore((s) => s.selectedSeatId)
  const pendingGuestId = useProjectStore((s) => s.pendingGuestId)
  const updateTable = useProjectStore((s) => s.updateTable)
  const setSelectedTable = useProjectStore((s) => s.setSelectedTable)
  const setSelectedSeat = useProjectStore((s) => s.setSelectedSeat)
  const setPendingGuest = useProjectStore((s) => s.setPendingGuest)
  const assignSeat = useProjectStore((s) => s.assignSeat)

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

  // Imperative handle for external callers (e.g. pan to a seat from GuestListPanel)
  useImperativeHandle(ref, () => ({
    panToSeat(seatId: string) {
      const proj = useProjectStore.getState().project
      if (!proj) return
      let foundTable: Table | null = null
      let seatIndex = -1
      for (const t of proj.tables) {
        const idx = t.seats.findIndex((s) => s.id === seatId)
        if (idx !== -1) { foundTable = t; seatIndex = idx; break }
      }
      if (!foundTable || seatIndex === -1) return
      const pxPerFt = proj.room.pixelsPerFoot
      const seatPositions = getSeatPositions(foundTable, pxPerFt)
      const seatPos = seatPositions[seatIndex]
      if (!seatPos) return
      const rad = (foundTable.rotation * Math.PI) / 180
      const worldX = foundTable.x * pxPerFt + seatPos.x * Math.cos(rad) - seatPos.y * Math.sin(rad)
      const worldY = foundTable.y * pxPerFt + seatPos.x * Math.sin(rad) + seatPos.y * Math.cos(rad)
      const svg = svgRef.current
      if (!svg) return
      const { width, height } = svg.getBoundingClientRect()
      const currentZoom = zoomRef.current
      setPan({
        x: width / 2 - worldX * currentZoom,
        y: height / 2 - worldY * currentZoom,
      })
    },
  }), [])

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

  // Keep a stable ref to the onContextMenu prop so the native listener closure never goes stale
  const onContextMenuPropRef = useRef(onContextMenuProp)
  useEffect(() => { onContextMenuPropRef.current = onContextMenuProp }, [onContextMenuProp])

  // Single native contextmenu listener on the SVG — more reliable than React
  // synthetic onContextMenu on SVG children, which browsers don't bubble consistently.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (e: MouseEvent) => {
      e.preventDefault()
      const store = useProjectStore.getState()
      store.setPendingGuest(null)
      store.setSelectedTable(null)
      store.setSelectedSeat(null)

      if (!onContextMenuPropRef.current) return

      const proj = store.project
      if (!proj) return

      // Convert screen coords to canvas world coords (feet)
      const rect = svg.getBoundingClientRect()
      const worldX = (e.clientX - rect.left - panRef.current.x) / (zoomRef.current * proj.room.pixelsPerFoot)
      const worldY = (e.clientY - rect.top - panRef.current.y) / (zoomRef.current * proj.room.pixelsPerFoot)

      // Walk up from event target to find a seat or table via data attributes
      const el = e.target as Element
      const seatEl = el.closest('[data-seat-id]')
      const tableEl = el.closest('[data-table-id]')

      let target: ContextMenuInfo['target']
      if (seatEl) {
        target = { type: 'seat', seatId: seatEl.getAttribute('data-seat-id')! }
      } else if (tableEl) {
        target = { type: 'table', tableId: tableEl.getAttribute('data-table-id')! }
      } else {
        target = { type: 'canvas' }
      }

      onContextMenuPropRef.current({ screenX: e.clientX, screenY: e.clientY, worldX, worldY, target })
    }
    svg.addEventListener('contextmenu', handler)
    return () => svg.removeEventListener('contextmenu', handler)
  }, []) // empty deps — uses refs for all dynamic values

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
    setPendingGuest(null)
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

  }

  const handleMouseUp = async () => {
    const d = dragRef.current
    if (d.type === 'table') {
      await updateTable(d.tableId, { x: d.currentPosFt.x, y: d.currentPosFt.y })
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

          {project.tables.map((table) => {
            const warnings = getTableWarnings(table, project.room)
            return (
              <TableShape
                key={table.id}
                table={table}
                pixelsPerFoot={pixelsPerFoot}
                zoom={zoom}
                isSelected={selectedTableId === table.id}
                selectedSeatId={selectedSeatId}
                pendingGuestId={pendingGuestId}
                guestNameMap={guestNameMap}
                warnings={warnings}
                overridePos={
                  drag.type === 'table' && drag.tableId === table.id
                    ? drag.currentPosFt
                    : undefined
                }
                onMouseDown={handleTableMouseDown}
                onSeatClick={handleSeatClick}
                onTableClick={handleTableClick}
              />
            )
          })}
        </g>
      </svg>

      <ScaleBar pixelsPerFoot={effectivePxPerFt} />

      {/* Zoom controls — bottom right */}
      <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2">
        <span className="pointer-events-none text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
        <button
          onClick={handleResetZoom}
          title="Reset zoom to fit"
          className="pointer-events-auto rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-700"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
          </svg>
        </button>
      </div>
    </div>
  )

  function handleResetZoom() {
    const svg = svgRef.current
    if (!svg || !project) return
    const { width, height } = svg.getBoundingClientRect()
    const { widthFt, heightFt, pixelsPerFoot } = project.room
    const roomW = widthFt * pixelsPerFoot
    const roomH = heightFt * pixelsPerFoot
    const fitZoom = Math.min(1, (width * 0.85) / roomW, (height * 0.85) / roomH)
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom))
    const newPan = {
      x: (width - roomW * newZoom) / 2,
      y: (height - roomH * newZoom) / 2,
    }
    setZoom(newZoom)
    setPan(newPan)
  }

  function handleTableClick(tableId: string) {
    if (pendingGuestId) return
    setSelectedTable(tableId)
  }

  function handleSeatClick(seatId: string) {
    if (pendingGuestId) {
      // Find the seat — only assign if empty
      for (const t of project!.tables) {
        const seat = t.seats.find((s) => s.id === seatId)
        if (seat && seat.guestId === null) {
          assignSeat(seatId, pendingGuestId)
        }
        // occupied seats do nothing in assignment mode
        if (seat) break
      }
      return
    }
    if (selectedSeatId === seatId) {
      setSelectedSeat(null)
    } else {
      setSelectedSeat(seatId)
    }
  }
})

export default CanvasView

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
