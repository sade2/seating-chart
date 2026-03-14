import { useEffect, useRef, useState } from 'react'

export type ContextMenuTarget =
  | { type: 'canvas' }
  | { type: 'table'; tableId: string }
  | { type: 'seat'; seatId: string }

export interface ContextMenuInfo {
  screenX: number
  screenY: number
  worldX: number
  worldY: number
  target: ContextMenuTarget
}

interface CanvasContextMenuProps extends ContextMenuInfo {
  onClose: () => void
  onNewTable: (worldX: number, worldY: number) => void
  onNewGuest: () => void
  onEditTable: (tableId: string) => void
}

export default function CanvasContextMenu({
  screenX,
  screenY,
  worldX,
  worldY,
  target,
  onClose,
  onNewTable,
  onNewGuest,
  onEditTable,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [submenuOpen, setSubmenuOpen] = useState(false)

  // Close on outside mousedown only.
  // We intentionally do NOT listen to 'contextmenu' here: adding a document
  // contextmenu listener causes a race where the close fires in the same
  // batched render as the open, so the menu never appears on re-open.
  // The mousedown that precedes a right-click already closes the old menu,
  // and then the contextmenu event opens the new one in a separate render.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Position: flip left/up if near viewport edge
  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 50,
    ...(screenX > window.innerWidth - 200
      ? { right: window.innerWidth - screenX }
      : { left: screenX }),
    ...(screenY > window.innerHeight - 160
      ? { bottom: window.innerHeight - screenY }
      : { top: screenY }),
  }

  return (
    <div ref={menuRef} style={style} className="w-44 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
      {/* New > with hover submenu */}
      <div
        className="relative"
        onMouseEnter={() => setSubmenuOpen(true)}
        onMouseLeave={() => setSubmenuOpen(false)}
      >
        <button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
          New
          <svg className="h-3 w-3 text-slate-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2l4 4-4 4" />
          </svg>
        </button>

        {submenuOpen && (
          <>
            {/* Transparent bridge: fills the gap between parent row and submenu so
                onMouseLeave never fires while the cursor moves between them. */}
            <div className="absolute left-full top-0 h-full w-2" />
            <div className="absolute left-full top-0 ml-2 w-36 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
              <button
                onClick={() => { onClose(); onNewTable(worldX, worldY) }}
                className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                Table
              </button>
              <button
                onClick={() => { onClose(); onNewGuest() }}
                className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                Guest
              </button>
            </div>
          </>
        )}
      </div>

      {/* Table-specific: Edit Table */}
      {target.type === 'table' && (
        <button
          onClick={() => { onClose(); onEditTable(target.tableId) }}
          className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
        >
          Edit Table
        </button>
      )}

      {/* Seat-specific: Assign Guest (placeholder, not wired up) */}
      {target.type === 'seat' && (
        <button
          disabled
          className="flex w-full cursor-not-allowed items-center px-3 py-2 text-left text-sm text-slate-400"
        >
          Assign Guest
        </button>
      )}
    </div>
  )
}
