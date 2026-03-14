import { useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import type { Guest, Table, Seat } from '../../types'
import Modal from '../ui/Modal'
import { getTableWarnings } from '../../lib/warnings'
import EditTableModal from '../modals/EditTableModal'

// ── Shared UI primitives ───────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-slate-100 px-4 py-4 last:border-b-0">{children}</div>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{children}</p>
}

function ReadOnlyField({ value }: { value: string }) {
  return (
    <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{value}</p>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyInspector({ room }: { room: { widthFt: number; heightFt: number } }) {
  return (
    <>
      <Section>
        <SectionLabel>Room</SectionLabel>
        <ReadOnlyField value={`${room.widthFt} × ${room.heightFt} ft`} />
      </Section>
      <div className="flex flex-1 items-center justify-center px-4 text-center">
        <p className="text-xs leading-relaxed text-slate-300">
          Click a table or seat<br />to inspect it
        </p>
      </div>
    </>
  )
}

// ── Table inspector ────────────────────────────────────────────────────────────

function TableInspector({ table, warnings = [] }: { table: Table; warnings?: string[] }) {
  const project = useProjectStore((s) => s.project)
  const updateTable = useProjectStore((s) => s.updateTable)
  const deleteTable = useProjectStore((s) => s.deleteTable)
  const unassignSeat = useProjectStore((s) => s.unassignSeat)
  const rotateSeats = useProjectStore((s) => s.rotateSeats)
  const unassignAllSeats = useProjectStore((s) => s.unassignAllSeats)
  const setSelectedTable = useProjectStore((s) => s.setSelectedTable)
  const setSelectedSeat = useProjectStore((s) => s.setSelectedSeat)

  const [label, setLabel] = useState(table.label)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmUnassignAll, setConfirmUnassignAll] = useState(false)
  const [editTableOpen, setEditTableOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!project) return null

  const guestMap: Record<string, Guest> = Object.fromEntries(
    project.guests.map((g) => [g.id, g])
  )

  const sortedSeats = [...table.seats].sort((a, b) => a.index - b.index)
  const occupiedCount = table.seats.filter((s) => s.guestId !== null).length

  const handleLabelBlur = () => {
    const trimmed = label.trim()
    if (!trimmed) { setLabel(table.label); return }
    if (trimmed !== table.label) updateTable(table.id, { label: trimmed })
  }

  const handleDelete = () => {
    deleteTable(table.id)
    setSelectedTable(null)
  }

  const handleUnassignAll = () => {
    unassignAllSeats(table.id)
    setConfirmUnassignAll(false)
  }

  return (
    <>
      {/* Warning banner */}
      {warnings.length > 0 && (
        <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">⚠ {w}</p>
          ))}
        </div>
      )}

      {/* Label */}
      <Section>
        <SectionLabel>Label</SectionLabel>
        <input
          ref={inputRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleLabelBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.blur() }}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </Section>

      {/* Guests section */}
      <Section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Guests</p>
          <span className="text-[11px] text-slate-400">{occupiedCount} / {table.seats.length} seated</span>
        </div>
        <div className="max-h-44 overflow-y-auto -mx-1 px-1">
          {sortedSeats.map((seat) => {
            const guest: Guest | undefined = seat.guestId ? guestMap[seat.guestId] : undefined
            return (
              <div key={seat.id} className="flex items-center gap-2 py-1.5">
                {guest ? (
                  <>
                    <button
                      onClick={() => setSelectedSeat(seat.id)}
                      className="min-w-0 flex-1 truncate text-left text-sm text-slate-800 hover:text-indigo-600"
                    >
                      {guest.name}
                    </button>
                    <button
                      onClick={() => unassignSeat(seat.id)}
                      className="flex-shrink-0 text-xs text-slate-400 hover:text-red-600"
                    >
                      Unassign
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-slate-300">Empty</span>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      {/* Rotate guests */}
      {occupiedCount > 0 && (
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
          <span className="flex-1 text-xs text-slate-400">Rotate guests</span>
          <button
            onClick={() => rotateSeats(table.id, 'ccw')}
            title="Rotate counterclockwise"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8a4 4 0 1 1-1.17-2.83" />
              <path d="M12 2.5V6h-3.5" />
            </svg>
          </button>
          <button
            onClick={() => rotateSeats(table.id, 'cw')}
            title="Rotate clockwise"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8a4 4 0 1 0 1.17-2.83" />
              <path d="M4 2.5V6h3.5" />
            </svg>
          </button>
        </div>
      )}

      {/* Edit Table */}
      <div className="border-b border-slate-100 px-4 py-3">
        <button
          onClick={() => setEditTableOpen(true)}
          className="w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Edit Table
        </button>
      </div>

      {editTableOpen && (
        <EditTableModal
          table={table}
          onClose={() => setEditTableOpen(false)}
        />
      )}

      {/* Unassign All */}
      {occupiedCount > 0 && (
        <div className="border-b border-slate-100 px-4 py-2">
          <button
            onClick={() => setConfirmUnassignAll(true)}
            className="text-xs text-slate-400 underline hover:text-red-500"
          >
            Unassign all guests
          </button>
        </div>
      )}

      {/* Delete Table */}
      <div className="mt-auto border-t border-slate-100 px-4 py-4">
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full rounded-lg border border-red-200 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete Table
          </button>
        ) : (
          <div className="space-y-2">
            {occupiedCount > 0 && (
              <p className="text-xs text-amber-600">
                {occupiedCount} guest{occupiedCount !== 1 ? 's' : ''} will be unassigned.
              </p>
            )}
            <p className="text-xs text-slate-500">Delete "{table.label}"?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Unassign All confirmation modal */}
      {confirmUnassignAll && (
        <Modal
          title={`Unassign all guests from ${table.label}?`}
          onClose={() => setConfirmUnassignAll(false)}
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {occupiedCount} guest{occupiedCount !== 1 ? 's' : ''} will be unassigned.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmUnassignAll(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUnassignAll}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Unassign All
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Seat inspector ─────────────────────────────────────────────────────────────

function SeatInspector({ seat, tableLabel, tableId }: { seat: Seat; tableLabel: string; tableId: string }) {
  const project = useProjectStore((s) => s.project)
  const unassignSeat = useProjectStore((s) => s.unassignSeat)
  const pendingGuestId = useProjectStore((s) => s.pendingGuestId)
  const setSelectedTable = useProjectStore((s) => s.setSelectedTable)

  const guest = seat.guestId
    ? project?.guests.find((g) => g.id === seat.guestId)
    : null

  const pendingGuest = pendingGuestId
    ? project?.guests.find((g) => g.id === pendingGuestId)
    : null

  return (
    <>
      {/* Prominent "back to table" link — replaces both the old back-link and the read-only Table section */}
      <div className="border-b border-slate-100 px-4 py-3">
        <button
          onClick={() => setSelectedTable(tableId)}
          className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 2L3 6l4 4" />
          </svg>
          {tableLabel}
        </button>
      </div>

      <Section>
        <SectionLabel>Seat</SectionLabel>
        {guest ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white">
                {guest.name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{guest.name}</p>
                {guest.group && (
                  <p className="truncate text-xs text-slate-500">{guest.group}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => unassignSeat(seat.id)}
              className="w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Unassign
            </button>
          </div>
        ) : pendingGuest ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-700">
              Click this seat to assign{' '}
              <span className="font-semibold">{pendingGuest.name}</span>
            </p>
          </div>
        ) : (
          <ReadOnlyField value="Empty seat" />
        )}
      </Section>
    </>
  )
}

// ── Inspector Panel (root) ─────────────────────────────────────────────────────

export default function InspectorPanel() {
  const project = useProjectStore((s) => s.project)
  const selectedTableId = useProjectStore((s) => s.selectedTableId)
  const selectedSeatId = useProjectStore((s) => s.selectedSeatId)

  if (!project) return null

  // Resolve selected objects
  const selectedTable = selectedTableId
    ? project.tables.find((t) => t.id === selectedTableId) ?? null
    : null

  let selectedSeat: Seat | null = null
  let seatTable: Table | null = null
  if (selectedSeatId) {
    for (const t of project.tables) {
      const s = t.seats.find((s) => s.id === selectedSeatId)
      if (s) { selectedSeat = s; seatTable = t; break }
    }
  }

  return (
    <aside className="flex h-full w-60 flex-shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {selectedTable ? 'Table' : selectedSeat ? seatTable!.label : 'Inspector'}
        </p>
      </div>

      {selectedTable ? (
        <TableInspector key={selectedTable.id} table={selectedTable} warnings={getTableWarnings(selectedTable, project.room)} />
      ) : selectedSeat && seatTable ? (
        <SeatInspector key={selectedSeat.id} seat={selectedSeat} tableLabel={seatTable.label} tableId={seatTable.id} />
      ) : (
        <EmptyInspector room={project.room} />
      )}
    </aside>
  )
}
