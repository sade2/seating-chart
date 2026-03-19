import { useEffect, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import type { Guest, Table } from '../../types'
import Modal from '../ui/Modal'

interface BulkAssignModalProps {
  table: Table
  onClose: () => void
}

function GroupCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
    />
  )
}

export default function BulkAssignModal({ table, onClose }: BulkAssignModalProps) {
  const project = useProjectStore((s) => s.project)
  const bulkAssignGuests = useProjectStore((s) => s.bulkAssignGuests)

  // Guest IDs currently assigned to this table
  const currentAtTable = useMemo(() => {
    const set = new Set<string>()
    for (const seat of table.seats) {
      if (seat.guestId) set.add(seat.guestId)
    }
    return set
  }, [table])

  // Eligible guests: at this table OR completely unassigned
  const eligible = useMemo<Guest[]>(() => {
    if (!project) return []
    return project.guests.filter((g) => currentAtTable.has(g.id) || g.seatId === null)
  }, [project, currentAtTable])

  // Sorted by group → name
  const sortedEligible = useMemo(() =>
    [...eligible].sort((a, b) => {
      const ga = a.group ?? '', gb = b.group ?? ''
      if (ga !== gb) return ga.localeCompare(gb)
      return a.name.localeCompare(b.name)
    }), [eligible])

  // Initial checked set: only guests already at this table (no auto-fill)
  const [checked, setChecked] = useState<Set<string>>(() => new Set(currentAtTable))
  const isFull = checked.size >= table.seats.length

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < table.seats.length) {
        next.add(id)
      }
      return next
    })
  }

  function toggleGroup(groupGuests: Guest[]) {
    setChecked((prev) => {
      const allChecked = groupGuests.every((g) => prev.has(g.id))
      const someChecked = groupGuests.some((g) => prev.has(g.id))
      const next = new Set(prev)

      if (allChecked || someChecked) {
        // Uncheck everyone in the group (including "here" guests)
        for (const g of groupGuests) next.delete(g.id)
      } else {
        // Re-add "here" guests from this group first
        for (const g of groupGuests) {
          if (currentAtTable.has(g.id)) next.add(g.id)
        }
        // Fill remaining open seats with unassigned guests from this group
        for (const g of groupGuests) {
          if (next.size >= table.seats.length) break
          if (!currentAtTable.has(g.id)) next.add(g.id)
        }
      }
      return next
    })
  }

  // Group guests for display: named groups first (alphabetical), ungrouped last
  const groupedGuests = useMemo(() => {
    const map = new Map<string, Guest[]>()
    for (const g of sortedEligible) {
      const key = g.group ?? ''
      const list = map.get(key) ?? []
      list.push(g)
      map.set(key, list)
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === '') return 1
      if (b === '') return -1
      return a.localeCompare(b)
    })
  }, [sortedEligible])

  async function handleAssign() {
    await bulkAssignGuests(table.id, [...checked])
    onClose()
  }

  return (
    <Modal title={`Assign Guests — ${table.label}`} onClose={onClose}>
      <div className="space-y-3">
        {/* Seat count summary */}
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-slate-600">{checked.size}</span>
          {' / '}
          <span className="font-semibold text-slate-600">{table.seats.length}</span>
          {' seats selected'}
        </p>

        {/* Table-full notice */}
        {isFull && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
            Table is full — uncheck a guest to swap
          </p>
        )}

        {/* Checklist */}
        {eligible.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No unassigned guests to add.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
            {groupedGuests.map(([group, guests], gi) => {
              const allGroupChecked = guests.every((g) => checked.has(g.id))
              const someGroupChecked = guests.some((g) => checked.has(g.id))
              const groupIndeterminate = someGroupChecked && !allGroupChecked

              return (
                <div key={group || '__ungrouped'}>
                  {group && (
                    <div
                      className={`sticky top-0 flex items-center gap-2 bg-slate-50 px-3 py-1.5${gi > 0 ? ' border-t border-slate-100' : ''}`}
                    >
                      <GroupCheckbox
                        checked={allGroupChecked}
                        indeterminate={groupIndeterminate}
                        onChange={() => toggleGroup(guests)}
                      />
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {group}
                      </p>
                    </div>
                  )}
                  {guests.map((guest) => {
                    const isChecked = checked.has(guest.id)
                    const isDisabled = !isChecked && isFull
                    return (
                      <label
                        key={guest.id}
                        className={`flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50${isDisabled ? ' opacity-40' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => toggle(guest.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <p className="min-w-0 flex-1 truncate text-sm text-slate-800">
                          {guest.name}
                        </p>
                        {currentAtTable.has(guest.id) && (
                          <span className="flex-shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-400">
                            here
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Assign{checked.size > 0 ? ` (${checked.size})` : ''}
          </button>
        </div>
      </div>
    </Modal>
  )
}
