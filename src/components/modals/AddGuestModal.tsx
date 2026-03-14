import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import Modal from '../ui/Modal'

type GuestSlot =
  | { kind: 'guest'; id: string; name: string; notes: string }
  | { kind: 'plus-one'; id: string; parentId: string; notes: string }

export interface AddGuestModalProps {
  onClose: () => void
  onAdded: (count: number) => void
}

export default function AddGuestModal({ onClose, onAdded }: AddGuestModalProps) {
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
        if (!parentGuestId) continue
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
                    Give a +1
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
