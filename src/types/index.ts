export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  room: Room
  tables: Table[]
  guests: Guest[]
}

export interface Room {
  widthFt: number
  heightFt: number
  pixelsPerFoot: number
}

export type TableType = 'round' | 'rectangular' | 'square'

export interface Table {
  id: string
  label: string
  type: TableType
  sizeFt: number
  widthFt?: number  // rectangular only (~2.5ft)
  x: number         // feet from room origin
  y: number         // feet from room origin
  rotation: number  // degrees
  seats: Seat[]
}

export interface Seat {
  id: string
  tableId: string
  index: number
  guestId: string | null
}

export interface Guest {
  id: string
  name: string
  group?: string
  notes?: string
  seatId: string | null
  plusOneOf?: string | null  // id of the invited guest; null/undefined for regular guests
}

// Table size presets with seat count recommendations
export interface TablePreset {
  type: TableType
  sizeFt: number
  widthFt?: number
  label: string
  minSeats: number
  recommendedSeats: number
  maxSeats: number
}

export const TABLE_PRESETS: TablePreset[] = [
  { type: 'round',        sizeFt: 4,   label: 'Round 4ft (48in)', minSeats: 4, recommendedSeats: 5,  maxSeats: 6  },
  { type: 'round',        sizeFt: 5,   label: 'Round 5ft (60in)', minSeats: 6, recommendedSeats: 7,  maxSeats: 8  },
  { type: 'round',        sizeFt: 6,   label: 'Round 6ft (72in)', minSeats: 8, recommendedSeats: 9,  maxSeats: 10 },
  { type: 'rectangular',  sizeFt: 6, widthFt: 2.5, label: 'Rect 6ft',          minSeats: 6, recommendedSeats: 6,  maxSeats: 8  },
  { type: 'rectangular',  sizeFt: 8, widthFt: 2.5, label: 'Rect 8ft',          minSeats: 8, recommendedSeats: 8,  maxSeats: 10 },
  { type: 'square',       sizeFt: 3,   label: 'Square 3ft (36in)', minSeats: 2, recommendedSeats: 4, maxSeats: 4  },
  { type: 'square',       sizeFt: 4,   label: 'Square 4ft (48in)', minSeats: 4, recommendedSeats: 4, maxSeats: 6  },
]
