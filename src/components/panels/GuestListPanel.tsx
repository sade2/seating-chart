import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import type { Guest } from '../../types'
import Modal from '../ui/Modal'
import CsvImportModal from '../modals/CsvImportModal'

// ── Toast ─────────────────────────────────────────────────────────────────────

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

// ── Add Guest Modal (multi-guest + +1s) ───────────────────────────────────────

type GuestSlot =
  | { kind: 'guest'; id: string; name: string; notes: string }
  | { kind: 'plus-one'; id: string; parentId: string; notes: string }

interface AddGuestModalProps {
  onClose: () => void
  onAdded: (count: number) => void
}

function AddGuestModal({ onClose, onAdded }: AddGuestModalProps) {
  const addGuest = useProjectStore((s) => s.addGuest)
  const [group, setGroup] = useState('')
  const [slots, setSlots] = useState<GuestSlot[]>([
    { kind: 'guest', id: crypto.randomUUID(), name: '', notes: '' },
  ])
  const firstNameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { firstNameRef.current?.focus() }, [])

  const regularSlots = slots.filter((s): s is Extract<GuestSlot, { kind: 'guest' }> => s.kind === 'guest')
  const canRemoveGuest = regularSlots.length > 1
  const canSubmit = regularSlots.some((s) => s.name.trim() !== '')

  function addGuestRow() {
    setSlots((prev) => [...prev, { kind: 'guest', id: crypto.randomUUID(), name: '', notes: '' }])
  }

  function addPlusOne(parentId: string) {
    setSlots((prev) => {
      // Insert after the last slot belonging to this parent (the parent itself or its existing +1s)
      let insertIdx = prev.length
      for (let i = prev.length - 1; i >= 0; i--) {
        const s = prev[i]
        if (s.id === parentId || (s.kind === 'plus-one' && s.parentId === parentId)) {
          insertIdx = i + 1
          break
        }
      }
      const newSlot: GuestSlot = { kind: 'plus-one', id: crypto.randomUUID(), parentId, notes: '' }
      return [...prev.slice(0, insertIdx), newSlot, ...prev.slice(insertIdx)]
    })
  }

  function removeSlot(id: string, kind: 'guest' | 'plus-one') {
    setSlots((prev) => {
      if (kind === 'guest') {
        // Also remove any +1s linked to this guest
        return prev.filter((s) => s.id !== id && !(s.kind === 'plus-one' && s.parentId === id))
      }
      return prev.filter((s) => s.id !== id)
    })
  }

  function updateSlot(id: string, changes: { name?: string; notes?: string }) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes } : s)))
  }

  async function handleSubmit() {
    if (!canSubmit) return
    const groupVal = group.trim() || undefined
    // Map slot id → real guest id and name (for +1 parent resolution)
    const slotIdToGuestId = new Map<string, string>()
    const slotIdToName = new Map<string, string>()
    let count = 0

    for (const slot of slots) {
      if (slot.kind === 'guest') {
        const name = slot.name.trim()
        if (!name) continue
        const guestId = crypto.randomUUID()
        slotIdToGuestId.set(slot.id, guestId)
        slotIdToName.set(slot.id, name)
        await addGuest({
          id: guestId,
          name,
          group: groupVal,
          notes: slot.notes.trim() || undefined,
          seatId: null,
          plusOneOf: null,
        })
        count++
      } else {
        const parentGuestId = slotIdToGuestId.get(slot.parentId)
        if (!parentGuestId) continue  // parent was blank — skip this +1
        const parentName = slotIdToName.get(slot.parentId) ?? ''
        await addGuest({
          id: crypto.randomUUID(),
          name: `Guest of ${parentName}`,
          group: groupVal,
          notes: slot.notes.trim() || undefined,
          seatId: null,
          plusOneOf: parentGuestId,
        })
        count++
      }
    }
    onAdded(count)
  }

  const xIcon = (
    <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M2 2l10 10M12 2L2 12" />
    </svg>
  )

  return (
    <Modal title="Add Guests" onClose={onClose}>
      <div className="space-y-4">
        {/* Shared group field */}
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Group <span className="font-normal text-slate-400">(optional — applies to all)</span>
          </label>
          <input
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="e.g. Smith Family"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Guest rows */}
        <div className="space-y-2">
          {slots.map((slot, i) => {
            if (slot.kind === 'guest') {
              const isFirst = i === 0
              return (
                <div key={slot.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <input
                        ref={isFirst ? firstNameRef : undefined}
                        value={slot.name}
                        onChange={(e) => updateSlot(slot.id, { name: e.target.value })}
                        placeholder="Full name *"
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                      <input
                        value={slot.notes}
                        onChange={(e) => updateSlot(slot.id, { notes: e.target.value })}
                        placeholder="Notes (optional)"
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    {canRemoveGuest && (
                      <button
                        onClick={() => removeSlot(slot.id, 'guest')}
                        className="mt-0.5 flex-shrink-0 rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                        aria-label="Remove guest"
                      >
                        {xIcon}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => addPlusOne(slot.id)}
                    className="text-xs text-indigo-500 hover:text-indigo-700"
                  >
                    + Add +1
                  </button>
                </div>
              )
            } else {
              return (
                <div key={slot.id} className="ml-4 flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="flex-shrink-0 text-xs font-semibold text-slate-400">+1</span>
                  <input
                    value={slot.notes}
                    onChange={(e) => updateSlot(slot.id, { notes: e.target.value })}
                    placeholder="Notes (optional)"
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                  <button
                    onClick={() => removeSlot(slot.id, 'plus-one')}
                    className="flex-shrink-0 rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                    aria-label="Remove +1"
                  >
                    {xIcon}
                  </button>
                </div>
              )
            }
          })}
        </div>

        {/* Add another guest */}
        <button
          onClick={addGuestRow}
          className="w-full rounded-lg border border-dashed border-slate-200 py-2 text-sm text-slate-400 hover:border-slate-300 hover:text-slate-500"
        >
          + Add another guest
        </button>

        {/* Action buttons */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            Add Guests
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Edit Guest Modal ──────────────────────────────────────────────────────────

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

// ── Delete confirmation modal ─────────────────────────────────────────────────

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

// ── Row overflow menu ─────────────────────────────────────────────────────────

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

// ── Guest row ─────────────────────────────────────────────────────────────────

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

// ── Guest List Panel ──────────────────────────────────────────────────────────

type ModalState =
  | { type: 'none' }
  | { type: 'add' }
  | { type: 'edit'; guest: Guest }
  | { type: 'delete'; guest: Guest }
  | { type: 'csv' }

export default function GuestListPanel({ onPanToSeat }: { onPanToSeat: (seatId: string) => void }) {
  const project = useProjectStore((s) => s.project)
  const addGuest = useProjectStore((s) => s.addGuest)
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
  const assignedCount = guests.filter((g) => g.seatId !== null).length

  // Build seatId → { tableLabel, seatNumber } for badge display
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

  // ── Edit ──────────────────────────────────────────────────────────────────

  const handleEdit = async (data: { name: string; group: string; notes: string }) => {
    if (modal.type !== 'edit') return
    await updateGuest(modal.guest.id, {
      name: data.name,
      group: data.group || undefined,
      notes: data.notes || undefined,
    })
    setModal({ type: 'none' })
  }

  // ── Delete (with cascade) ─────────────────────────────────────────────────

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
              placeholder="Search…"
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-7 pr-3 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Assignment summary */}
          <p className="text-[11px] text-slate-400">
            <span className="font-semibold text-slate-600">{assignedCount}</span>
            {' / '}
            <span className="font-semibold text-slate-600">{guests.length}</span>
            {' guests assigned'}
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
