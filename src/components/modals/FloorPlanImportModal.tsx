import { useCallback, useEffect, useRef, useState } from 'react'
import Modal from '../ui/Modal'
import { traceImage } from '../../lib/imageTracing'
import { useProjectStore } from '../../store/projectStore'
import type { TracedFloorPlan } from '../../types'

type Step = 'upload' | 'preview' | 'calibrate' | 'confirm'

interface CalPoint { x: number; y: number }  // image-space pixels

interface FloorPlanImportModalProps {
  onClose: () => void
}

// ── Zoomable calibration SVG ───────────────────────────────────────────────

interface CalibrateSVGProps {
  paths: { d: string }[]
  viewBox: { width: number; height: number }
  svgTransform: string
  calPoints: CalPoint[]
  onAddPoint: (pt: CalPoint) => void
  zoom: number
  viewCenter: { x: number; y: number }
  onZoomChange: (zoom: number, cx: number, cy: number) => void
  onPanDelta: (imgDx: number, imgDy: number) => void
}

function CalibrateSVG({
  paths, viewBox, svgTransform, calPoints,
  onAddPoint, zoom, viewCenter, onZoomChange, onPanDelta,
}: CalibrateSVGProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  // Use a ref for pan state to avoid stale closures in mousemove
  const panRef = useRef<{
    startClientX: number
    startClientY: number
    prevClientX: number
    prevClientY: number
    isDragging: boolean
  } | null>(null)
  const [isPanning, setIsPanning] = useState(false)

  const { width: W, height: H } = viewBox
  const visW = W / zoom
  const visH = H / zoom
  const vbX = viewCenter.x - visW / 2
  const vbY = viewCenter.y - visH / 2
  const dynamicViewBox = `${vbX} ${vbY} ${visW} ${visH}`

  // Marker size: ~8 image-pixels per "screen pixel" at zoom=1,
  // scaled so it stays proportional to the visible area.
  const markerR = visW / 60

  function getSvgPoint(e: React.MouseEvent | MouseEvent): { x: number; y: number } | null {
    const svg = svgRef.current
    if (!svg) return null
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = (e as MouseEvent).clientX
    pt.y = (e as MouseEvent).clientY
    const r = pt.matrixTransform(ctm.inverse())
    return { x: r.x, y: r.y }
  }

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault()
    const cursor = getSvgPoint(e)
    if (!cursor) return

    const factor = e.deltaY < 0 ? 1.25 : 0.8
    const newZoom = Math.max(1, Math.min(20, zoom * factor))
    // Keep cursor at same image position: newCx = cursor + (center - cursor) * oldZoom/newZoom
    const newCx = cursor.x + (viewCenter.x - cursor.x) * (zoom / newZoom)
    const newCy = cursor.y + (viewCenter.y - cursor.y) * (zoom / newZoom)

    // Clamp so we don't pan outside the image
    const newVisW = W / newZoom
    const newVisH = H / newZoom
    onZoomChange(
      newZoom,
      Math.max(newVisW / 2, Math.min(W - newVisW / 2, newCx)),
      Math.max(newVisH / 2, Math.min(H - newVisH / 2, newCy)),
    )
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button !== 0) return
    panRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      prevClientX: e.clientX,
      prevClientY: e.clientY,
      isDragging: false,
    }
    setIsPanning(false)
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const pan = panRef.current
    if (!pan) return

    const dx = e.clientX - pan.prevClientX
    const dy = e.clientY - pan.prevClientY
    pan.prevClientX = e.clientX
    pan.prevClientY = e.clientY

    const movedTotal =
      Math.abs(e.clientX - pan.startClientX) > 4 ||
      Math.abs(e.clientY - pan.startClientY) > 4

    if (!pan.isDragging && movedTotal) {
      pan.isDragging = true
      setIsPanning(true)
    }
    if (!pan.isDragging) return

    // Convert screen-pixel delta to image-pixel delta using current CTM
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!ctm) return
    // ctm.a = screenPixels per SVGUnit (image pixel), so 1/ctm.a = imagePx per screenPx
    onPanDelta(-dx / ctm.a, -dy / ctm.d)
  }

  function handleMouseUp(e: React.MouseEvent<SVGSVGElement>) {
    const pan = panRef.current
    if (pan && !pan.isDragging) {
      // genuine click — place calibration point in image-pixel space
      const pt = getSvgPoint(e)
      if (pt) onAddPoint(pt)
    }
    panRef.current = null
    setIsPanning(false)
  }

  function handleMouseLeave() {
    panRef.current = null
    setIsPanning(false)
  }

  return (
    <svg
      ref={svgRef}
      viewBox={dynamicViewBox}
      className="w-full rounded border border-slate-200 bg-white select-none"
      style={{ height: 380, display: 'block', cursor: isPanning ? 'grabbing' : 'crosshair' }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Traced paths in potrace coordinate space, wrapped with the potrace group transform */}
      <g transform={svgTransform}>
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill="#374151" stroke="none" />
        ))}
      </g>

      {/* Calibration markers — in image-pixel space (= current viewBox space) */}
      {calPoints.length === 2 && (
        <line
          x1={calPoints[0].x} y1={calPoints[0].y}
          x2={calPoints[1].x} y2={calPoints[1].y}
          stroke="#f59e0b"
          strokeWidth={markerR * 0.4}
          strokeDasharray={`${markerR * 1.5} ${markerR * 0.75}`}
        />
      )}
      {calPoints.map((pt, i) => (
        <g key={i}>
          <circle cx={pt.x} cy={pt.y} r={markerR * 1.2} fill="white" opacity={0.7} />
          <circle cx={pt.x} cy={pt.y} r={markerR} fill={i === 0 ? '#6366f1' : '#10b981'} />
          <text
            x={pt.x} y={pt.y}
            textAnchor="middle" dominantBaseline="central"
            fontSize={markerR * 1.1} fill="white" fontWeight="bold"
            style={{ pointerEvents: 'none' }}
          >
            {i === 0 ? 'A' : 'B'}
          </text>
        </g>
      ))}
    </svg>
  )
}

