import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import { useProjectStore } from '../store/projectStore'
import { TABLE_PRESETS, type TablePreset } from '../types'
import type { Seat, Table } from '../types'
import CanvasView from '../components/canvas/CanvasView'
import GuestListPanel from '../components/panels/GuestListPanel'
import InspectorPanel from '../components/panels/InspectorPanel'
import Modal from '../components/ui/Modal'
import { exportToPNG, exportToPDF } from '../lib/export'

// ── Seat Count Modal ──────────────────────────────────────────────────────────

interface SeatCountModalProps {
  preset: TablePreset
  onClose: () => void
  onConfirm: (seatCount: number) => void
}

function SeatCountModal({ preset, onClose, onConfirm }: SeatCountModalProps) {
  const [count, setCount] = useState(preset.recommendedSeats)

  const adjust = (delta: number) =>
    setCount((c) => Math.max(preset.minSeats, Math.min(preset.maxSeats, c + delta)))

  return (
    <Modal title={`${preset.label} — Seats?`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Recommended:{' '}
          <span className="font-medium text-slate-700">{preset.recommendedSeats}</span>
          &nbsp;· Range: {preset.minSeats}–{preset.maxSeats}
        </p>

        <div className="flex items-center justify-center gap-5">
          <button
            onClick={() => adjust(-1)}
            disabled={count <= preset.minSeats}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-xl font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-30"
          >
            −
          </button>
          <span className="w-8 text-center text-3xl font-semibold tabular-nums text-slate-800">
            {count}
          </span>
          <button
            onClick={() => adjust(1)}
            disabled={count >= preset.maxSeats}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-xl font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-30"
          >
            +
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(count)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add Table
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Insert Menu ───────────────────────────────────────────────────────────────

const PRESET_GROUPS = [
  { label: 'Round',        presets: TABLE_PRESETS.filter((p) => p.type === 'round') },
  { label: 'Rectangular',  presets: TABLE_PRESETS.filter((p) => p.type === 'rectangular') },
  { label: 'Square',       presets: TABLE_PRESETS.filter((p) => p.type === 'square') },
]

function InsertMenu({ onSelectPreset }: { onSelectPreset: (p: TablePreset) => void }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M7 1v12M1 7h12" />
        </svg>
        Insert
        <svg className="h-3 w-3 text-slate-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-9 z-20 w-56 rounded-xl border border-slate-200 bg-white py-2 shadow-lg">
          {PRESET_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group.label}
              </p>
              {group.presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => { setOpen(false); onSelectPreset(preset) }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span>{preset.label}</span>
                  <span className="text-xs text-slate-400">
                    {preset.minSeats}–{preset.maxSeats} seats
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Export Menu ───────────────────────────────────────────────────────────────

interface ExportMenuProps {
  onExport: (format: 'png' | 'pdf') => void
}

function ExportMenu({ onExport }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 1v8M4 6l3 3 3-3" />
          <path d="M1 10v1.5A1.5 1.5 0 002.5 13h9a1.5 1.5 0 001.5-1.5V10" />
        </svg>
        Export
        <svg className="h-3 w-3 text-slate-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
          <button
            onClick={() => { setOpen(false); onExport('png') }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="1" width="14" height="14" rx="2"/>
              <path d="M1 11l3-3 2 2 4-4 5 5" />
            </svg>
            Export as PNG
          </button>
          <button
            onClick={() => { setOpen(false); onExport('pdf') }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 1h7l3 3v11H3V1z" />
              <path d="M10 1v3h3" />
              <path d="M5 9h6M5 12h4" />
            </svg>
            Export as PDF
          </button>
        </div>
      )}
    </div>
  )
}

// ── Project Page ──────────────────────────────────────────────────────────────

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const project = useProjectStore((s) => s.project)
  const setProject = useProjectStore((s) => s.setProject)
  const addTable = useProjectStore((s) => s.addTable)
  const pendingGuestId = useProjectStore((s) => s.pendingGuestId)
  const setPendingGuest = useProjectStore((s) => s.setPendingGuest)

  const [notFound, setNotFound] = useState(false)
  const [pendingPreset, setPendingPreset] = useState<TablePreset | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportToast, setExportToast] = useState<string | null>(null)

  // Escape key cancels assignment mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingGuest(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setPendingGuest])

  // Load project from Dexie into the global store
  useEffect(() => {
    if (!id) return
    db.projects.get(id).then((p) => {
      if (p) setProject(p)
      else setNotFound(true)
    })
  }, [id, setProject])

  const handleConfirmSeatCount = async (preset: TablePreset, seatCount: number) => {
    if (!project) return
    setPendingPreset(null)

    // Place new table at room center
    const tableId = crypto.randomUUID()
    const seats: Seat[] = Array.from({ length: seatCount }, (_, i) => ({
      id: crypto.randomUUID(),
      tableId,
      index: i,
      guestId: null,
    }))

    const table: Table = {
      id: tableId,
      label: `Table ${project.tables.length + 1}`,
      type: preset.type,
      sizeFt: preset.sizeFt,
      widthFt: preset.widthFt,
      x: project.room.widthFt / 2,
      y: project.room.heightFt / 2,
      rotation: 0,
      seats,
    }

    await addTable(table)
  }

  const handleExport = async (format: 'png' | 'pdf') => {
    if (!project) return
    if (project.tables.length === 0) {
      setExportToast('Nothing to export yet')
      setTimeout(() => setExportToast(null), 3500)
      return
    }
    setExportLoading(true)
    try {
      if (format === 'png') await exportToPNG(project)
      else await exportToPDF(project)
    } catch (err) {
      console.error('Export failed', err)
      setExportToast('Export failed — please try again')
      setTimeout(() => setExportToast(null), 3500)
    } finally {
      setExportLoading(false)
    }
  }

  if (notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
        <p className="text-lg font-medium">Project not found</p>
        <button onClick={() => navigate('/')} className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">
          Back to projects
        </button>
      </div>
    )
  }

  if (!project) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Back"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
          <h1 className="text-sm font-semibold text-slate-800">{project.name}</h1>
        </div>

        <div className="flex items-center gap-3">
          <InsertMenu onSelectPreset={setPendingPreset} />
          <ExportMenu onExport={handleExport} />
          <span className="text-xs text-slate-400">
            {project.room.widthFt} × {project.room.heightFt} ft
          </span>
        </div>
      </header>

      {/* Assignment mode banner */}
      {pendingGuestId && (() => {
        const guest = project.guests.find((g) => g.id === pendingGuestId)
        return guest ? (
          <div className="flex flex-shrink-0 items-center justify-between bg-amber-50 border-b border-amber-200 px-5 py-2">
            <p className="text-sm text-amber-800">
              Assigning <span className="font-semibold">{guest.name}</span> — click an empty seat, or press Escape to cancel
            </p>
            <button
              onClick={() => setPendingGuest(null)}
              className="rounded p-1 text-amber-600 hover:bg-amber-100"
              aria-label="Cancel assignment"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          </div>
        ) : null
      })()}

      {/* 3-column layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left — Guest list */}
        <GuestListPanel />

        {/* Center — Canvas */}
        <main className="min-w-0 flex-1">
          <CanvasView />
        </main>

        {/* Right — Inspector */}
        <InspectorPanel />
      </div>

      {/* Seat count modal */}
      {pendingPreset && (
        <SeatCountModal
          preset={pendingPreset}
          onClose={() => setPendingPreset(null)}
          onConfirm={(count) => handleConfirmSeatCount(pendingPreset, count)}
        />
      )}

      {/* Export loading overlay */}
      {exportLoading && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl bg-white px-5 py-3 shadow-lg border border-slate-200">
            <svg className="h-4 w-4 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            <span className="text-sm font-medium text-slate-700">Preparing export…</span>
          </div>
        </div>
      )}

      {/* Export toast */}
      {exportToast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm text-white shadow-lg">
          {exportToast}
        </div>
      )}
    </div>
  )
}
