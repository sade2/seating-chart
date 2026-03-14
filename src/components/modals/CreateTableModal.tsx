import { useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { TABLE_PRESETS, type TablePreset, type Seat } from '../../types'
import Modal from '../ui/Modal'

const PRESET_GROUPS = [
  { label: 'Round',       presets: TABLE_PRESETS.filter((p) => p.type === 'round') },
  { label: 'Rectangular', presets: TABLE_PRESETS.filter((p) => p.type === 'rectangular') },
  { label: 'Square',      presets: TABLE_PRESETS.filter((p) => p.type === 'square') },
]

export interface CreateTableModalProps {
  onClose: () => void
  /** World-space position in feet. Defaults to room center if omitted. */
  position?: { x: number; y: number }
}

export default function CreateTableModal({ onClose, position }: CreateTableModalProps) {
  const project = useProjectStore((s) => s.project)
  const addTable = useProjectStore((s) => s.addTable)

  const defaultPreset = TABLE_PRESETS[0]
  const nextLabel = project ? `Table ${project.tables.length + 1}` : 'Table 1'

  const [draftLabel, setDraftLabel] = useState(nextLabel)
  const [draftPreset, setDraftPreset] = useState<TablePreset>(defaultPreset)
  const [draftCount, setDraftCount] = useState(defaultPreset.recommendedSeats)
  const [draftRotation, setDraftRotation] = useState(0)

  if (!project) return null

  const tablePosition = position ?? {
    x: project.room.widthFt / 2,
    y: project.room.heightFt / 2,
  }

  const handleCreate = async () => {
    const tableId = crypto.randomUUID()
    const seats: Seat[] = Array.from({ length: draftCount }, (_, i) => ({
      id: crypto.randomUUID(),
      tableId,
      index: i,
      guestId: null,
    }))

    await addTable({
      id: tableId,
      label: draftLabel.trim() || nextLabel,
      type: draftPreset.type,
      sizeFt: draftPreset.sizeFt,
      widthFt: draftPreset.widthFt,
      x: tablePosition.x,
      y: tablePosition.y,
      rotation: ((draftRotation % 360) + 360) % 360,
      seats,
    })
    onClose()
  }

  return (
    <Modal title="Create Table" onClose={onClose}>
      <div className="space-y-4">

        {/* Label */}
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Label
          </label>
          <input
            autoFocus
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Preset grid */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Table Type & Size
          </label>
          <div className="space-y-2">
            {PRESET_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {group.label}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.presets.map((preset) => {
                    const isSelected =
                      preset.type === draftPreset.type && preset.sizeFt === draftPreset.sizeFt
                    return (
                      <button
                        key={preset.label}
                        onClick={() => {
                          setDraftPreset(preset)
                          setDraftCount(preset.recommendedSeats)
                        }}
                        className={`rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                          isSelected
                            ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="font-medium">{preset.label}</div>
                        <div className="text-[10px] text-slate-400">
                          {preset.minSeats}–{preset.maxSeats} seats
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Seat count adjuster */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Seat Count
          </label>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setDraftCount((c) => Math.max(1, c - 1))}
              disabled={draftCount <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-lg font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-30"
            >
              −
            </button>
            <span className="w-8 text-center text-2xl font-semibold tabular-nums text-slate-800">
              {draftCount}
            </span>
            <button
              onClick={() => setDraftCount((c) => c + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-lg font-medium text-slate-600 hover:bg-slate-50"
            >
              +
            </button>
          </div>
          <div className="mt-1.5 space-y-0.5">
            <p className="text-xs text-slate-400">
              Recommended: {draftPreset.minSeats}–{draftPreset.maxSeats} seats
            </p>
            {draftCount > draftPreset.maxSeats && (
              <p className="text-xs text-amber-600">
                ⚠ Exceeds recommended maximum of {draftPreset.maxSeats} for this table size
              </p>
            )}
            {draftCount < draftPreset.minSeats && (
              <p className="text-xs text-amber-600">
                ⚠ Below recommended minimum of {draftPreset.minSeats} for this table size
              </p>
            )}
          </div>
        </div>

        {/* Rotation */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Rotation (°)
          </label>
          <input
            type="number"
            min={0}
            max={359}
            step={1}
            value={draftRotation}
            onChange={(e) => setDraftRotation(Number(e.target.value))}
            className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* ── Guest assignment placeholder ────────────────────────────────────────
            Future: add per-seat guest assignment UI here. The tableId and seats
            array are fully constructed in handleCreate and can be threaded into
            an assignment step before calling addTable.
        ─────────────────────────────────────────────────────────────────────── */}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create Table
          </button>
        </div>

      </div>
    </Modal>
  )
}
