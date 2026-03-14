import { create } from 'zustand'
import { db } from '../db'
import type { Project, Table, Guest } from '../types'

interface ProjectStore {
  project: Project | null
  setProject: (p: Project) => void

  // Table mutations — update store immediately, persist to Dexie async
  addTable: (table: Table) => Promise<void>
  updateTable: (id: string, changes: Partial<Table>) => Promise<void>
  deleteTable: (id: string) => Promise<void>

  // Seat assignment
  assignSeat: (seatId: string, guestId: string) => Promise<void>
  unassignSeat: (seatId: string) => Promise<void>
  rotateSeats: (tableId: string, direction: 'cw' | 'ccw') => Promise<void>
  unassignAllSeats: (tableId: string) => Promise<void>

  // Table replace (for Edit Table modal)
  replaceTable: (tableId: string, newTableData: Partial<Table>, guestUpdates: { guestId: string; seatId: string | null }[]) => Promise<void>

  // Guest mutations
  addGuest: (guest: Guest) => Promise<void>
  updateGuest: (id: string, changes: Partial<Guest>) => Promise<void>
  deleteGuest: (id: string) => Promise<void>

  // Selection state
  selectedTableId: string | null
  selectedSeatId: string | null
  pendingGuestId: string | null
  setSelectedTable: (id: string | null) => void
  setSelectedSeat: (id: string | null) => void
  setPendingGuest: (id: string | null) => void
}

function persist(updated: Project) {
  db.projects.put(updated).catch(console.error)
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  selectedTableId: null,
  selectedSeatId: null,
  pendingGuestId: null,

  setProject: (project) => set({ project }),

  addTable: async (table) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      tables: [...project.tables, table],
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  updateTable: async (id, changes) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      tables: project.tables.map((t) => (t.id === id ? { ...t, ...changes } : t)),
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  deleteTable: async (id) => {
    const { project } = get()
    if (!project) return
    // Clear seat assignments for guests sitting at this table
    const table = project.tables.find((t) => t.id === id)
    const seatIds = new Set(table?.seats.map((s) => s.id) ?? [])
    const updated: Project = {
      ...project,
      tables: project.tables.filter((t) => t.id !== id),
      guests: project.guests.map((g) =>
        g.seatId && seatIds.has(g.seatId) ? { ...g, seatId: null } : g
      ),
      updatedAt: Date.now(),
    }
    set({ project: updated, selectedTableId: null, selectedSeatId: null })
    persist(updated)
  },

  assignSeat: async (seatId, guestId) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      tables: project.tables.map((t) => ({
        ...t,
        seats: t.seats.map((s) => (s.id === seatId ? { ...s, guestId } : s)),
      })),
      guests: project.guests.map((g) => (g.id === guestId ? { ...g, seatId } : g)),
      updatedAt: Date.now(),
    }
    set({ project: updated, pendingGuestId: null })
    persist(updated)
  },

  rotateSeats: async (tableId, direction) => {
    const { project } = get()
    if (!project) return
    const table = project.tables.find((t) => t.id === tableId)
    if (!table || table.seats.every((s) => s.guestId === null)) return
    const n = table.seats.length
    const newSeats = table.seats.map((seat, i) => {
      const sourceIdx = direction === 'cw' ? (i - 1 + n) % n : (i + 1) % n
      return { ...seat, guestId: table.seats[sourceIdx].guestId }
    })
    // Build guestId → new seatId map so guest.seatId links stay correct
    const guestSeatMap = new Map<string, string>()
    for (const seat of newSeats) {
      if (seat.guestId) guestSeatMap.set(seat.guestId, seat.id)
    }
    const updated: Project = {
      ...project,
      tables: project.tables.map((t) => (t.id === tableId ? { ...t, seats: newSeats } : t)),
      guests: project.guests.map((g) => {
        const newSeatId = guestSeatMap.get(g.id)
        return newSeatId !== undefined ? { ...g, seatId: newSeatId } : g
      }),
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  unassignAllSeats: async (tableId) => {
    const { project } = get()
    if (!project) return
    const table = project.tables.find((t) => t.id === tableId)
    if (!table) return
    const seatIds = new Set(table.seats.map((s) => s.id))
    const updated: Project = {
      ...project,
      tables: project.tables.map((t) =>
        t.id === tableId
          ? { ...t, seats: t.seats.map((s) => ({ ...s, guestId: null })) }
          : t
      ),
      guests: project.guests.map((g) =>
        g.seatId && seatIds.has(g.seatId) ? { ...g, seatId: null } : g
      ),
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  unassignSeat: async (seatId) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      tables: project.tables.map((t) => ({
        ...t,
        seats: t.seats.map((s) => (s.id === seatId ? { ...s, guestId: null } : s)),
      })),
      guests: project.guests.map((g) => (g.seatId === seatId ? { ...g, seatId: null } : g)),
      updatedAt: Date.now(),
    }
    set({ project: updated, selectedSeatId: null })
    persist(updated)
  },

  replaceTable: async (tableId, newTableData, guestUpdates) => {
    const { project } = get()
    if (!project) return
    const guestUpdateMap = new Map(guestUpdates.map((u) => [u.guestId, u.seatId]))
    const updated: Project = {
      ...project,
      tables: project.tables.map((t) => (t.id === tableId ? { ...t, ...newTableData } : t)),
      guests: project.guests.map((g) =>
        guestUpdateMap.has(g.id) ? { ...g, seatId: guestUpdateMap.get(g.id)! } : g
      ),
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  addGuest: async (guest) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      guests: [...project.guests, guest],
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  updateGuest: async (id, changes) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      guests: project.guests.map((g) => (g.id === id ? { ...g, ...changes } : g)),
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  deleteGuest: async (id) => {
    const { project } = get()
    if (!project) return
    const guest = project.guests.find((g) => g.id === id)
    // Clear the seat assignment if guest was seated
    const updated: Project = {
      ...project,
      guests: project.guests.filter((g) => g.id !== id),
      tables: guest?.seatId
        ? project.tables.map((t) => ({
            ...t,
            seats: t.seats.map((s) =>
              s.id === guest.seatId ? { ...s, guestId: null } : s
            ),
          }))
        : project.tables,
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  setSelectedTable: (id) => set({ selectedTableId: id, selectedSeatId: null }),
  setSelectedSeat: (id) => set({ selectedSeatId: id, selectedTableId: null }),
  setPendingGuest: (id) => set({ pendingGuestId: id }),
}))
