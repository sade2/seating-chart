import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import { useProjectStore, flushPersist } from '../store/projectStore'
import CanvasView, { type CanvasViewHandle } from '../components/canvas/CanvasView'
import GuestListPanel from '../components/panels/GuestListPanel'
import InspectorPanel from '../components/panels/InspectorPanel'
import { exportToPNG, exportToPDF, exportGuestsCSV, exportGuestsJSON, exportGuestsPlaintext } from '../lib/export'
import { repairProject } from '../lib/repairProject'
import { RenameProjectModal, ResizeCanvasModal } from '../components/modals/ProjectSettingsModals'
import FloorPlanImportModal from '../components/modals/FloorPlanImportModal'
import CreateTableModal from '../components/modals/CreateTableModal'
import CreateShapeModal from '../components/modals/CreateShapeModal'
import AddGuestModal from '../components/modals/AddGuestModal'
import EditTableModal from '../components/modals/EditTableModal'
import CanvasContextMenu, { type ContextMenuInfo } from '../components/canvas/CanvasContextMenu'
import ShareModal from '../components/ShareModal'

// ── Insert Menu ───────────────────────────────────────────────────────────────

interface InsertMenuProps {
  onTable: () => void
  onShape: () => void
  onText: () => void
}

function InsertMenu({ onTable, onShape, onText }: InsertMenuProps) {
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
        <div className="absolute right-0 top-9 z-20 w-36 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
          <button
            onClick={() => { setOpen(false); onTable() }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Table
          </button>
          <button
            onClick={() => { setOpen(false); onShape() }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Shape
          </button>
          <button
            onClick={() => { setOpen(false); onText() }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Text
          </button>
        </div>
      )}
    </div>
  )
}

// ── Export Menu ───────────────────────────────────────────────────────────────

interface ExportMenuProps {
  onExport: (format: 'png' | 'pdf') => void
  onExportGuests: (format: 'csv' | 'json' | 'txt') => void
}

function ExportMenu({ onExport, onExportGuests }: ExportMenuProps) {
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
        <div className="absolute right-0 top-9 z-20 w-48 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
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

          <div className="my-1.5 border-t border-slate-100" />
          <p className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Guest List
          </p>

          <button
            onClick={() => { setOpen(false); onExportGuests('csv') }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 1h7l3 3v11H3V1z" />
              <path d="M10 1v3h3" />
              <path d="M5 7h6M5 10h6M5 13h3" />
            </svg>
            Export as CSV
          </button>
          <button
            onClick={() => { setOpen(false); onExportGuests('json') }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 2C3.9 2 3 2.9 3 4v8c0 1.1.9 2 2 2" />
              <path d="M11 2c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2" />
              <path d="M7 6l-2 2 2 2M9 6l2 2-2 2" />
            </svg>
            Export as JSON
          </button>
          <button
            onClick={() => { setOpen(false); onExportGuests('txt') }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 1h10v14H3V1z" />
              <path d="M5 5h6M5 8h6M5 11h4" />
            </svg>
            Export as Plaintext
          </button>
        </div>
      )}
    </div>
  )
}

// ── Settings Menu ─────────────────────────────────────────────────────────────

