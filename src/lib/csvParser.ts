import Papa from 'papaparse'

export interface CSVGuestRow {
  name: string
  group?: string
  notes?: string
}

export interface CSVParseResult {
  guests: CSVGuestRow[]
  skipped: number
}

/** Parse a CSV file for guest import. Finds name/group/notes columns
 *  case-insensitively. Skips rows with no name and rows whose name
 *  already exists in `existingNames`. */
export function parseGuestCSV(
  file: File,
  existingNames: Set<string>,
): Promise<CSVParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const guests: CSVGuestRow[] = []
        let skipped = 0
        // Track names seen in this import to catch intra-file dupes
        const seen = new Set<string>(existingNames)

        for (const row of data) {
          const keys = Object.keys(row)
          const find = (col: string) =>
            keys.find((k) => k.trim().toLowerCase() === col)

          const nameKey = find('name')
          const groupKey = find('group')
          const notesKey = find('notes')

          const name = nameKey ? row[nameKey].trim() : ''
          if (!name) { skipped++; continue }

          const nameLower = name.toLowerCase()
          if (seen.has(nameLower)) { skipped++; continue }

          seen.add(nameLower)
          guests.push({
            name,
            group: groupKey ? row[groupKey].trim() || undefined : undefined,
            notes: notesKey ? row[notesKey].trim() || undefined : undefined,
          })
        }

        resolve({ guests, skipped })
      },
      error: reject,
    })
  })
}
