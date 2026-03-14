import { useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { TABLE_PRESETS, type TablePreset, type Table, type Seat } from '../../types'
import Modal from '../ui/Modal'

const PRESET_GROUPS = [
  { label: 'Round',       presets: TABLE_PRESETS.filter((p) => p.type === 'round') },
  { label: 'Rectangular', presets: TABLE_PRESETS.filter((p) => p.type === 'rectangular') },
  { label: 'Square',      presets: TABLE_PRESETS.filter((p) => p.type === 'square') },
]

interface EditTableModalProps {
  table: Table
  onClose: () => void
}

export default function EditTableModal({ table, onClose }: EditTableModalProps) {
  const replaceTable = useProjectStore((s) => s.replaceTable)
  const project = useProjectStore((s) => s.project)

  const [view, setView] = useState<'configure' | 'conflict'>('configure')
  const [draftLabel, setDraftLabel] = useState(table.label)
  const [draftPreset, setDraftPreset] = useState<TablePreset>(
    TABLE_PRESETS.find((p) => p.type === table.type && p.sizeFt === table.sizeFt) ?? TABLE_PRESETS[0]
  )
  const [draftCount, setDraftCount] = useState(table.seats.length)
  const [draftRotation, setDraftRotation] = useState(table.rotation)
  const [seatsToUnassign, setSeatsToUnassign] = useState<Set<string>>(new Set())
  const [requiredUnassignCount, setRequiredUnassignCount] = useState(0)

  const guestMap = Object.fromEntries((project?.guests ?? []).map((g) => [g.id, g]))

  function handleSaveClick() {
    const totalOccupied = table.seats.filter((s) => s.guestId !== null).length
    if (totalOccupied > draftCount) {
      // More guests than new seat count — conflict resolution required first
      setRequiredUnassignCount(totalOccupied - draftCount)
      setSeatsToUnassign(new Set())
      setView('conflict')
    } else {
      // Enough room for all guests — auto-consolidate with no UI
      applyChanges([])
    }
  }

  function handleToggleSeat(seatId: string, checked: boolean) {
    const next = new Set(seatsToUnassign)
    if (checked) {
      next.add(seatId)
    } else {
      next.delete(seatId)
    }
    setSeatsToUnassign(next)
  }

  async function applyChanges(seatIdsToUnassign: string[]) {
    const clearSet = new Set(seatIdsToUnassign)
    const guestUpdates: { guestId: string; seatId: string | null }[] = []

    // Step 1: Collect guests from seats being removed (index >= draftCount),
    // excluding any explicitly unassigned via clearSet.
    const displacedGuestIds: string[] = []
    for (let i = draftCount; i < table.seats.length; i++) {
      const seat = table.seats[i]
      if (seat.guestId) {
        if (clearSet.has(seat.id)) {
          // Explicitly unassigned — mark for removal, do NOT relocate
          guestUpdates.push({ guestId: seat.guestId, seatId: null })
        } else {
          // Displaced but not explicitly unassigned — queue for relocation
          displacedGuestIds.push(seat.guestId)
        }
      }
    }

    // Step 2: Build the new seats array for indices 0..draftCount-1.
    // Fill empty slots (including explicitly cleared seats) with displaced guests.
    const newSeats: Seat[] = []
    let displacedIdx = 0

    for (let i = 0; i < draftCount; i++) {
      const oldSeat = table.seats[i]

      if (oldSeat) {
        if (clearSet.has(oldSeat.id)) {
          // Explicitly cleared — unassign current guest, try to fill with displaced
          if (oldSeat.guestId) guestUpdates.push({ guestId: oldSeat.guestId, seatId: null })
          if (displacedIdx < displacedGuestIds.length) {
            const guestId = displacedGuestIds[displacedIdx++]
            guestUpdates.push({ guestId, seatId: oldSeat.id })
            newSeats.push({ ...oldSeat, guestId })
          } else {
            newSeats.push({ ...oldSeat, guestId: null })
          }
        } else if (oldSeat.guestId === null && displacedIdx < displacedGuestIds.length) {
          // Empty kept-seat — fill with a displaced guest
          const guestId = displacedGuestIds[displacedIdx++]
          guestUpdates.push({ guestId, seatId: oldSeat.id })
          newSeats.push({ ...oldSeat, guestId })
        } else {
          // Occupied kept-seat — preserve as-is
          newSeats.push(oldSeat)
        }
      } else {
        // Brand-new seat (table is growing)
        const newId = crypto.randomUUID()
        if (displacedIdx < displacedGuestIds.length) {
          const guestId = displacedGuestIds[displacedIdx++]
          guestUpdates.push({ guestId, seatId: newId })
          newSeats.push({ id: newId, tableId: table.id, index: i, guestId })
        } else {
          newSeats.push({ id: newId, tableId: table.id, index: i, guestId: null })
        }
      }
    }

    // Step 3: Any displaced guests that couldn't be relocated (shouldn't happen
    // after valid conflict resolution, but guard anyway)
    while (displacedIdx < displacedGuestIds.length) {
      guestUpdates.push({ guestId: displacedGuestIds[displacedIdx++], seatId: null })
    }

    const tableChanges: Partial<Table> = {
      label: draftLabel.trim() || table.label,
      type: draftPreset.type,
      sizeFt: draftPreset.sizeFt,
      widthFt: draftPreset.widthFt,
      rotation: ((draftRotation % 360) + 360) % 360,
      seats: newSeats,
    }

    await replaceTable(table.id, tableChanges, guestUpdates)
    onClose()
  }

  // ── Configure view ──────────────────────────────────────────────────────────

  if (view === 'configure') {
    return (
      <Modal title="Edit Table" onClose={onClose}>
        <div className="space-y-4">
          {/* Label */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Label
            </label>
            <input
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
                      const isSelected = preset.type === draftPreset.type && preset.sizeFt === draftPreset.sizeFt
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
                          <div className="text-[10px] text-slate-400">{preset.minSeats}–{preset.maxSeats} seats</div>
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

            {/* Seat count guidance */}
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

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveClick}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Save Changes
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  // ── Conflict Resolution view ─────────────────────────────────────────────────

  const occupiedSeats = table.seats.filter((s) => s.guestId !== null)
  const isValid = seatsToUnassign.size >= requiredUnassignCount

  return (
    <Modal title="Resolve Conflicts" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">{requiredUnassignCount}</span> guest{requiredUnassignCount !== 1 ? 's' : ''} must be unassigned to apply these changes.
        </p>

        <div className="space-y-1 rounded-lg border border-slate-200 p-2">
          {occupiedSeats.map((seat) => {
            const guest = seat.guestId ? guestMap[seat.guestId] : undefined
            const checked = seatsToUnassign.has(seat.id)
            return (
              <label key={seat.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => handleToggleSeat(seat.id, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span className="text-xs text-slate-500">Seat {seat.index + 1}</span>
                <span className="flex-1 truncate text-sm text-slate-800">{guest?.name ?? ''}</span>
              </label>
            )
          })}
        </div>

        {!isValid && (
          <p className="text-xs text-amber-600">
            Select at least {requiredUnassignCount} seat{requiredUnassignCount !== 1 ? 's' : ''} to unassign.
          </p>
        )}

        <div className="flex justify-between gap-2 pt-1">
          <button
            onClick={() => setView('configure')}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Back
          </button>
          <button
            onClick={() => applyChanges(Array.from(seatsToUnassign))}
            disabled={!isValid}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </Modal>
  )
}
