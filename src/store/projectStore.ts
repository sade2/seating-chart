import { create } from 'zustand'
import { api, VersionConflictError } from '../lib/api'
import type { Project, Table, Guest, Room, TracedFloorPlan, CanvasShape, CanvasText } from '../types'

interface ProjectStore {
  project: Project | null
  setProject: (p: Project) => void

  // Table mutations — update store immediately, persist to API async (debounced)
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

  // Bulk guest assignment
  bulkAssignGuests: (tableId: string, guestIds: string[]) => Promise<void>

  // Guest mutations
  addGuest: (guest: Guest) => Promise<void>
  updateGuest: (id: string, changes: Partial<Guest>) => Promise<void>
  deleteGuest: (id: string) => Promise<void>
  deleteManyGuests: (ids: string[]) => Promise<void>

  // Shape mutations
  addShape: (shape: CanvasShape) => Promise<void>
  updateShape: (id: string, changes: Partial<CanvasShape>) => Promise<void>
  deleteShape: (id: string) => Promise<void>

  // Text mutations
  addText: (text: CanvasText) => Promise<void>
  updateText: (id: string, changes: Partial<CanvasText>) => Promise<void>
  deleteText: (id: string) => Promise<void>

  // Project settings
  updateRoom: (changes: Partial<Room>) => Promise<void>
  updateProjectName: (name: string) => Promise<void>

  // Floor plan
  setFloorPlan: (floorPlan: TracedFloorPlan, widthFt: number, heightFt: number) => Promise<void>
  removeFloorPlan: () => Promise<void>
  updateFloorPlanOpacity: (opacity: number) => Promise<void>

  // Conflict state — set when a save is rejected due to a version mismatch
  conflictDetected: boolean
  clearConflict: () => void

  // Selection state
  selectedTableId: string | null
  selectedSeatId: string | null
  selectedShapeId: string | null
  selectedTextId: string | null
  pendingGuestId: string | null
  setSelectedTable: (id: string | null) => void
  setSelectedSeat: (id: string | null) => void
  setSelectedShape: (id: string | null) => void
  setSelectedText: (id: string | null) => void
  setPendingGuest: (id: string | null) => void
}

// ── Debounced persist ──────────────────────────────────────────────────────────
//
// The store is mutated on every drag pixel / keypress. Calling the API that
// often would be extremely wasteful. We debounce to 1500ms — only the final
// state in each burst is sent over the wire.
//
// flushPersist() is exported so ProjectPage can trigger an immediate save when
// the tab loses visibility (user closes / switches tab).

let persistTimer: ReturnType<typeof setTimeout> | null = null
let pendingProject: Project | null = null

async function executeSave(project: Project) {
  try {
    const result = await api.saveProject(project.id, project, project.version)
    // Update the stored version so the next save sends the correct expectedVersion
    const current = useProjectStore.getState().project
    if (current?.id === project.id) {
      useProjectStore.setState({ project: { ...current, version: result.version } })
    }
  } catch (e) {
    if (e instanceof VersionConflictError) {
      useProjectStore.setState({ conflictDetected: true })
    } else {
      console.error('Save failed:', e)
    }
  }
}

function persist(updated: Project) {
  pendingProject = updated
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    if (pendingProject) {
      executeSave(pendingProject)
      pendingProject = null
    }
    persistTimer = null
  }, 1500)
}