// ── Main modal component ───────────────────────────────────────────────────

export default function FloorPlanImportModal({ onClose }: FloorPlanImportModalProps) {
  const setFloorPlan = useProjectStore((s) => s.setFloorPlan)

  const [step, setStep] = useState<Step>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [tracing, setTracing] = useState(false)
  const [traceError, setTraceError] = useState<string | null>(null)
  const [traceResult, setTraceResult] = useState<{
    paths: { d: string }[]
    viewBox: { width: number; height: number }
    svgTransform: string
  } | null>(null)
  const [threshold, setThreshold] = useState(128)
  const [calPoints, setCalPoints] = useState<CalPoint[]>([])
  const [calDistFt, setCalDistFt] = useState('')
  const [roomWidthFt, setRoomWidthFt] = useState<number | null>(null)
  const [roomHeightFt, setRoomHeightFt] = useState<number | null>(null)

  // Calibration zoom/pan state
  const [zoom, setZoom] = useState(1)
  const [viewCenter, setViewCenter] = useState({ x: 0, y: 0 })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const raceRef = useRef(0)

  // Reset zoom/pan when entering calibrate step
  useEffect(() => {
    if (step === 'calibrate' && traceResult) {
      setZoom(1)
      setViewCenter({
        x: traceResult.viewBox.width / 2,
        y: traceResult.viewBox.height / 2,
      })
      setCalPoints([])
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const runTrace = useCallback(async (f: File, t: number) => {
    const id = ++raceRef.current
    setTracing(true)
    setTraceError(null)
    try {
      const result = await traceImage(f, t)
      if (id !== raceRef.current) return
      setTraceResult(result)
    } catch (err) {
      if (id !== raceRef.current) return
      console.error(err)
      setTraceError('Tracing failed — try a different image or threshold.')
    } finally {
      if (id === raceRef.current) setTracing(false)
    }
  }, [])

  async function handleFile(f: File | undefined) {
    if (!f) return
    setTraceError(null)
    setFile(f)
    const url = URL.createObjectURL(f)
    setPreviewUrl(url)
    setCalDistFt('')
    setRoomWidthFt(null)
    setRoomHeightFt(null)
    await runTrace(f, threshold)
    setStep('preview')
  }

  // Re-trace on threshold change (debounced)
  useEffect(() => {
    if (!file || step === 'upload') return
    const id = setTimeout(() => runTrace(file, threshold), 300)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold])

  // Cleanup object URL
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleAddCalPoint(pt: CalPoint) {
    setCalPoints((prev) => {
      if (prev.length >= 2) return [pt]
      return [...prev, pt]
    })
  }

  function handleZoomChange(newZoom: number, cx: number, cy: number) {
    setZoom(newZoom)
    setViewCenter({ x: cx, y: cy })
  }

  function handlePanDelta(imgDx: number, imgDy: number) {
    if (!traceResult) return
    const { width: W, height: H } = traceResult.viewBox
    const visW = W / zoom
    const visH = H / zoom
    setViewCenter((prev) => ({
      x: Math.max(visW / 2, Math.min(W - visW / 2, prev.x + imgDx)),
      y: Math.max(visH / 2, Math.min(H - visH / 2, prev.y + imgDy)),
    }))
  }

  function handleCalculate() {
    if (calPoints.length < 2 || !traceResult) return
    const dist = parseFloat(calDistFt)
    if (!dist || dist <= 0) return
    const dx = calPoints[1].x - calPoints[0].x
    const dy = calPoints[1].y - calPoints[0].y
    const pixelDist = Math.sqrt(dx * dx + dy * dy)
    const feetPerPixel = dist / pixelDist
    const wFt = Math.max(10, Math.round(traceResult.viewBox.width * feetPerPixel))
    const hFt = Math.max(10, Math.round(traceResult.viewBox.height * feetPerPixel))
    setRoomWidthFt(wFt)
    setRoomHeightFt(hFt)
    setStep('confirm')
  }

  function handleImport() {
    if (!traceResult || roomWidthFt === null || roomHeightFt === null) return
    const floorPlan: TracedFloorPlan = {
      paths: traceResult.paths,
      viewBox: traceResult.viewBox,
      svgTransform: traceResult.svgTransform,
      scaleFt: roomWidthFt,
      opacity: 0.7,
    }
    setFloorPlan(floorPlan, roomWidthFt, roomHeightFt)
    onClose()
  }

  // ── Steps ──────────────────────────────────────────────────────────────────

  if (step === 'upload') {
    return (
      <Modal title="Import Floor Plan" onClose={onClose}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
            dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-slate-400'
          }`}
        >
          <svg className="mx-auto mb-3 h-8 w-8 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          <p className="text-sm font-medium text-slate-600">Drop a floor plan image here or click to browse</p>
          <p className="mt-1 text-xs text-slate-400">Accepts PNG or JPEG — works best with black-and-white line drawings</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {traceError && <p className="mt-2 text-xs text-red-600">{traceError}</p>}
      </Modal>
    )
  }

  if (step === 'preview') {
    return (
      <Modal title="Adjust Tracing" onClose={onClose}>
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded border border-slate-200 bg-slate-50" style={{ height: 280 }}>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Original"
                className="h-full w-full"
                style={{ objectFit: 'contain', opacity: 0.25 }}
              />
            )}
            {tracing ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                <svg className="h-5 w-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
              </div>
            ) : traceResult && (
              <div className="absolute inset-0">
                <svg
                  viewBox={`0 0 ${traceResult.viewBox.width} ${traceResult.viewBox.height}`}
                  className="h-full w-full"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <g transform={traceResult.svgTransform}>
                    {traceResult.paths.map((p, i) => (
                      <path key={i} d={p.d} fill="#4338ca" stroke="none" opacity={0.8}/>
                    ))}
                  </g>
                </svg>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600">Threshold</label>
              <span className="text-xs text-slate-400">{threshold}</span>
            </div>
            <input
              type="range" min={0} max={255} step={1} value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full"
            />
            <p className="mt-1 text-xs text-slate-400">Lower = more detail captured; higher = only dark lines</p>
          </div>

          {traceError && <p className="text-xs text-red-600">{traceError}</p>}

          <div className="flex justify-between">
            <button onClick={() => { setStep('upload'); setTraceResult(null) }} className="text-xs text-slate-500 underline hover:text-slate-700">
              Choose Different File
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={() => setStep('calibrate')}
                disabled={!traceResult || tracing}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </Modal>
    )
  }

  if (step === 'calibrate') {
    const canCalculate = calPoints.length === 2 && parseFloat(calDistFt) > 0
    return (
      <Modal title="Calibrate Scale" onClose={onClose} wide>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Click two points that represent a known real-world distance.
            <span className="ml-1 text-xs text-slate-400">Scroll to zoom · drag to pan</span>
          </p>

          {traceResult && (
            <CalibrateSVG
              paths={traceResult.paths}
              viewBox={traceResult.viewBox}
              svgTransform={traceResult.svgTransform}
              calPoints={calPoints}
              onAddPoint={handleAddCalPoint}
              zoom={zoom}
              viewCenter={viewCenter}
              onZoomChange={handleZoomChange}
              onPanDelta={handlePanDelta}
            />
          )}

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`h-3 w-3 rounded-full ${calPoints.length >= 1 ? 'bg-indigo-500' : 'bg-slate-200'}`}/>
              Point A
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`h-3 w-3 rounded-full ${calPoints.length >= 2 ? 'bg-emerald-500' : 'bg-slate-200'}`}/>
              Point B
            </div>
            {zoom > 1 && (
              <button
                onClick={() => {
                  setZoom(1)
                  if (traceResult) setViewCenter({ x: traceResult.viewBox.width / 2, y: traceResult.viewBox.height / 2 })
                }}
                className="ml-auto text-xs text-slate-400 underline hover:text-slate-600"
              >
                Reset zoom ({Math.round(zoom * 10) / 10}×)
              </button>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Distance between A and B (ft)
            </label>
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={calDistFt}
              onChange={(e) => setCalDistFt(e.target.value)}
              placeholder="e.g. 20"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('preview')} className="text-xs text-slate-500 underline hover:text-slate-700">
              Back
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={handleCalculate}
                disabled={!canCalculate}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                Calculate
              </button>
            </div>
          </div>
        </div>
      </Modal>
    )
  }

  // step === 'confirm'
  return (
    <Modal title="Confirm Import" onClose={onClose}>
      <div className="space-y-4">
        {traceResult && (
          <svg
            viewBox={`0 0 ${traceResult.viewBox.width} ${traceResult.viewBox.height}`}
            className="w-full rounded border border-slate-200 bg-white"
            style={{ maxHeight: 220, display: 'block' }}
          >
            <g transform={traceResult.svgTransform}>
              {traceResult.paths.map((p, i) => (
                <path key={i} d={p.d} fill="#374151" stroke="none" />
              ))}
            </g>
          </svg>
        )}

        <div className="rounded-lg bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-700">Computed room dimensions</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {roomWidthFt} × {roomHeightFt} ft
          </p>
          <p className="mt-1 text-xs text-slate-500">
            The canvas will be resized to match. You can adjust it later in Project Settings.
          </p>
        </div>

        <div className="flex justify-between">
          <button onClick={() => setStep('calibrate')} className="text-xs text-slate-500 underline hover:text-slate-700">
            Back
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              onClick={handleImport}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Import Floor Plan
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
