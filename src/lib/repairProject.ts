import type { Project } from '../types'

export interface RepairResult {
  project: Project
  repairs: string[]   // summary strings shown in the banner (empty = no repairs needed)
}

export function repairProject(rawProject: Project): RepairResult {
  // Ensure new fields exist for projects saved before shapes/texts were added
  const project: Project = {
    ...rawProject,
    shapes: rawProject.shapes ?? [],
    texts: rawProject.texts ?? [],
  }

  // Build seatId → guestId map from all tables
  const seatGuestId = new Map<string, string | null>()
  for (const table of project.tables) {
    for (const seat of table.seats) {
      seatGuestId.set(seat.id, seat.guestId)
    }
  }

  // Determine the set of seatIds that form a valid mutual pair
  const validSeatIds = new Set<string>()
  for (const guest of project.guests) {
    if (!guest.seatId) continue
    if (seatGuestId.get(guest.seatId) === guest.id) {
      validSeatIds.add(guest.seatId)
    }
  }

  // Pass 1 — fix guests with a stale or mismatched seatId
  const ghostGuestNames: string[] = []
  const repairedGuests = project.guests.map((guest) => {
    if (!guest.seatId) return guest
    if (validSeatIds.has(guest.seatId)) return guest
    ghostGuestNames.push(guest.name)
    return { ...guest, seatId: null }
  })

  // Pass 2 — fix seats whose guestId is not part of a valid pair
  const orphanedSeatGuestNames: string[] = []
  const repairedTables = project.tables.map((table) => ({
    ...table,
    seats: table.seats.map((seat) => {
      if (!seat.guestId) return seat
      if (validSeatIds.has(seat.id)) return seat
      const guest = project.guests.find((g) => g.id === seat.guestId)
      if (guest) orphanedSeatGuestNames.push(guest.name)
      return { ...seat, guestId: null }
    }),
  }))

  // Console output for debugging
  if (ghostGuestNames.length > 0) {
    console.warn('[repairProject] Ghost guest assignments cleared:', ghostGuestNames)
  }
  if (orphanedSeatGuestNames.length > 0) {
    console.warn('[repairProject] Orphaned seat assignments cleared:', orphanedSeatGuestNames)
  }

  // Build banner summary lines
  const repairs: string[] = []
  if (ghostGuestNames.length > 0) {
    repairs.push(
      `${ghostGuestNames.length} guest${ghostGuestNames.length !== 1 ? 's' : ''} had invalid seat assignments and ${ghostGuestNames.length !== 1 ? 'were' : 'was'} unassigned`
    )
  }
  if (orphanedSeatGuestNames.length > 0) {
    repairs.push(
      `${orphanedSeatGuestNames.length} seat${orphanedSeatGuestNames.length !== 1 ? 's' : ''} had orphaned guest references and ${orphanedSeatGuestNames.length !== 1 ? 'were' : 'was'} cleared`
    )
  }

  if (repairs.length === 0) {
    return { project, repairs }
  }

  return {
    project: { ...project, guests: repairedGuests, tables: repairedTables },
    repairs,
  }
}
