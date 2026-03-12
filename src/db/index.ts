import Dexie, { type Table } from 'dexie'
import type { Project } from '../types'

class SeatingChartDB extends Dexie {
  projects!: Table<Project, string>

  constructor() {
    super('SeatingChartDB')
    this.version(1).stores({
      // Only index id — full Project object is stored as-is
      projects: 'id, name, createdAt, updatedAt',
    })
  }
}

export const db = new SeatingChartDB()