function SettingsMenu({ onSelect }: { onSelect: (item: 'rename' | 'resize' | 'floorplan') => void }) {
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
        title="Project settings"
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-20 w-44 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
          <button
            onClick={() => { setOpen(false); onSelect('rename') }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Rename Project
          </button>
          <button
            onClick={() => { setOpen(false); onSelect('resize') }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Resize Canvas
          </button>
          <button
            onClick={() => { setOpen(false); onSelect('floorplan') }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Import Floor Plan
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
  const location = useLocation()

  // isOwner defaults to true when navigating directly by URL; the dashboard
  // passes { state: { isShared: true } } for projects shared with the user.
  const isOwner = !(location.state as { isShared?: boolean } | null)?.isShared

  const project = useProjectStore((s) => s.project)
  const setProject = useProjectStore((s) => s.setProject)
  const conflictDetected = useProjectStore((s) => s.conflictDetected)
  const clearConflict = useProjectStore((s) => s.clearConflict)
  const pendingGuestId = useProjectStore((s) => s.pendingGuestId)
  const setPendingGuest = useProjectStore((s) => s.setPendingGuest)
  const addText = useProjectStore((s) => s.addText)
  const setSelectedText = useProjectStore((s) => s.setSelectedText)

  const canvasRef = useRef<CanvasViewHandle>(null)

  const handlePanToSeat = useCallback((seatId: string) => {
    canvasRef.current?.panToSeat(seatId)
  }, [])

  const [notFound, setNotFound] = useState(false)
  const [createTableOpen, setCreateTableOpen] = useState(false)
  const [createTableInitPos, setCreateTableInitPos] = useState<{ x: number; y: number } | undefined>()
  const [createShapeOpen, setCreateShapeOpen] = useState(false)
  const [addGuestOpen, setAddGuestOpen] = useState(false)
  const [editTableId, setEditTableId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuInfo | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportToast, setExportToast] = useState<string | null>(null)
  const [repairMessages, setRepairMessages] = useState<string[]>([])
  const [settingsModal, setSettingsModal] = useState<null | 'rename' | 'resize' | 'floorplan'>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [reloading, setReloading] = useState(false)

  // Escape key cancels assignment mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingGuest(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setPendingGuest])

  // Load project from API into the global store
  useEffect(() => {
    if (!id) return
    api.getProject(id)
      .then((p) => {
        const { project: fixed, repairs } = repairProject(p)
        setProject(fixed)
        if (repairs.length > 0) setRepairMessages(repairs)
      })
      .catch(() => setNotFound(true))
  }, [id, setProject])

  // Flush pending debounced save when user navigates away or closes the tab
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushPersist()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      flushPersist()
    }
  }, [])

  const handleReloadAfterConflict = async () => {
    if (!id) return
    setReloading(true)
    try {
      const p = await api.getProject(id)
      const { project: fixed } = repairProject(p)
      setProject(fixed)
      clearConflict()
    } catch {
      // If reload fails, just clear the conflict flag so the user isn't stuck
      clearConflict()
    } finally {
      setReloading(false)
    }
  }

  const handleExportGuests = (format: 'csv' | 'json' | 'txt') => {
    if (!project) return
    if (format === 'csv') exportGuestsCSV(project)
    else if (format === 'json') exportGuestsJSON(project)
    else exportGuestsPlaintext(project)
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
          <SettingsMenu onSelect={setSettingsModal} />
          <h1 className="text-sm font-semibold text-slate-800">{project.name}</h1>
        </div>

        <div className="flex items-center gap-3">
          <InsertMenu
            onTable={() => { setCreateTableInitPos(undefined); setCreateTableOpen(true) }}
            onShape={() => setCreateShapeOpen(true)}
            onText={async () => {
              if (!project) return
              const id = crypto.randomUUID()
              await addText({ id, x: project.room.widthFt / 2, y: project.room.heightFt / 2, text: 'Text', fontSize: 24, rotation: 0 })
              setSelectedText(id)
            }}
          />
          <ExportMenu onExport={handleExport} onExportGuests={handleExportGuests} />
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="2.5" r="1.5" />
              <circle cx="11" cy="11.5" r="1.5" />
              <circle cx="3" cy="7" r="1.5" />
              <path d="M9.5 3.3L4.4 6.2M9.5 10.7L4.4 7.8" />
            </svg>
            Share
          </button>
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

      {/* Version conflict banner */}
      {conflictDetected && (
        <div className="flex flex-shrink-0 items-center justify-between border-b border-amber-200 bg-amber-50 px-5 py-2.5">
          <p className="text-sm text-amber-800">
            This project was modified by a collaborator. Reload to see the latest version.
          </p>
          <button
            onClick={handleReloadAfterConflict}
            disabled={reloading}
            className="ml-4 shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {reloading ? 'Reloading…' : 'Reload'}
          </button>
        </div>
      )}

      {/* Data repair banner */}
      {repairMessages.length > 0 && (
        <div className="flex flex-shrink-0 items-start justify-between border-b border-red-200 bg-red-50 px-5 py-2.5 gap-4">
          <div className="flex items-start gap-2.5">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 1L1 14h14L8 1z" />
              <path d="M8 6v4M8 11.5v.5" />
            </svg>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-red-800">Data repaired on load</p>
              {repairMessages.map((msg, i) => (
                <p key={i} className="text-xs text-red-700">{msg}</p>
              ))}
            </div>
          </div>
          <button
            onClick={() => setRepairMessages([])}
            className="flex-shrink-0 rounded p-1 text-red-400 hover:bg-red-100 hover:text-red-600"
            aria-label="Dismiss"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>
      )}

      {/* 3-column layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left — Guest list */}
        <GuestListPanel onPanToSeat={handlePanToSeat} />

        {/* Center — Canvas */}
        <main className="min-w-0 flex-1">
          <CanvasView ref={canvasRef} onContextMenu={setContextMenu} />
        </main>

        {/* Right — Inspector */}
        <InspectorPanel />
      </div>

      {/* Create table modal */}
      {createTableOpen && (
        <CreateTableModal
          onClose={() => { setCreateTableOpen(false); setCreateTableInitPos(undefined) }}
          position={createTableInitPos}
        />
      )}

      {/* Create shape modal */}
      {createShapeOpen && (
        <CreateShapeModal onClose={() => setCreateShapeOpen(false)} />
      )}

      {/* Add guest modal (triggered from context menu) */}
      {addGuestOpen && (
        <AddGuestModal
          onClose={() => setAddGuestOpen(false)}
          onAdded={() => setAddGuestOpen(false)}
        />
      )}

      {/* Edit table modal (triggered from context menu) */}
      {editTableId && (() => {
        const table = project.tables.find((t) => t.id === editTableId)
        return table ? (
          <EditTableModal table={table} onClose={() => setEditTableId(null)} />
        ) : null
      })()}

      {/* Canvas context menu */}
      {contextMenu && (
        <CanvasContextMenu
          {...contextMenu}
          onClose={() => setContextMenu(null)}
          onNewTable={(worldX, worldY) => {
            setContextMenu(null)
            setCreateTableInitPos({ x: worldX, y: worldY })
            setCreateTableOpen(true)
          }}
          onNewGuest={() => {
            setContextMenu(null)
            setAddGuestOpen(true)
          }}
          onEditTable={(tableId) => {
            setContextMenu(null)
            setEditTableId(tableId)
          }}
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

      {/* Settings modals */}
      {settingsModal === 'rename' && (
        <RenameProjectModal onClose={() => setSettingsModal(null)} />
      )}
      {settingsModal === 'resize' && (
        <ResizeCanvasModal onClose={() => setSettingsModal(null)} />
      )}
      {settingsModal === 'floorplan' && (
        <FloorPlanImportModal onClose={() => setSettingsModal(null)} />
      )}

      {/* Share modal */}
      {shareOpen && id && (
        <ShareModal
          projectId={id}
          isOwner={isOwner}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}
