import { useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import type { Table, Seat } from '../../types'

// ── Shared UI primitives ───────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-slate-100 px-4 py-4 last:border-b-0">{children}</div>
}

function Label({ children }: { children: React.ReactNode }) {
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
        <Label>Room</Label>
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

function TableInspector({ table }: { table: Table }) {
  const updateTable = useProjectStore((s) => s.updateTable)
  const deleteTable = useProjectStore((s) => s.deleteTable)
  const setSelectedTable = useProjectStore((s) => s.setSelectedTable)

  const [label, setLabel] = useState(table.label)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const occupiedCount = table.seats.filter((s) => s.guestId !== null).length
  const typeLabel = table.type.charAt(0).toUpperCase() + table.type.slice(1)
  const sizeLabel =
    table.type === 'rectangular'
      ? `${table.sizeFt} × ${table.widthFt ?? 2.5} ft`
      : `${table.sizeFt} ft`

  const handleLabelBlur = () => {
    const trimmed = label.trim()
    if (!trimmed) { setLabel(table.label); return }
    if (trimmed !== table.label) updateTable(table.id, { label: trimmed })
  }

  const handleDelete = () => {
    deleteTable(table.id)
    setSelectedTable(null)
  }

  return (
    <>
      <Section>
        <Label>Label</Label>
        <input
          ref={inputRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleLabelBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.blur() }}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </Section>

      <Section>
        <Label>Type</Label>
        <ReadOnlyField value={typeLabel} />
      </Section>

      <Section>
        <Label>Size</Label>
        <ReadOnlyField value={sizeLabel} />
      </Section>

      <Section>
        <Label>Seats</Label>
        <ReadOnlyField value={`${table.seats.length} total · ${occupiedCount} occupied`} />
      </Section>

      {/* Delete */}
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
    </>
  )
}

// ── Seat inspector ─────────────────────────────────────────────────────────────

function SeatInspector({ seat, tableLabel }: { seat: Seat; tableLabel: string }) {
  const project = useProjectStore((s) => s.project)
  const unassignSeat = useProjectStore((s) => s.unassignSeat)
  const pendingGuestId = useProjectStore((s) => s.pendingGuestId)

  const guest = seat.guestId
    ? project?.guests.find((g) => g.id === seat.guestId)
    : null

  const pendingGuest = pendingGuestId
    ? project?.guests.find((g) => g.id === pendingGuestId)
    : null

  return (
    <>
      <Section>
        <Label>Table</Label>
        <ReadOnlyField value={tableLabel} />
      </Section>

      <Section>
        <Label>Seat</Label>
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
          {selectedTable ? 'Table' : selectedSeat ? 'Seat' : 'Inspector'}
        </p>
      </div>

      {selectedTable ? (
        <TableInspector key={selectedTable.id} table={selectedTable} />
      ) : selectedSeat && seatTable ? (
        <SeatInspector key={selectedSeat.id} seat={selectedSeat} tableLabel={seatTable.label} />
      ) : (
        <EmptyInspector room={project.room} />
      )}
    </aside>
  )
}
