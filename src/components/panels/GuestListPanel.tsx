import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import type { Guest } from '../../types'
import Modal from '../ui/Modal'
import { parseGuestCSV } from '../../lib/csvParser'

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

// ── Guest form (add / edit) ───────────────────────────────────────────────────

interface GuestFormModalProps {
  initial?: Guest
  onClose: () => void
  onSave: (data: { name: string; group: string; notes: string }) => void
}

function GuestFormModal({ initial, onClose, onSave }: GuestFormModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [group, setGroup] = useState(initial?.group ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), group: group.trim(), notes: notes.trim() })
  }

  return (
    <Modal title={initial ? 'Edit Guest' : 'Add Guest'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">Name <span className="text-red-400">*</span></label>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Group <span className="text-slate-400 font-normal">(optional)</span></label>
          <input
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
            placeholder="e.g. Vegetarian, plus-one"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={!name.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
            {initial ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteGuestModal({ guest, onClose, onConfirm }: {
  guest: Guest
  onClose: () => void
  onConfirm: () => void
}) {
  const isAssigned = guest.seatId !== null
  return (
    <Modal title="Remove Guest" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Remove <span className="font-semibold text-slate-800">{guest.name}</span>?
        </p>
        {isAssigned && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            This guest is currently assigned to a seat. Removing them will clear that assignment.
          </p>
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

function GuestRowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
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
        <div className="absolute right-0 top-7 z-10 w-28 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <button
            onClick={() => { setOpen(false); onEdit() }}
            className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
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

function GuestRow({ guest, onEdit, onDelete }: {
  guest: Guest
  onEdit: () => void
  onDelete: () => void
}) {
  const isAssigned = guest.seatId !== null

  return (
    <div className="group flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50">
      {/* Status dot */}
      <span
        className={`h-2 w-2 flex-shrink-0 rounded-full ${isAssigned ? 'bg-green-400' : 'bg-red-400'}`}
        title={isAssigned ? 'Assigned' : 'Unassigned'}
      />

      {/* Name + group */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{guest.name}</p>
        {guest.group && (
          <p className="truncate text-xs text-slate-400">{guest.group}</p>
        )}
      </div>

      {/* Overflow menu */}
      <GuestRowMenu onEdit={onEdit} onDelete={onDelete} />
    </div>
  )
}

// ── Guest List Panel ──────────────────────────────────────────────────────────

type ModalState =
  | { type: 'none' }
  | { type: 'add' }
  | { type: 'edit'; guest: Guest }
  | { type: 'delete'; guest: Guest }

export default function GuestListPanel() {
  const project = useProjectStore((s) => s.project)
  const addGuest = useProjectStore((s) => s.addGuest)
  const updateGuest = useProjectStore((s) => s.updateGuest)
  const deleteGuest = useProjectStore((s) => s.deleteGuest)

  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [toast, setToast] = useState<string | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  if (!project) return null

  const guests = project.guests
  const assignedCount = guests.filter((g) => g.seatId !== null).length

  const filtered = search.trim()
    ? guests.filter((g) => {
        const q = search.toLowerCase()
        return (
          g.name.toLowerCase().includes(q) ||
          (g.group?.toLowerCase().includes(q) ?? false)
        )
      })
    : guests

  // ── Add / Edit ──────────────────────────────────────────────────────────────

  const handleSave = async (data: { name: string; group: string; notes: string }) => {
    if (modal.type === 'add') {
      await addGuest({
        id: crypto.randomUUID(),
        name: data.name,
        group: data.group || undefined,
        notes: data.notes || undefined,
        seatId: null,
      })
    } else if (modal.type === 'edit') {
      await updateGuest(modal.guest.id, {
        name: data.name,
        group: data.group || undefined,
        notes: data.notes || undefined,
      })
    }
    setModal({ type: 'none' })
  }

  const handleDelete = async (guest: Guest) => {
    await deleteGuest(guest.id)
    setModal({ type: 'none' })
  }

  // ── CSV import ──────────────────────────────────────────────────────────────

  const handleCSVChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be re-imported
    e.target.value = ''

    const existingNames = new Set(guests.map((g) => g.name.toLowerCase()))

    try {
      const { guests: rows, skipped } = await parseGuestCSV(file, existingNames)

      for (const row of rows) {
        await addGuest({
          id: crypto.randomUUID(),
          name: row.name,
          group: row.group,
          notes: row.notes,
          seatId: null,
        })
      }

      const msg =
        rows.length === 0
          ? `No new guests imported (${skipped} skipped)`
          : skipped > 0
          ? `Imported ${rows.length} guest${rows.length !== 1 ? 's' : ''} (${skipped} skipped)`
          : `Imported ${rows.length} guest${rows.length !== 1 ? 's' : ''}`

      setToast(msg)
    } catch {
      setToast('Failed to parse CSV — check the file format.')
    }
  }

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
                onClick={() => csvInputRef.current?.click()}
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
                  onEdit={() => setModal({ type: 'edit', guest })}
                  onDelete={() => setModal({ type: 'delete', guest })}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Hidden CSV file input */}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleCSVChange}
      />

      {/* Modals */}
      {modal.type === 'add' && (
        <GuestFormModal onClose={() => setModal({ type: 'none' })} onSave={handleSave} />
      )}
      {modal.type === 'edit' && (
        <GuestFormModal
          initial={modal.guest}
          onClose={() => setModal({ type: 'none' })}
          onSave={handleSave}
        />
      )}
      {modal.type === 'delete' && (
        <DeleteGuestModal
          guest={modal.guest}
          onClose={() => setModal({ type: 'none' })}
          onConfirm={() => handleDelete(modal.guest)}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  )
}
