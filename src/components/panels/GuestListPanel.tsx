import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import type { Guest } from '../../types'
import Modal from '../ui/Modal'
import CsvImportModal from '../modals/CsvImportModal'
import AddGuestModal from '../modals/AddGuestModal'

// â”€â”€ Toast â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm text-white shadow-lg">
      {message}
    </div>
  )
}
// â”€â”€ Edit Guest Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface EditGuestModalProps {
  guest: Guest
  onClose: () => void
  onSave: (data: { name: string; group: string; notes: string }) => void
}

function EditGuestModal({ guest, onClose, onSave }: EditGuestModalProps) {
  const isPlusOne = !!guest.plusOneOf
  const [name, setName] = useState(guest.name)
  const [group, setGroup] = useState(guest.group ?? '')
  const [notes, setNotes] = useState(guest.notes ?? '')
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameRef.current?.focus() }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isPlusOne && !name.trim()) return
    onSave({ name: isPlusOne ? guest.name : name.trim(), group: group.trim(), notes: notes.trim() })
  }

  return (
    <Modal title="Edit Guest" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Name {!isPlusOne && <span className="text-red-400">*</span>}
          </label>
          {isPlusOne ? (
            <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">{guest.name}</p>
          ) : (
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          )}
          {isPlusOne && (
            <p className="mt-1 text-xs text-slate-400">Name is fixed for +1 guests.</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Group <span className="text-slate-400 font-normal">(optional)</span></label>
          <input
            ref={isPlusOne ? nameRef : undefined}
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="e.g. Smith Family"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Vegetarian"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={!isPlusOne && !name.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}

// â”€â”€ Delete confirmation modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DeleteGuestModal({ guest, plusOnes, onClose, onConfirm }: {
  guest: Guest
  plusOnes: Guest[]
  onClose: () => void
  onConfirm: () => void
}) {
  const hasCascade = plusOnes.length > 0
  return (
    <Modal title="Remove Guest" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Remove <span className="font-semibold text-slate-800">{guest.name}</span>?
        </p>
        {guest.seatId && !hasCascade && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            This guest is currently assigned to a seat. Removing them will clear that assignment.
          </p>
        )}
        {hasCascade && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 space-y-1">
            <p className="font-semibold">This will also remove the following +1{plusOnes.length !== 1 ? 's' : ''}:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {plusOnes.map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Remove
          </button>
        </div>
      </div>
    </Modal>
  )
}

// â”€â”€ Row overflow menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function GuestRowMenu({ onEdit, onDelete, onUnassign }: { onEdit: () => void; onDelete: () => void; onUnassign?: () => void }) {
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
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className="flex h-6 w-6 items-center justify-center rounded text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-500"
        aria-label="Options"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
          <circle cx="8" cy="3" r="1.3" />
          <circle cx="8" cy="8" r="1.3" />
          <circle cx="8" cy="13" r="1.3" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-10 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <button
            onClick={() => { setOpen(false); onEdit() }}
            className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
          {onUnassign && (
            <button
              onClick={() => { setOpen(false); onUnassign() }}
              className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              Unassign from seat
            </button>
          )}
          <button
            onClick={() => { setOpen(false); onDelete() }}
            className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

// â”€â”€ Guest row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function GuestRow({ guest, isPending, assignment, onEdit, onDelete, onUnassign, onRowClick }: {
  guest: Guest
  isPending: boolean
  assignment?: { tableLabel: string; seatNumber: number }
  onEdit: () => void
  onDelete: () => void
  onUnassign?: () => void
  onRowClick: () => void
}) {
  const isAssigned = guest.seatId !== null
  const isPlusOne = !!guest.plusOneOf

  return (
    <div
      className="group flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50"
      style={{ backgroundColor: isPending ? '#fef3c7' : undefined, cursor: 'pointer' }}
      onClick={onRowClick}
    >
      {/* Status dot */}
      <span
        className={`h-2 w-2 flex-shrink-0 rounded-full ${isAssigned ? 'bg-green-400' : 'bg-red-400'}`}
        title={isAssigned ? 'Assigned' : 'Unassigned'}
      />

      {/* Name + group */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {isPlusOne && (
            <span className="flex-shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">+1</span>
          )}
          <p className="truncate text-sm font-medium text-slate-800">{guest.name}</p>
        </div>
        {guest.group && (
          <p className="truncate text-xs text-slate-400">{guest.group}</p>
        )}
      </div>

      {/* Assignment badge */}
      {assignment && (
        <div className="flex-shrink-0 text-right">
          <p className="text-xs font-medium leading-tight text-slate-600">{assignment.tableLabel}</p>
          <p className="text-[10px] leading-tight text-slate-400">Seat {assignment.seatNumber}</p>
        </div>
      )}

      {/* Overflow menu */}
      <GuestRowMenu onEdit={onEdit} onDelete={onDelete} onUnassign={onUnassign} />
    </div>
  )
}

// â”€â”€ Guest List Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ModalState =
  | { type: 'none' }
  | { type: 'add' }
  | { type: 'edit'; guest: Guest }
  | { type: 'delete'; guest: Guest }
  | { type: 'csv' }

export default function GuestListPanel({ onPanToSeat }: { onPanToSeat: (seatId: string) => void }) {
  const project = useProjectStore((s) => s.project)
  const updateGuest = useProjectStore((s) => s.updateGuest)
  const deleteManyGuests = useProjectStore((s) => s.deleteManyGuests)
  const pendingGuestId = useProjectStore((s) => s.pendingGuestId)
  const setPendingGuest = useProjectStore((s) => s.setPendingGuest)
  const setSelectedSeat = useProjectStore((s) => s.setSelectedSeat)
  const unassignSeat = useProjectStore((s) => s.unassignSeat)

  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [toast, setToast] = useState<string | null>(null)

  if (!project) return null

  const guests = project.guests
  const totalSeats = project.tables.reduce((sum, t) => sum + t.seats.length, 0)
  const filledSeats = project.tables.reduce((sum, t) => sum + t.seats.filter((s) => s.guestId !== null).length, 0)
  const remainingSeats = totalSeats - filledSeats

  // Build seatId â†’ { tableLabel, seatNumber } for badge display
  const seatAssignmentMap: Record<string, { tableLabel: string; seatNumber: number }> = {}
  for (const table of project.tables) {
    for (const seat of table.seats) {
      seatAssignmentMap[seat.id] = { tableLabel: table.label, seatNumber: seat.index + 1 }
    }
  }

  const filtered = search.trim()
    ? guests.filter((g) => {
        const q = search.toLowerCase()
        return (
          g.name.toLowerCase().includes(q) ||
          (g.group?.toLowerCase().includes(q) ?? false)
        )
      })
    : guests

  // â”€â”€ Edit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleEdit = async (data: { name: string; group: string; notes: string }) => {
    if (modal.type !== 'edit') return
    await updateGuest(modal.guest.id, {
      name: data.name,
      group: data.group || undefined,
      notes: data.notes || undefined,
    })
    setModal({ type: 'none' })
  }

  // â”€â”€ Delete (with cascade) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleDelete = async (guest: Guest) => {
    const plusOnes = guests.filter((g) => g.plusOneOf === guest.id)
    const ids = [guest.id, ...plusOnes.map((g) => g.id)]
    await deleteManyGuests(ids)
    setModal({ type: 'none' })
  }

  // Compute +1s for the guest being deleted (used by DeleteGuestModal)
  const deleteGuest = modal.type === 'delete' ? modal.guest : null
  const deletePlusOnes = deleteGuest ? guests.filter((g) => g.plusOneOf === deleteGuest.id) : []

  return (
    <>
      <aside className="flex h-full w-60 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
        {/* Fixed header */}
        <div className="flex-shrink-0 border-b border-slate-100 px-3 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Guest List
            </p>
            <div className="flex items-center gap-1">
              {/* Import CSV */}
              <button
                onClick={() => setModal({ type: 'csv' })}
                title="Import CSV"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 10V3M5 7l3 3 3-3" />
                  <path d="M3 13h10" />
                </svg>
              </button>
              {/* Add guest */}
              <button
                onClick={() => setModal({ type: 'add' })}
                title="Add guest"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                  <path d="M8 2v12M2 8h12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <circle cx="6.5" cy="6.5" r="4" />
              <path d="M11 11l3 3" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-7 pr-3 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Assignment summary */}
          <p className="text-[11px] text-slate-400">
            <span className="font-semibold text-slate-600">{remainingSeats}</span>
            {' / '}
            <span className="font-semibold text-slate-600">{totalSeats}</span>
            {' Seats remain to be filled'}
          </p>
        </div>

        {/* Scrollable guest list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
              {guests.length === 0 ? (
                <>
                  <p className="text-xs font-medium text-slate-400">No guests yet</p>
                  <p className="text-[11px] text-slate-300">Add guests or import a CSV</p>
                </>
              ) : (
                <p className="text-xs text-slate-400">No results for "{search}"</p>
              )}
            </div>
          ) : (
            <div className="py-1">
              {filtered.map((guest) => (
                <GuestRow
                  key={guest.id}
                  guest={guest}
                  isPending={pendingGuestId === guest.id}
                  assignment={guest.seatId ? seatAssignmentMap[guest.seatId] : undefined}
                  onEdit={() => setModal({ type: 'edit', guest })}
                  onDelete={() => setModal({ type: 'delete', guest })}
                  onUnassign={guest.seatId ? () => unassignSeat(guest.seatId!) : undefined}
                  onRowClick={() => {
                    if (guest.seatId !== null) {
                      setPendingGuest(null)
                      setSelectedSeat(guest.seatId)
                      onPanToSeat(guest.seatId)
                    } else {
                      setPendingGuest(pendingGuestId === guest.id ? null : guest.id)
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Modals */}
      {modal.type === 'add' && (
        <AddGuestModal
          onClose={() => setModal({ type: 'none' })}
          onAdded={(count) => {
            setToast(`Added ${count} guest${count !== 1 ? 's' : ''}`)
            setModal({ type: 'none' })
          }}
        />
      )}
      {modal.type === 'edit' && (
        <EditGuestModal
          guest={modal.guest}
          onClose={() => setModal({ type: 'none' })}
          onSave={handleEdit}
        />
      )}
      {modal.type === 'delete' && deleteGuest && (
        <DeleteGuestModal
          guest={deleteGuest}
          plusOnes={deletePlusOnes}
          onClose={() => setModal({ type: 'none' })}
          onConfirm={() => handleDelete(deleteGuest)}
        />
      )}
      {modal.type === 'csv' && (
        <CsvImportModal
          onClose={() => setModal({ type: 'none' })}
          onImported={(msg) => { setToast(msg); setModal({ type: 'none' }) }}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  )
}
