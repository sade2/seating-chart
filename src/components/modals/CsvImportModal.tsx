import { useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import Modal from '../ui/Modal'
import { parseGuestCSV } from '../../lib/csvParser'
import type { CSVGuestRow } from '../../lib/csvParser'

interface CsvImportModalProps {
  onClose: () => void
  onImported: (toastMessage: string) => void
}

export default function CsvImportModal({ onClose, onImported }: CsvImportModalProps) {
  const project = useProjectStore((s) => s.project)
  const addGuest = useProjectStore((s) => s.addGuest)

  const [view, setView] = useState<'upload' | 'preview'>('upload')
  const [isParsing, setIsParsing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [parsedValid, setParsedValid] = useState<CSVGuestRow[]>([])
  const [parsedSkipped, setParsedSkipped] = useState(0)
  const [parseError, setParseError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setIsParsing(true)
    setParseError(null)
    const existingNames = new Set((project?.guests ?? []).map((g) => g.name.toLowerCase()))
    try {
      const { guests: rows, skipped } = await parseGuestCSV(file, existingNames)
      setParsedValid(rows)
      setParsedSkipped(skipped)
      setIsParsing(false)
      setView('preview')
    } catch {
      setIsParsing(false)
      setParseError('Failed to parse CSV — check the file format.')
    }
  }

  function handleDownloadTemplate() {
    const csv = 'name,group,notes\nJane Smith,Smith Family,Vegetarian\nJohn Doe,Doe Family,\nAlice Johnson,,Gluten-free\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'guest-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport() {
    for (const row of parsedValid) {
      await addGuest({
        id: crypto.randomUUID(),
        name: row.name,
        group: row.group,
        notes: row.notes,
        seatId: null,
      })
    }
    const skipped = parsedSkipped
    const count = parsedValid.length
    const msg =
      count === 0
        ? `No new guests imported (${skipped} skipped)`
        : skipped > 0
        ? `Imported ${count} guest${count !== 1 ? 's' : ''} (${skipped} skipped)`
        : `Imported ${count} guest${count !== 1 ? 's' : ''}`
    onImported(msg)
  }

  return (
    <Modal title="Import Guests from CSV" onClose={onClose}>
      {view === 'upload' ? (
        <div>
          {/* Instructions */}
          <p className="mb-3 text-sm text-slate-600">
            Upload a CSV file with your guest list. The following columns are supported:
          </p>
          <table className="mb-4 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-1 pr-3 text-left font-semibold text-slate-600">Column</th>
                <th className="py-1 pr-3 text-left font-semibold text-slate-600">Required</th>
                <th className="py-1 text-left font-semibold text-slate-600">Description</th>
              </tr>
            </thead>
            <tbody className="text-slate-500">
              <tr>
                <td className="py-1 pr-3 font-mono">name</td>
                <td>Yes</td>
                <td>Guest's full name</td>
              </tr>
              <tr>
                <td className="py-1 pr-3 font-mono">group</td>
                <td>No</td>
                <td>Group or family name</td>
              </tr>
              <tr>
                <td className="py-1 pr-3 font-mono">notes</td>
                <td>No</td>
                <td>Dietary restrictions, etc.</td>
              </tr>
            </tbody>
          </table>

          {/* Template download */}
          <button onClick={handleDownloadTemplate} className="mb-4 text-xs text-indigo-600 hover:underline">
            Download Template CSV
          </button>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-slate-400'
            }`}
          >
            {isParsing ? (
              <svg className="mx-auto h-5 w-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-600">Drop a CSV file here or click to browse</p>
                <p className="mt-1 text-xs text-slate-400">Accepts .csv files</p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          {parseError && (
            <p className="mt-2 text-xs text-red-600">{parseError}</p>
          )}
        </div>
      ) : (
        <div>
          {/* Summary */}
          <p className="mb-3 text-sm text-slate-700">
            Found <span className="font-semibold">{parsedValid.length}</span> guest{parsedValid.length !== 1 ? 's' : ''}
            {parsedSkipped > 0 && (
              <span className="text-slate-500"> ({parsedSkipped} will be skipped — already in your list or missing a name)</span>
            )}
          </p>

          {/* Preview table */}
          <div className="mb-4 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Group</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Notes</th>
                </tr>
              </thead>
              <tbody>
                {parsedValid.slice(0, 10).map((g, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-1.5 text-slate-800">{g.name}</td>
                    <td className="px-3 py-1.5 text-slate-500">{g.group ?? ''}</td>
                    <td className="px-3 py-1.5 text-slate-500">{g.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedValid.length > 10 && (
              <p className="px-3 py-2 text-xs text-slate-400">…and {parsedValid.length - 10} more</p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setView('upload')}
              className="text-xs text-slate-500 underline hover:text-slate-700"
            >
              Choose Different File
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={parsedValid.length === 0}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                Import {parsedValid.length} Guest{parsedValid.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
