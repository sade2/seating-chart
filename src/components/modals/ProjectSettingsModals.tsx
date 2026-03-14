import { useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import Modal from '../ui/Modal'
import { getTableWarnings } from '../../lib/warnings'

// ── Rename Project Modal ───────────────────────────────────────────────────────

interface RenameProjectModalProps {
  onClose: () => void
}

export function RenameProjectModal({ onClose }: RenameProjectModalProps) {
  const project = useProjectStore((s) => s.project)
  const updateProjectName = useProjectStore((s) => s.updateProjectName)
  const [name, setName] = useState(project?.name ?? '')

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    await updateProjectName(trimmed)
    onClose()
  }

  return (
    <Modal title="Rename Project" onClose={onClose}>
      <div className="space-y-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
          autoFocus
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Resize Canvas Modal ────────────────────────────────────────────────────────

interface ResizeCanvasModalProps {
  onClose: () => void
}

export function ResizeCanvasModal({ onClose }: ResizeCanvasModalProps) {
  const project = useProjectStore((s) => s.project)
  const updateRoom = useProjectStore((s) => s.updateRoom)
  const [mode, setMode] = useState<'static' | 'ratio'>('static')
  const [widthFt, setWidthFt] = useState(project?.room.widthFt ?? 40)
  const [heightFt, setHeightFt] = useState(project?.room.heightFt ?? 60)
  const [scale, setScale] = useState(1)

  if (!project) return null

  const room = project.room

  const newW = Math.max(10, mode === 'static' ? widthFt : Math.round(room.widthFt * scale))
  const newH = Math.max(10, mode === 'static' ? heightFt : Math.round(room.heightFt * scale))

  const outOfBoundsCount = project.tables.filter((table) => {
    const warnings = getTableWarnings(table, { ...room, widthFt: newW, heightFt: newH })
    return warnings.some((w) => w.includes('outside the room boundary'))
  }).length

  const handleConfirm = async () => {
    await updateRoom({ widthFt: newW, heightFt: newH })
    onClose()
  }

  return (
    <Modal title="Resize Canvas" onClose={onClose}>
      <div className="space-y-4">
        {/* Mode tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setMode('static')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'static'
                ? 'border-b-2 border-indigo-500 text-indigo-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Static
          </button>
          <button
            onClick={() => setMode('ratio')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'ratio'
                ? 'border-b-2 border-indigo-500 text-indigo-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Ratio
          </button>
        </div>

        {mode === 'static' ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Width (ft)</label>
              <input
                type="number"
                min={10}
                step={1}
                value={widthFt}
                onChange={(e) => setWidthFt(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Height (ft)</label>
              <input
                type="number"
                min={10}
                step={1}
                value={heightFt}
                onChange={(e) => setHeightFt(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Scale factor</label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              New size: {newW} × {newH} ft
            </p>
          </div>
        )}

        {outOfBoundsCount > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            ⚠ {outOfBoundsCount} table{outOfBoundsCount !== 1 ? 's' : ''} will be outside the new boundary and won't appear in exports.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Confirm
          </button>
        </div>
      </div>
    </Modal>
  )
}