export function flushPersist() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (pendingProject) {
    executeSave(pendingProject)
    pendingProject = null
  }
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  selectedTableId: null,
  selectedSeatId: null,
  selectedShapeId: null,
  selectedTextId: null,
  pendingGuestId: null,
  conflictDetected: false,

  setProject: (project) => set({ project, conflictDetected: false }),
  clearConflict: () => set({ conflictDetected: false }),

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

  deleteManyGuests: async (ids) => {
    const { project } = get()
    if (!project) return
    const idSet = new Set(ids)
    const updated: Project = {
      ...project,
      guests: project.guests.filter((g) => !idSet.has(g.id)),
      tables: project.tables.map((t) => ({
        ...t,
        seats: t.seats.map((s) => (s.guestId && idSet.has(s.guestId) ? { ...s, guestId: null } : s)),
      })),
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  addShape: async (shape) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      shapes: [...(project.shapes ?? []), shape],
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  updateShape: async (id, changes) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      shapes: (project.shapes ?? []).map((s) => (s.id === id ? { ...s, ...changes } : s)),
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  deleteShape: async (id) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      shapes: (project.shapes ?? []).filter((s) => s.id !== id),
      updatedAt: Date.now(),
    }
    set({ project: updated, selectedShapeId: null })
    persist(updated)
  },

  addText: async (text) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      texts: [...(project.texts ?? []), text],
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  updateText: async (id, changes) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      texts: (project.texts ?? []).map((t) => (t.id === id ? { ...t, ...changes } : t)),
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  deleteText: async (id) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      texts: (project.texts ?? []).filter((t) => t.id !== id),
      updatedAt: Date.now(),
    }
    set({ project: updated, selectedTextId: null })
    persist(updated)
  },

  updateRoom: async (changes) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      room: { ...project.room, ...changes },
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  updateProjectName: async (name) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      name,
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  setFloorPlan: async (floorPlan, widthFt, heightFt) => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      room: { ...project.room, floorPlan, widthFt, heightFt },
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  removeFloorPlan: async () => {
    const { project } = get()
    if (!project) return
    const { floorPlan: _removed, ...roomWithout } = project.room
    const updated: Project = {
      ...project,
      room: roomWithout,
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  updateFloorPlanOpacity: async (opacity) => {
    const { project } = get()
    if (!project?.room.floorPlan) return
    const updated: Project = {
      ...project,
      room: {
        ...project.room,
        floorPlan: { ...project.room.floorPlan, opacity },
      },
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  bulkAssignGuests: async (tableId, guestIds) => {
    const { project } = get()
    if (!project) return
    const table = project.tables.find((t) => t.id === tableId)
    if (!table) return

    const newGuestIdSet = new Set(guestIds)
    const currentlyHere = new Set(
      table.seats.filter((s) => s.guestId !== null).map((s) => s.guestId as string)
    )
    const toRemove = new Set([...currentlyHere].filter((id) => !newGuestIdSet.has(id)))
    const toAdd = guestIds.filter((id) => !currentlyHere.has(id))

    let queue = [...toAdd]
    const finalSeats = table.seats
      .map((s) => (s.guestId && toRemove.has(s.guestId) ? { ...s, guestId: null } : s))
      .map((s) => (s.guestId === null && queue.length > 0 ? { ...s, guestId: queue.shift()! } : s))

    const newSeatForGuest = new Map<string, string>()
    for (const seat of finalSeats) {
      if (seat.guestId && toAdd.includes(seat.guestId)) newSeatForGuest.set(seat.guestId, seat.id)
    }

    const updated: Project = {
      ...project,
      tables: project.tables.map((t) => (t.id === tableId ? { ...t, seats: finalSeats } : t)),
      guests: project.guests.map((g) => {
        if (toRemove.has(g.id)) return { ...g, seatId: null }
        if (newSeatForGuest.has(g.id)) return { ...g, seatId: newSeatForGuest.get(g.id)! }
        return g
      }),
      updatedAt: Date.now(),
    }
    set({ project: updated })
    persist(updated)
  },

  setSelectedTable: (id) => set({ selectedTableId: id, selectedSeatId: null, selectedShapeId: null, selectedTextId: null }),
  setSelectedSeat: (id) => set({ selectedSeatId: id, selectedTableId: null, selectedShapeId: null, selectedTextId: null }),
  setSelectedShape: (id) => set({ selectedShapeId: id, selectedTableId: null, selectedSeatId: null, selectedTextId: null }),
  setSelectedText: (id) => set({ selectedTextId: id, selectedTableId: null, selectedSeatId: null, selectedShapeId: null }),
  setPendingGuest: (id) => set({ pendingGuestId: id }),
}))
